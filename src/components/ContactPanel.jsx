import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { buildResearchNotes, diffProfile } from "../lib/contact";
import { researchErrorMessage } from "../lib/contacts";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import Badge from "./Badge";

// How much of the research was actually confirmed by a dated source. The label
// is written from Pat's point of view (what should I do about this?) rather than
// the model's ("moderate"), and the render guards on the map having an entry, so
// an unexpected value shows nothing instead of an empty pill.
const CONFIDENCE_BADGE = { high: "green", moderate: "amber", low: "red" };
const CONFIDENCE_LABEL = {
  high: "Confirmed recent",
  moderate: "May be outdated",
  low: "Unverified",
};

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
  contact,
  setContact,
  fetching,
  fetchStatus,
  setFetchStatus,
  onFetchLinkedIn,
  research,
  onResearch,
  onAcceptSuggestion,
  personId,
  step,
  done,
  note,
}) {
  const [pushing, setPushing] = useState(false);
  const [researching, setResearching] = useState(false);
  // Both of these report on an action taken against the person currently in the
  // card, so both are tagged with that person and expire by derivation the moment
  // Dashboard swaps the record. A "Contact pushed to Notion" banner left over
  // from the previous person would read as if this one had been pushed.
  const [notion, setNotion] = useState({ forPerson: null, status: null });
  const [researchFailure, setResearchFailure] = useState({ forPerson: null, message: null });
  const notionStatus = notion.forPerson === personId ? notion.status : null;
  const researchError =
    researchFailure.forPerson === personId ? researchFailure.message : null;
  // Fields where Pat has looked at the difference and kept his own value, tagged
  // with the research result they were a judgment about. A dismissal belongs to
  // one answer, not to the person: researching again has to show the fresh one,
  // or a corrected title would stay hidden behind the dismissal of the wrong one.
  // Tagging lets that expire by derivation, with no effect to keep in sync, and
  // covers the person changing too, since startContact clears `research` to null.
  const [dismissed, setDismissed] = useState({ forResearch: null, fields: [] });
  const dismissedFields =
    dismissed.forResearch === research ? dismissed.fields : [];

  // Derived on every render rather than snapshotted when research returns. That
  // is what makes a later hand-edit re-raise the mismatch: correcting Company by
  // hand should flag that the research notes are about a different company, not
  // leave them silently attached.
  const { conflicts } = useMemo(
    () =>
      research?.profile
        ? diffProfile(contact, research.profile)
        : { conflicts: {} },
    [contact, research],
  );

  // Research suggests, it does not write. The value stays in place until Pat
  // accepts it, because the endpoint is a web search and the page it read is
  // often older than whatever Hunter.io or LinkedIn already gave us.
  function suggestionFor(field) {
    const suggested = conflicts[field];
    if (!suggested || dismissedFields.includes(field)) return null;
    return (
      <div className="suggestion-row">
        <span className="suggestion-text">
          Research says &ldquo;{suggested}&rdquo;
        </span>
        <button
          className="link-button"
          onClick={() => onAcceptSuggestion(field, suggested)}
        >
          Use
        </button>
        <button
          className="link-button"
          onClick={() =>
            setDismissed({
              forResearch: research,
              fields: [...dismissedFields, field],
            })
          }
        >
          Keep mine
        </button>
      </div>
    );
  }

  async function handlePushNotion() {
    setPushing(true);
    setNotion({ forPerson: personId, status: null });
    try {
      // The research is composed into Notion's Notes property at push time, so
      // the reasoning behind an outreach survives in the tracker instead of
      // living only on this screen. Empty when nothing was researched, and the
      // serverless function omits the property in that case.
      await api.pushNotion({ ...contact, notes: buildResearchNotes(research) });
      setNotion({ forPerson: personId, status: "ok" });
    } catch (err) {
      console.error("pushNotion:", err.message);
      setNotion({ forPerson: personId, status: err.message || "error" });
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
    setResearchFailure({ forPerson: personId, message: null });
    try {
      await onResearch(payload);
    } catch (err) {
      setResearchFailure({ forPerson: personId, message: researchErrorMessage(err) });
    } finally {
      setResearching(false);
    }
  }

  const fetchBadge = fetching ? (
    <Badge variant="amber">Fetching...</Badge>
  ) : fetchStatus === "ok" ? (
    <Badge variant="green">Profile loaded</Badge>
  ) : fetchStatus === "error" ? (
    <Badge variant="red">Could not load -- fill in manually</Badge>
  ) : null;

  return (
    <Card title="Contact" step={step} done={done} note={note}>
      <div className="grid-2">
        <Field label="Contact name *">
          <input
            value={contact.name}
            onChange={(e) =>
              setContact((c) => ({ ...c, name: e.target.value }))
            }
            placeholder="First Last"
          />
          {suggestionFor("name")}
        </Field>
        <Field label="Company *">
          <input
            value={contact.company}
            onChange={(e) =>
              setContact((c) => ({ ...c, company: e.target.value }))
            }
            placeholder="Acme Corp"
          />
          {suggestionFor("company")}
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Title">
          <input
            value={contact.title}
            onChange={(e) =>
              setContact((c) => ({ ...c, title: e.target.value }))
            }
            placeholder="Head of Design"
          />
          {suggestionFor("title")}
        </Field>
        <Field label="Location">
          <input
            value={contact.location}
            onChange={(e) =>
              setContact((c) => ({ ...c, location: e.target.value }))
            }
            placeholder="New York, NY"
          />
          {suggestionFor("location")}
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Email (from Hunter.io)">
          <input
            value={contact.email}
            onChange={(e) =>
              setContact((c) => ({ ...c, email: e.target.value }))
            }
            placeholder="name@company.com"
          />
        </Field>
        <Field
          label="LinkedIn URL -- paste and press Enter to auto-fill"
          badge={fetchBadge}
        >
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
            onChange={(e) =>
              setContact((c) => ({ ...c, contactType: e.target.value }))
            }
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
            onChange={(e) =>
              setContact((c) => ({ ...c, leadType: e.target.value }))
            }
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
            onChange={(e) =>
              setContact((c) => ({ ...c, status: e.target.value }))
            }
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
          disabled={
            researching || (!contact.linkedin.trim() && !contact.name.trim())
          }
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

      {researchError && (
        <div className="notice notice-error">{researchError}</div>
      )}

      {/* How old the research is and how much of it was confirmed. It leads the
          research block because everything below it is a claim from a web page
          that may not have been updated in years. */}
      {research?.research_notes && CONFIDENCE_LABEL[research.confidence] && (
        <div className="research-provenance">
          <Badge variant={CONFIDENCE_BADGE[research.confidence]}>
            {CONFIDENCE_LABEL[research.confidence]}
          </Badge>
          <span>
            {research.as_of && research.as_of !== "Unknown"
              ? `As of ${research.as_of}`
              : "No date found"}
          </span>
        </div>
      )}

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
      {/* The pages the claims came from, so a doubtful title is one click to
          check rather than a re-search. */}
      {research?.sources?.length > 0 && (
        <Field label="Sources">
          <div className="source-list">
            {research.sources.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            ))}
          </div>
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
