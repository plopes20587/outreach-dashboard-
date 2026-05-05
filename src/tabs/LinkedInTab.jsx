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

function scoreContact(person, targetTitles = []) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  const title = person.position || "";
  const titleLower = title.toLowerCase();
  let score = 0;
  let contactType = "Referral";

  if (/design|ux|ui|product/i.test(title)) score += 3;
  if (/head|director|vp|chief|lead|principal|staff/i.test(title)) {
    score += 2;
    contactType = "Hiring Manager";
  }
  if (/recruit|talent|people|hr/i.test(title)) {
    score += 2;
    contactType = "Recruiter";
  }
  if (/founder|ceo|cto|cpo/i.test(title)) {
    score += 1;
    contactType = "Boss Hunt";
  }
  targetTitles.forEach((t) => {
    if (titleLower.includes(t.toLowerCase().split(" ")[0])) score += 1;
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

function buildOutreachPrompt(contact, fit) {
  let msg = `Draft an outreach message for ${contact.name || "this contact"}`;
  if (contact.title)   msg += `, ${contact.title}`;
  if (contact.company) msg += ` at ${contact.company}`;
  msg += ".";
  if (contact.contactType) msg += ` Contact type: ${contact.contactType}.`;
  if (contact.leadType)    msg += ` Lead type: ${contact.leadType}.`;
  if (contact.linkedin)    msg += ` LinkedIn: ${contact.linkedin}.`;
  if (contact.location)    msg += ` Location: ${contact.location}.`;
  if (fit?.summary)        msg += ` Fit context: ${fit.summary.substring(0, 300)}`;
  return msg;
}

const FIT_BADGE = { strong: "green", moderate: "amber", mismatch: "red" };

export default function LinkedInTab() {
  const [jd, setJd] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [fit, setFit] = useState(null);
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [searching, setSearching] = useState(false);
  const [hunterSearching, setHunterSearching] = useState(false);
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

  async function handleHunterSearch() {
    if (!domain.trim()) return;
    setHunterSearching(true);
    setHunterError(null);
    setSearchDone(false);
    setSelIdx(null);
    try {
      const data = await api.findContacts(domain);
      const scored = (data.data?.emails || [])
        .map((p) => scoreContact(p, fit?.search_titles || []))
        .filter((p) => p.name && p.title)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      setSearchResults(scored);
    } catch (err) {
      setHunterError(err.message || "Hunter search failed.");
    } finally {
      setHunterSearching(false);
      setSearchDone(true);
    }
  }

  async function handleLinkedInSearch() {
    if (!company.trim()) return;
    setSearching(true);
    setSearchDone(false);
    setSelIdx(null);
    try {
      const data = await api.searchLinkedIn(company, fit?.search_titles || []);
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("searchLinkedIn:", err.message);
      setSearchResults([]);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
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
    setOutreachPrompt(buildOutreachPrompt(contact, fit));
  }

  function handleReset() {
    setContact(initContact());
    setSelIdx(null);
    setOutreachPrompt(null);
    setNotionStatus(null);
    setFetchStatus(null);
  }

  const fetchBadge =
    fetching                ? <Badge variant="amber">Fetching...</Badge> :
    fetchStatus === "ok"    ? <Badge variant="green">Profile loaded</Badge> :
    fetchStatus === "error" ? <Badge variant="red">Could not load -- fill in manually</Badge> :
    null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Step 1: Job description */}
      <Card step={1} title="Job description">
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
      </Card>

      {/* Step 2: Fit analysis + contact search */}
      {fit && (
        <Card step={2} title="Fit analysis">
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
          <div className="divider" />
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
              onClick={handleHunterSearch}
              disabled={hunterSearching || !domain.trim()}
            >
              {hunterSearching ? "Searching..." : "Find people via Hunter.io"}
            </Button>
            <Button
              variant="blue"
              onClick={handleLinkedInSearch}
              disabled={searching || !company.trim()}
            >
              {searching ? "Searching..." : "Search LinkedIn (fallback)"}
            </Button>
          </div>
          {hunterError && (
            <div className="notice notice-error" style={{ marginTop: 10 }}>
              {hunterError}
            </div>
          )}
        </Card>
      )}

      {/* Search results */}
      {searchDone && searchResults.length > 0 && (
        <div>
          <div className="results-header">
            {searchResults.length} contact(s) found -- select one to populate the profile below
          </div>
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

      {/* Step 3: Contact profile */}
      <Card step={3} title="Contact profile">
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
