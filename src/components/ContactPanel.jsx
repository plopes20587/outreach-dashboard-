import { useState } from "react";
import { api } from "../lib/api";
import { initContact } from "../lib/contact";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import Badge from "./Badge";
import PromptBox from "./PromptBox";

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

// The always-visible Contact card, shared by both tabs. Contact state is lifted
// to the parent tab (which populates it from search results or person research)
// and passed in via `contact`/`setContact`. `fit` (UC1) and `research` (UC2) are
// optional context sources for the Draft outreach prompt. `onReset` lets the
// parent clear any tab-specific state (search selection, research notes) when the
// user resets the contact card. The LinkedIn fetch itself lives in the parent's
// useLinkedInFetch hook so its badge is shared across every fetch trigger; the
// panel just renders that status and calls `onFetchLinkedIn` from its own field.
export default function ContactPanel({
  contact, setContact, fit, research, onReset,
  fetching, fetchStatus, setFetchStatus, onFetchLinkedIn,
}) {
  const [pushing, setPushing] = useState(false);
  const [notionStatus, setNotionStatus] = useState(null);
  const [outreachPrompt, setOutreachPrompt] = useState(null);

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
    setOutreachPrompt(buildOutreachPrompt(contact, fit, research));
  }

  function handleReset() {
    setContact(initContact());
    setOutreachPrompt(null);
    setNotionStatus(null);
    setFetchStatus(null);
    onReset?.();
  }

  const fetchBadge =
    fetching                ? <Badge variant="amber">Fetching...</Badge> :
    fetchStatus === "ok"    ? <Badge variant="green">Profile loaded</Badge> :
    fetchStatus === "error" ? <Badge variant="red">Could not load -- fill in manually</Badge> :
    null;

  return (
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
              onBlur={(e) => onFetchLinkedIn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onFetchLinkedIn(contact.linkedin);
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
  );
}
