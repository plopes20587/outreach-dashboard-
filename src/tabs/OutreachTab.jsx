import { useState } from "react";
import { api } from "../lib/api";
import Card from "../components/Card";
import Field from "../components/Field";
import Button from "../components/Button";
import Badge from "../components/Badge";
import FitBar from "../components/FitBar";
import ContactCard from "../components/ContactCard";
import ContactPanel from "../components/ContactPanel";
import { initContact } from "../lib/contact";
import { useLinkedInFetch } from "../hooks/useLinkedInFetch";

// Maps a job title to a relevance score + category. This is the ranking brain
// for the contact search. It NEVER drops a title -- anything that does not match
// a known design/recruiting/founder pattern falls through to "Other" with a low
// score, so every named person in the org still surfaces (just ranked lower).
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

// Builds a unified contact result from a Hunter.io email record. Returns null
// only when there is no usable name (a contact we cannot label "First Last" is
// not actionable). A missing position is allowed -- Hunter often returns
// position: null, and those still surface as "Other".
function classifyContact(person, targetTitles = []) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  if (!fullName) return null;

  const title = person.position || "";
  let { score, contactType } = classifyTitle(title);

  const t = title.toLowerCase();
  targetTitles.forEach(target => {
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

// Normalizes a /api/search-linkedin result into the same unified shape Hunter
// produces, scoring it through classifyTitle so both sources rank on one scale.
// Returns null when there is no usable name.
function mapLinkedInResult(r) {
  const name = (r.name || "").trim();
  if (!name) return null;

  const { score, contactType } = classifyTitle(r.title || "");
  return {
    name,
    email: "",
    title: r.title || "",
    linkedin: r.linkedin || "",
    // Prefer the server's contact_type when present; otherwise use ours.
    contact_type: r.contact_type || contactType,
    snippet: r.snippet || "",
    score,
  };
}

// Merges two contact lists, de-duplicating by email, then normalized LinkedIn
// URL, then lowercased name. On a collision the record that already has an email
// (Hunter) wins, and any fields it is missing are backfilled from the other.
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
    // Keep the one with an email; backfill missing fields from the other.
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

const FIT_BADGE = { strong: "green", moderate: "amber", mismatch: "red" };

export default function OutreachTab() {
  const [jd, setJd] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [fit, setFit] = useState(null);
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [searching, setSearching] = useState(false);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchDone, setSearchDone] = useState(false);
  const [hunterError, setHunterError] = useState(null);
  const [selIdx, setSelIdx] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [contact, setContact] = useState(initContact());
  // One LinkedIn fetch shared by search-select, manual URL, and the contact
  // card's own field, so the "Fetching / Profile loaded" badge fires for all.
  const { fetching, fetchStatus, setFetchStatus, fetchLinkedIn } = useLinkedInFetch(setContact);
  // Open/closed state for the two optional helper panels. Both start collapsed
  // so the always-visible Contact card is the immediate focus. To make the
  // JD-first flow open by default instead, change these initial values to `true`.
  const [jdOpen, setJdOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  async function handleAnalyze() {
    if (!jd.trim()) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setFit(null);
    setSearchResults([]);
    setSearchDone(false);
    setHunterError(null);
    try {
      const data = await api.analyzeJD(jd);
      setFit(data);
      if (data.company) {
        setCompany(data.company);
        setDomain(data.company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com");
        // Surface the contact-search panel once we have a company to search.
        setFindOpen(true);
      }
    } catch (err) {
      setAnalyzeError(err.message || "Failed to analyze job description.");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleClearJD() {
    setJd("");
    setFit(null);
    setAnalyzeError(null);
    setSearchResults([]);
    setSearchDone(false);
    setHunterError(null);
    setSelIdx(null);
    setShowManual(false);
  }

  // Single search across both sources. Hunter (fast) runs first and its results
  // render immediately; LinkedIn (slow, web-search based, often empty) runs after
  // and is merged in when it arrives. Either a domain (Hunter) or a company
  // (LinkedIn) is enough to search.
  async function handleSearch() {
    const hasDomain = domain.trim();
    const hasCompany = company.trim();
    if (!hasDomain && !hasCompany) return;

    setSearching(true);
    setHunterError(null);
    setSearchDone(false);
    setSelIdx(null);
    setSearchResults([]);
    setFetchStatus(null); // clear any stale manual look-up feedback for the new search

    const sortByScore = (list) => [...list].sort((a, b) => b.score - a.score);
    let merged = [];

    // 1. Hunter.io -- fast, has emails. Show its results right away.
    if (hasDomain) {
      try {
        const data = await api.findContacts(domain);
        merged = sortByScore(
          (data.data?.emails || [])
            .map((p) => classifyContact(p, fit?.search_titles || []))
            .filter(Boolean),
        );
        setSearchResults(merged);
        setSearchDone(true);
      } catch (err) {
        setHunterError(err.message || "Hunter search failed.");
      }
    }

    // 2. LinkedIn -- slow, unreliable, and a paid web search. It now runs ONLY
    // as a fallback: when Hunter returned fewer than 2 contacts (found nothing or
    // just one, errored, or there was no domain to query). This avoids paying for
    // a usually-empty web search when Hunter already gave enough to work with.
    // Errors are swallowed: a LinkedIn miss should never wipe out Hunter's results.
    if (hasCompany && merged.length < 2) {
      setLinkedinLoading(true);
      try {
        const data = await api.searchLinkedIn(company, fit?.search_titles || []);
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

  async function handleSelectResult(idx) {
    const result = searchResults[idx];
    setSelIdx(idx);
    setContact((c) => ({
      ...c,
      name:        result.name         || c.name,
      title:       result.title        || c.title,
      email:       result.email        || c.email,
      linkedin:    result.linkedin     || c.linkedin,
      contactType: result.contact_type || c.contactType,
      company:     company             || c.company,
    }));
    if (result.linkedin && result.linkedin.includes("linkedin.com/in/")) {
      await fetchLinkedIn(result.linkedin);
    }
  }

  async function handleFetchManual() {
    if (!manualUrl.trim()) return;
    setContact((c) => ({ ...c, linkedin: manualUrl }));
    await fetchLinkedIn(manualUrl);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Optional helper: analyze a job description */}
      <Card
        title="Analyze a job description"
        optional
        collapsible
        open={jdOpen}
        onToggle={setJdOpen}
      >
        <Field>
          <textarea
            rows={7}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description here..."
          />
        </Field>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <Button
            variant="blue"
            onClick={handleAnalyze}
            disabled={analyzing || !jd.trim()}
          >
            {analyzing ? "Analyzing..." : "Analyze fit"}
          </Button>
          <Button variant="default" onClick={handleClearJD}>
            Clear
          </Button>
        </div>
        {analyzeError && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {analyzeError}
          </div>
        )}

        {/* Fit results render inline once analysis completes */}
        {fit && (
          <>
            <div className="divider" />
            <FitBar score={fit.fit_score} />
            <div className="tags-row">
              <Badge variant={FIT_BADGE[fit.industry_fit] || "neutral"}>
                {fit.industry} -- {fit.industry_fit}
              </Badge>
              <Badge variant="blue">{fit.role_level}</Badge>
            </div>
            {(fit.strengths?.length > 0) && (
              <div className="fit-group fit-group-strengths">
                <div className="fit-group-label">Why it fits</div>
                <ul className="fit-bullets">
                  {fit.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {(fit.gaps?.length > 0) && (
              <div className="fit-group fit-group-gaps">
                <div className="fit-group-label">Watch-outs</div>
                <ul className="fit-bullets">
                  {fit.gaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            )}
            <div className="summary-box">{fit.summary}</div>
          </>
        )}
      </Card>

      {/* Optional helper: find contacts (works with or without a JD). Everything
          this action produces -- results, the empty state, and the manual URL
          fallback (with its own feedback) -- lives inside this card so it is
          always clear which action caused a given message. This mirrors how the
          Analyze card shows its fit results inline. */}
      <Card
        title="Find contacts"
        optional
        collapsible
        open={findOpen}
        onToggle={setFindOpen}
      >
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

        {/* Error from the Hunter.io search itself */}
        {hunterError && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {hunterError}
          </div>
        )}

        {/* Search results */}
        {searchDone && searchResults.length > 0 && (
          <>
            <div className="divider" />
            <div className="results-header">
              {searchResults.length} contact(s) found -- select one to populate the profile below
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
                  onSelect={() => handleSelectResult(i)}
                />
              ))}
            </div>
            {!showManual && (
              <div style={{ marginTop: 8 }}>
                <Button variant="default" onClick={() => setShowManual(true)}>
                  None of these -- add a LinkedIn URL manually
                </Button>
              </div>
            )}
          </>
        )}

        {/* Empty state: a normal search outcome, not an error -- neutral styling.
            Hidden once a profile has been loaded (the prompt has been fulfilled). */}
        {searchDone && !searching && searchResults.length === 0 && fetchStatus !== "ok" && (
          <div className="notice notice-info" style={{ marginTop: 10 }}>
            No contacts found for {company || domain}. Add someone by LinkedIn URL below.
          </div>
        )}

        {/* Manual LinkedIn URL entry (fallback when search misses or is skipped),
            with its own success/error feedback grouped right here. */}
        {(showManual || (searchDone && searchResults.length === 0)) && (
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
                  onClick={handleFetchManual}
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
        )}
      </Card>

      {/* Always-visible core: the shared contact card. Fed by the search flow
          above; `fit` supplies job context to the Draft outreach prompt. */}
      <ContactPanel
        contact={contact}
        setContact={setContact}
        fit={fit}
        fetching={fetching}
        fetchStatus={fetchStatus}
        setFetchStatus={setFetchStatus}
        onFetchLinkedIn={fetchLinkedIn}
        onReset={() => setSelIdx(null)}
      />

    </div>
  );
}
