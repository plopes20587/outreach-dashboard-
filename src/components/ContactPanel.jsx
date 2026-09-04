import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { buildResearchNotes } from "../lib/contact";
import { researchErrorMessage } from "../lib/contacts";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import Badge from "./Badge";

// Step 3 of the flow: the person. Everything known about a contact lives here --
// the editable fields, the research notes, and the Notion write. Research used
// to be its own card upstream, which meant a person's notes rendered in one
// place and the same person's title in another; the notes belong with the
// person, so the action and its output both moved here.
//
// Contact state is lifted to Dashboard (Find people populates it), and
// `onResearch` is Dashboard's shared research call so this panel and the direct
// look-up path hit the endpoint exactly one way. Loading and error for that call
// stay local, since nothing outside this card reacts to them.
export default function ContactPanel({
  contact, setContact,
  fetching, fetchStatus, setFetchStatus, onFetchLinkedIn,
  research, onResearch, personId,
  step, done, note,
}) {
  const [pushing, setPushing] = useState(false);
  const [notionStatus, setNotionStatus] = useState(null);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState(null);

  // These two describe the person in the card, so they cannot outlive them. When
  // Dashboard swaps the record for somebody else the anchor changes, and a
  // "Contact pushed to Notion" banner left over from the previous person would
  // read as if this one had been pushed.
  useEffect(() => {
    setNotionStatus(null);
    setResearchError(null);
  }, [personId]);

  async function handlePushNotion() {
    setPushing(true);
    setNotionStatus(null);
    try {
      // The research is composed into Notion's Notes property at push time, so
      // the reasoning behind an outreach survives in the tracker instead of
      // living only on this screen. Empty when nothing was researched, and the
      // serverless function omits the property in that case.
      await api.pushNotion({ ...contact, notes: buildResearchNotes(research) });
      setNotionStatus("ok");
    } catch (err) {
      console.error("pushNotion:", err.message);
      setNotionStatus(err.message || "error");
    } finally {
      setPushing(false);
    }
  }

  // A LinkedIn URL is the stronger signal when there is one, so it wins over
  // name + company. This is the same derivation the old Research card made from
  // its own inputs, sourced from the contact instead.
  async function handleResearch() {
    const url = contact.linkedin.trim();
    const payload = url
      ? { url }
      : { name: contact.name.trim(), company: contact.company.trim() };
    if (!url && !payload.name) return;

    setResearching(true);
    setResearchError(null);
    try {
      await onResearch(payload);
    } catch (err) {
      setResearchError(researchErrorMessage(err));
    } finally {
      setResearching(false);
    }
  }

  const fetchBadge =
    fetching                ? <Badge variant="amber">Fetching...</Badge> :
    fetchStatus === "ok"    ? <Badge variant="green">Profile loaded</Badge> :
    fetchStatus === "error" ? <Badge variant="red">Could not load -- fill in manually</Badge> :
    null;

  return (
    <Card title="Contact" step={step} done={done} note={note}>
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

      <div className="divider" />

      <div className="btn-row">
        <Button
          variant="blue"
          onClick={handleResearch}
          disabled={researching || (!contact.linkedin.trim() && !contact.name.trim())}
        >
          {researching ? "Researching..." : "Research this person"}
        </Button>
        <Button
          variant="green"
          onClick={handlePushNotion}
          disabled={pushing || !contact.name.trim() || !contact.company.trim()}
        >
          {pushing ? "Pushing..." : "Push to Notion"}
        </Button>
      </div>

      {researchError && <div className="notice notice-error">{researchError}</div>}

      {/* One box per idea, not a box inside a box: the hook is the line worth
          acting on, so it gets an accent border rather than its own container. */}
      {research?.research_notes && (
        <Field label="Research notes">
          <div className="summary-box">{research.research_notes}</div>
        </Field>
      )}
      {research?.company_context && (
        <Field label="Company context">
          <div className="summary-box">{research.company_context}</div>
        </Field>
      )}
      {research?.hook && (
        <Field label="Outreach hook">
          <div className="summary-box summary-box-accent">{research.hook}</div>
        </Field>
      )}

      {notionStatus === "ok" && (
        <div className="notice notice-success">Contact pushed to Notion.</div>
      )}
      {notionStatus && notionStatus !== "ok" && (
        <div className="notice notice-error">{notionStatus}</div>
      )}
    </Card>
  );
}
