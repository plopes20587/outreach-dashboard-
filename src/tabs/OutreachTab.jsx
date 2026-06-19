import { useState } from "react";
import { api } from "../lib/api";
import Card from "../components/Card";
import Field from "../components/Field";
import Button from "../components/Button";
import Badge from "../components/Badge";
import FitBar from "../components/FitBar";
import ContactCard from "../components/ContactCard";
import PromptBox from "../components/PromptBox";

function initContact() {
  return {
    name: "", company: "", title: "", location: "",
    email: "", linkedin: "", contactType: "", leadType: "",
    status: "Did not send",
  };
}

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

// Suggest which Claude.ai reference template the outreach-composer skill should
// lean on, based on contact type first, then lead temperature.
function suggestTemplate(contact) {
  if (contact.contactType === "Boss Hunt")     return "Boss Hunting Playbook";
  if (contact.contactType === "Informational") return "Informational Interview";
  if (contact.leadType === "Warm" || contact.leadType === "Warm-ish") {
    return "Warm Outreach Strategy";
  }
  return "Cold Outreach Strategy";
}

// Builds the structured prompt that Pat copies into his Claude.ai project, where
// the outreach-composer skill + reference templates actually write the message.
// This app intentionally does NOT generate the message itself (CLAUDE.md Hard
// Rule #9). `fit` is present for job-based contacts (UC1); `research` is present
// for researched founders/CEOs (UC2). Both are optional.
function buildOutreachPrompt(contact, fit, research) {
  const lines = [];

  let opener = `Draft an outreach message for ${contact.name || "this contact"}`;
  if (contact.title)   opener += `, ${contact.title}`;
  if (contact.company) opener += ` at ${contact.company}`;
  opener += ".";
  lines.push(opener);

  if (contact.contactType) lines.push(`Contact type: ${contact.contactType}.`);
  if (contact.leadType)    lines.push(`Lead type: ${contact.leadType}.`);
  if (contact.location)    lines.push(`Location: ${contact.location}.`);
  if (contact.linkedin)    lines.push(`LinkedIn: ${contact.linkedin}.`);

  if (fit?.summary) {
    lines.push("", `Fit context (from the job description): ${fit.summary}`);
    if (fit.strengths?.length) {
      lines.push(`Why it fits: ${fit.strengths.join("; ")}.`);
    }
  }

  if (research?.research_notes) {
    lines.push("", `Research on this person: ${research.research_notes}`);
  }
  if (research?.hook) {
    lines.push(`Specific hook to open with: ${research.hook}`);
  }

  lines.push(
    "",
    `Suggested template: ${suggestTemplate(contact)}.`,
    "Use my outreach-composer skill and the suggested reference template to write the message.",
  );

  return lines.join("\n");
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
  const [pushing, setPushing] = useState(false);
  const [notionStatus, setNotionStatus] = useState(null);
  const [outreachPrompt, setOutreachPrompt] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null);
  // Open/closed state for the two optional helper panels. Both start collapsed
  // so the always-visible Contact card is the immediate focus -- the right
  // default for logging a freelance lead (CEO/founder from Crunchbase, Product
  // Hunt, etc.) where there is no job description. To make the JD-first flow
  // open by default instead, change these initial values to `true`.
  const [jdOpen, setJdOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  // "Research a person" panel (UC2: founders/CEOs from Product Hunt, Crunchbase).
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchMode, setResearchMode] = useState("url"); // "url" | "name"
  const [researchUrl, setResearchUrl] = useState("");
  const [researchName, setResearchName] = useState("");
  const [researchCompany, setResearchCompany] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchData, setResearchData] = useState(null); // { research_notes, hook }
  const [researchError, setResearchError] = useState(null);

  async function handleResearch() {
    const payload =
      researchMode === "url"
        ? { url: researchUrl.trim() }
        : { name: researchName.trim(), company: researchCompany.trim() };
    if (researchMode === "url" ? !payload.url : !payload.name) return;

    setResearching(true);
    setResearchError(null);
    try {
      const data = await api.researchPerson(payload);
      setContact((c) => ({
        ...c,
        name:     data.name     || c.name,
        title:    data.title    || c.title,
        company:  data.company  || c.company,
        location: data.location || c.location,
        linkedin: researchMode === "url" && researchUrl.includes("linkedin.com/in/")
          ? researchUrl.trim()
          : c.linkedin,
      }));
      setResearchData({ research_notes: data.research_notes, hook: data.hook });
    } catch (err) {
      setResearchError(
        err.message === "not_found"
          ? "Could not find this person. Try a different URL or add a company."
          : err.message || "Research failed.",
      );
    } finally {
      setResearching(false);
    }
  }

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

    // 2. LinkedIn -- slow and unreliable, so it only augments. Errors are
    // swallowed: a LinkedIn miss should never wipe out Hunter's results.
    if (hasCompany) {
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

  async function handleFetchLinkedIn(url) {
    if (!url || !url.includes("linkedin.com/in/")) return;
    setFetching(true);
    setFetchStatus(null);
    try {
      const data = await api.fetchLinkedIn(url);
      setContact((c) => ({
        ...c,
        name:     data.name     || c.name,
        title:    data.title    || c.title,
        company:  data.company  || c.company,
        location: data.location || c.location,
      }));
      setFetchStatus("ok");
    } catch {
      setFetchStatus("error");
    } finally {
      setFetching(false);
    }
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
      await handleFetchLinkedIn(result.linkedin);
    }
  }

  async function handleFetchManual() {
    if (!manualUrl.trim()) return;
    setContact((c) => ({ ...c, linkedin: manualUrl }));
    await handleFetchLinkedIn(manualUrl);
  }

  async function handlePushNotion() {
    setPushing(true);
    setNotionStatus(null);
    try {
      await api.pushNotion(contact);
      setNotionStatus("ok");
    } catch (err) {
      console.error("pushNotion:", err.message);
      setNotionStatus(err.message || "error");
    } finally {
      setPushing(false);
    }
  }

  function handleDraftOutreach() {
    setOutreachPrompt(buildOutreachPrompt(contact, fit, researchData));
  }

  function handleReset() {
    setContact(initContact());
    setSelIdx(null);
    setOutreachPrompt(null);
    setNotionStatus(null);
    setFetchStatus(null);
    setResearchData(null);
  }

  const fetchBadge =
    fetching                ? <Badge variant="amber">Fetching...</Badge> :
    fetchStatus === "ok"    ? <Badge variant="green">Profile loaded</Badge> :
    fetchStatus === "error" ? <Badge variant="red">Could not load -- fill in manually</Badge> :
    null;

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

      {/* Optional helper: find contacts (works with or without a JD) */}
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
        {hunterError && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {hunterError}
          </div>
        )}
      </Card>

      {/* Optional helper: research a person (founders/CEOs from Product Hunt, Crunchbase) */}
      <Card
        title="Research a person"
        optional
        collapsible
        open={researchOpen}
        onToggle={setResearchOpen}
      >
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <Button
            variant={researchMode === "url" ? "blue" : "default"}
            onClick={() => setResearchMode("url")}
          >
            By URL
          </Button>
          <Button
            variant={researchMode === "name" ? "blue" : "default"}
            onClick={() => setResearchMode("name")}
          >
            By name + company
          </Button>
        </div>

        {researchMode === "url" ? (
          <Field label="Profile or company URL (Product Hunt, Crunchbase, site, LinkedIn)">
            <input
              value={researchUrl}
              onChange={(e) => setResearchUrl(e.target.value)}
              placeholder="https://www.producthunt.com/@... or company site"
            />
          </Field>
        ) : (
          <div className="grid-2">
            <Field label="Name">
              <input
                value={researchName}
                onChange={(e) => setResearchName(e.target.value)}
                placeholder="First Last"
              />
            </Field>
            <Field label="Company">
              <input
                value={researchCompany}
                onChange={(e) => setResearchCompany(e.target.value)}
                placeholder="Acme Corp"
              />
            </Field>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 10 }}>
          <Button
            variant="green"
            onClick={handleResearch}
            disabled={
              researching ||
              (researchMode === "url" ? !researchUrl.trim() : !researchName.trim())
            }
          >
            {researching ? "Researching..." : "Research person"}
          </Button>
        </div>

        {researchError && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {researchError}
          </div>
        )}

        {researchData && (researchData.research_notes || researchData.hook) && (
          <>
            <div className="divider" />
            {researchData.research_notes && (
              <div className="fit-group">
                <div className="fit-group-label">Research notes</div>
                <div className="summary-box">{researchData.research_notes}</div>
              </div>
            )}
            {researchData.hook && (
              <div className="fit-group fit-group-strengths">
                <div className="fit-group-label">Outreach hook</div>
                <div className="summary-box">{researchData.hook}</div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Search results */}
      {searchDone && searchResults.length > 0 && (
        <div>
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
                None of these -- enter a LinkedIn URL manually
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state notice */}
      {searchDone && !searching && searchResults.length === 0 && !showManual && (
        <div className="notice notice-error">
          No contacts found for {company || domain}. Try the manual URL entry below.
        </div>
      )}

      {/* Manual LinkedIn URL entry */}
      {(showManual || (searchDone && searchResults.length === 0)) && (
        <Card>
          <Field label="LinkedIn URL">
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
                {fetching ? "Fetching..." : "Fetch profile"}
              </Button>
            </div>
          </Field>
        </Card>
      )}

      {/* Always-visible core: the contact card itself */}
      <Card title="Contact">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="grid-2">
            <Field label="Contact name *">
              <input
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                placeholder="First Last"
              />
            </Field>
            <Field label="Company *">
              <input
                value={contact.company}
                onChange={(e) => setContact((c) => ({ ...c, company: e.target.value }))}
                placeholder="Acme Corp"
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Title">
              <input
                value={contact.title}
                onChange={(e) => setContact((c) => ({ ...c, title: e.target.value }))}
                placeholder="Head of Design"
              />
            </Field>
            <Field label="Location">
              <input
                value={contact.location}
                onChange={(e) => setContact((c) => ({ ...c, location: e.target.value }))}
                placeholder="New York, NY"
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Email (from Hunter.io)">
              <input
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="LinkedIn URL -- paste and press Enter to auto-fill" badge={fetchBadge}>
              <input
                value={contact.linkedin}
                onChange={(e) => {
                  setContact((c) => ({ ...c, linkedin: e.target.value }));
                  if (!e.target.value) setFetchStatus(null);
                }}
                onBlur={(e) => handleFetchLinkedIn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleFetchLinkedIn(contact.linkedin);
                  }
                }}
                placeholder="https://linkedin.com/in/..."
              />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Contact type">
              <select
                value={contact.contactType}
                onChange={(e) => setContact((c) => ({ ...c, contactType: e.target.value }))}
              >
                <option value="">Select...</option>
                <option>Hiring Manager</option>
                <option>Boss Hunt</option>
                <option>Recruiter</option>
                <option>Referral</option>
                <option>Informational</option>
                <option>Freelance/Client</option>
              </select>
            </Field>
            <Field label="Lead type">
              <select
                value={contact.leadType}
                onChange={(e) => setContact((c) => ({ ...c, leadType: e.target.value }))}
              >
                <option value="">Select...</option>
                <option>Cold</option>
                <option>Warm-ish</option>
                <option>Warm</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={contact.status}
                onChange={(e) => setContact((c) => ({ ...c, status: e.target.value }))}
              >
                <option>Did not send</option>
                <option>Email Sent</option>
                <option>Follow-up Sent</option>
                <option>Responded</option>
                <option>No response</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="divider" />

        <div className="btn-row">
          <Button
            variant="green"
            onClick={handlePushNotion}
            disabled={pushing || !contact.name.trim() || !contact.company.trim()}
          >
            {pushing ? "Pushing..." : "Push to Notion"}
          </Button>
          <Button variant="purple" onClick={handleDraftOutreach}>
            Draft outreach
          </Button>
          <Button variant="default" onClick={handleReset}>
            Reset
          </Button>
        </div>

        {notionStatus === "ok" && (
          <div className="notice notice-success" style={{ marginTop: 10 }}>
            Contact pushed to Notion.
          </div>
        )}
        {notionStatus && notionStatus !== "ok" && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {notionStatus}
          </div>
        )}

        {outreachPrompt && (
          <div style={{ marginTop: 14 }}>
            <PromptBox text={outreachPrompt} />
          </div>
        )}
      </Card>

    </div>
  );
}
