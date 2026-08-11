import { useState } from "react";
import { api } from "../lib/api";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import ContactCard from "./ContactCard";

// Maps a job title to a relevance score + category. Pure: it never drops a
// title, it only classifies. Anything unmatched falls through to "Other", and
// the result mappers below are what actually drop those.
function classifyTitle(title = "") {
  const designLeader =
    /(design|ux|user\s*experience)/i.test(title) &&
    /(head|director|vp|chief|lead|principal|staff|manager)/i.test(title);

  const creativeLeader =
    /(creative\s*director|head\s*of\s*creative|chief\s*creative)/i.test(title);

  const designIC =
    /(product\s*designer|ux\s*designer|ui\s*designer|senior\s*designer|interaction\s*designer|visual\s*designer|brand\s*designer)/i.test(title) ||
    (/(designer)/i.test(title) && !/(graphic|merchandise|fashion|interior|industrial|game)/i.test(title));

  const recruiter =
    /(recruit|talent\s*acquisition|sourcer|talent\s*partner)/i.test(title) &&
    !/(sales|finance|legal|operations|account|customer\s*success)\s*recruit/i.test(title);

  const informational =
    /(product\s*manager|product\s*lead|head\s*of\s*product|director\s*of\s*product|vp\s*of\s*product|chief\s*product)/i.test(title) ||
    /(design\s*ops|designops|design\s*operations)/i.test(title) ||
    /(ux\s*research|user\s*research|ux\s*researcher|user\s*researcher|design\s*research)/i.test(title) ||
    /(service\s*designer|content\s*designer|content\s*strategist|ux\s*writer)/i.test(title) ||
    /(design\s*technologist|design\s*engineer|prototyper)/i.test(title);

  const founder = /(founder|co-founder|ceo)/i.test(title);

  if (designLeader || creativeLeader) return { score: 100, contactType: "Hiring Manager" };
  if (designIC)                       return { score: 80,  contactType: "Referral" };
  if (recruiter)                      return { score: 70,  contactType: "Recruiter" };
  if (informational)                  return { score: 50,  contactType: "Informational" };
  if (founder)                        return { score: 40,  contactType: "Boss Hunt" };
  return { score: 10, contactType: "Other" };
}

// Hunter.io email record -> unified contact result. Dropped when there is no
// usable name, or when the title is not design-relevant: a company-wide search
// otherwise surfaces the whole org, which is mostly noise for design outreach.
function classifyContact(person, targetTitles = []) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  if (!fullName) return null;

  const title = person.position || "";
  let { score, contactType } = classifyTitle(title);
  if (contactType === "Other") return null;

  const t = title.toLowerCase();
  targetTitles.forEach((target) => {
    const keyword = target.toLowerCase().split(" ")[0];
    if (keyword && t.includes(keyword)) score += 5;
  });

  return {
    name: fullName,
    email: person.value || "",
    title,
    linkedin: person.linkedin || "",
    contact_type: contactType,
    snippet: person.department ? `Dept: ${person.department}` : "",
    score,
  };
}

// /api/search-linkedin result -> the same unified shape, scored through the same
// classifyTitle so both sources rank on one scale.
function mapLinkedInResult(r) {
  const name = (r.name || "").trim();
  if (!name) return null;

  const { score, contactType } = classifyTitle(r.title || "");
  const finalType = r.contact_type || contactType;
  if (finalType === "Other") return null;

  return {
    name,
    email: "",
    title: r.title || "",
    linkedin: r.linkedin || "",
    contact_type: finalType,
    snippet: r.snippet || "",
    score,
  };
}

// Merges two contact lists, de-duping by email, then normalized LinkedIn URL,
// then lowercased name. The record with an email (Hunter) wins a collision, and
// the other backfills whatever it is missing.
function mergeContacts(primary, secondary) {
  const byKey = new Map();

  const keyFor = (c) =>
    (c.email || "").toLowerCase().trim() ||
    (c.linkedin || "").toLowerCase().replace(/\/+$/, "").trim() ||
    (c.name || "").toLowerCase().trim();

  for (const c of [...primary, ...secondary]) {
    const key = keyFor(c);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
      continue;
    }
    const keep = existing.email ? existing : c;
    const other = existing.email ? c : existing;
    byKey.set(key, {
      ...keep,
      linkedin: keep.linkedin || other.linkedin,
      snippet:  keep.snippet  || other.snippet,
      title:    keep.title    || other.title,
    });
  }

  return [...byKey.values()];
}

