import { useState } from "react";
import { api } from "../lib/api";
import { initContact } from "../lib/contact";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import Badge from "./Badge";

// Card 4 of the single-page flow: the one place a contact is edited. Contact
// state is lifted to Dashboard (which populates it from contact search or person
// research), so this panel is the editor and the Notion writer, nothing more.
//
// Composing moved out to ComposeCard: the prompt it builds needs the posting
// analysis and the research notes as well as the contact, and assembling that
// here would have made this component reach for state it does not otherwise own.
//
// `onReset` lets Dashboard clear whatever else belongs to the cleared contact
// (search selection, research notes, composed output). The LinkedIn fetch lives
// in Dashboard's useLinkedInFetch hook so its badge is shared across every
// trigger; this panel renders that status and calls `onFetchLinkedIn`.
export default function ContactPanel({
  contact, setContact, onReset,
  fetching, fetchStatus, setFetchStatus, onFetchLinkedIn,
}) {
  const [pushing, setPushing] = useState(false);
  const [notionStatus, setNotionStatus] = useState(null);

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

  function handleReset() {
    setContact(initContact());
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
    </Card>
  );
}