// Card 3 of the single-page flow. Always visible. Every message this card's one
// action can produce renders inside it -- the search error, the results, the
// empty state, and the manual URL fallback with its own feedback -- so it is
// always obvious which action caused a given message.
export default function FindContacts({
  company, setCompany, domain, setDomain,
  searchTitles, onSelectContact,
  manualUrl, setManualUrl, onFetchManual,
  fetching, fetchStatus, setFetchStatus,
  searching, setSearching, searchResults, setSearchResults,
  searchDone, setSearchDone, searchError, setSearchError,
  selIdx, setSelIdx,
}) {
  const [linkedinLoading, setLinkedinLoading] = useState(false);

  // Hunter (fast, has emails) runs first and its results render immediately.
  // The LinkedIn web search is slow, unreliable, and paid, so it runs ONLY as a
  // fallback when Hunter returned fewer than 2 contacts. Its errors are
  // swallowed: a LinkedIn miss must never wipe out Hunter's results.
  async function handleSearch() {
    const hasDomain = domain.trim();
    const hasCompany = company.trim();
    if (!hasDomain && !hasCompany) return;

    setSearching(true);
    setSearchError(null);
    setSearchDone(false);
    setSelIdx(null);
    setSearchResults([]);
    setFetchStatus(null); // clear stale manual look-up feedback for the new search

    const sortByScore = (list) => [...list].sort((a, b) => b.score - a.score);
    let merged = [];

    if (hasDomain) {
      try {
        const data = await api.findContacts(domain);
        merged = sortByScore(
          (data.data?.emails || [])
            .map((p) => classifyContact(p, searchTitles || []))
            .filter(Boolean),
        );
        setSearchResults(merged);
        setSearchDone(true);
      } catch (err) {
        setSearchError(err.message || "Hunter search failed.");
      }
    }

    if (hasCompany && merged.length < 2) {
      setLinkedinLoading(true);
      try {
        const data = await api.searchLinkedIn(company, searchTitles || []);
        const linkedinResults = (Array.isArray(data) ? data : [])
          .map(mapLinkedInResult)
          .filter(Boolean);
        merged = sortByScore(mergeContacts(merged, linkedinResults));
        setSearchResults(merged);
      } catch (err) {
        console.error("searchLinkedIn:", err.message);
      } finally {
        setLinkedinLoading(false);
      }
    }

    setSearchDone(true);
    setSearching(false);
  }

  return (
    <Card title="Find contacts">
      <div className="grid-2" style={{ marginBottom: 10 }}>
        <Field label="Company">
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
          />
        </Field>
        <Field label="Company domain (for Hunter.io)">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acmecorp.com"
          />
        </Field>
      </div>
      <div className="btn-row">
        <Button
          variant="green"
          onClick={handleSearch}
          disabled={searching || (!domain.trim() && !company.trim())}
        >
          {searching ? "Searching..." : "Search"}
        </Button>
      </div>

      {searchError && (
        <div className="notice notice-error" style={{ marginTop: 10 }}>
          {searchError}
        </div>
      )}

      {searchDone && searchResults.length > 0 && (
        <>
          <div className="divider" />
          <div className="results-header">
            {searchResults.length} contact(s) found -- select one to populate the contact below
          </div>
          {linkedinLoading && (
            <div className="results-header" style={{ opacity: 0.6 }}>
              Also checking LinkedIn...
            </div>
          )}
          <div className="results-list">
            {searchResults.map((r, i) => (
              <ContactCard
                key={i}
                contact={r}
                selected={selIdx === i}
                onSelect={() => onSelectContact(i)}
              />
            ))}
          </div>
        </>
      )}

      {/* "No results" is a normal outcome, not a failure, so it uses the neutral
          notice style. Hidden once a profile has loaded, since the prompt it
          makes has been fulfilled by then. */}
      {searchDone && !searching && searchResults.length === 0 && fetchStatus !== "ok" && (
        <div className="notice notice-info" style={{ marginTop: 10 }}>
          No design or recruiting contacts found for {company || domain}. Add someone by LinkedIn URL below.
        </div>
      )}

      {/* Always rendered, not toggled: the manual URL is the reliable path when
          search misses, and hiding it behind a toggle buried the recovery. */}
      <div style={{ marginTop: 12 }}>
        <Field label="Add a contact by LinkedIn URL">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://linkedin.com/in/..."
            />
            <Button
              variant="green"
              onClick={onFetchManual}
              disabled={fetching || !manualUrl.trim()}
              style={{ flexShrink: 0 }}
            >
              {fetching ? "Looking up..." : "Look up profile"}
            </Button>
          </div>
        </Field>
        {fetchStatus === "ok" && (
          <div className="notice notice-success" style={{ marginTop: 10 }}>
            Profile loaded into the contact below.
          </div>
        )}
        {fetchStatus === "error" && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            Couldn't load that profile. Check the URL, or fill in the contact fields below.
          </div>
        )}
      </div>
    </Card>
  );
}
