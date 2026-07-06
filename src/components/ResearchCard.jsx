import { useState } from "react";
import { api } from "../lib/api";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";

// Self-contained "Research a person" card (UC2: founders/CEOs from Product Hunt,
// Crunchbase, etc.). Owns its own input state and result display. On a successful
// lookup it calls `onResult(data, resolvedLinkedin)` so the parent can populate
// the shared contact card and keep the notes/hook for the outreach prompt.
//
// To clear this card (e.g. on the contact card's Reset), the parent changes the
// `key` prop to remount it fresh -- the standard React "reset a component via key"
// pattern -- so there is no reset handler to thread through.
export default function ResearchCard({ onResult }) {
  const [mode, setMode] = useState("url"); // "url" | "name"
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [researching, setResearching] = useState(false);
  const [data, setData] = useState(null); // { research_notes, hook }
  const [error, setError] = useState(null);

  async function handleResearch() {
    const payload =
      mode === "url"
        ? { url: url.trim() }
        : { name: name.trim(), company: company.trim() };
    if (mode === "url" ? !payload.url : !payload.name) return;

    setResearching(true);
    setError(null);
    try {
      const result = await api.researchPerson(payload);
      const resolvedLinkedin =
        mode === "url" && url.includes("linkedin.com/in/") ? url.trim() : "";
      setData({ research_notes: result.research_notes, hook: result.hook });
      onResult(result, resolvedLinkedin);
    } catch (err) {
      setError(
        err.message === "not_found"
          ? "Could not find this person. Try a different URL or add a company."
          : err.message || "Research failed.",
      );
    } finally {
      setResearching(false);
    }
  }

  return (
    <Card title="Research a person">
      <div className="btn-row" style={{ marginBottom: 10 }}>
        <Button
          variant={mode === "url" ? "blue" : "default"}
          onClick={() => setMode("url")}
        >
          By URL
        </Button>
        <Button
          variant={mode === "name" ? "blue" : "default"}
          onClick={() => setMode("name")}
        >
          By name + company
        </Button>
      </div>

      {mode === "url" ? (
        <Field label="Profile or company URL (Product Hunt, Crunchbase, site, LinkedIn)">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.producthunt.com/@... or company site"
          />
        </Field>
      ) : (
        <div className="grid-2">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
            />
          </Field>
          <Field label="Company">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
            />
          </Field>
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 10 }}>
        <Button
          variant="green"
          onClick={handleResearch}
          disabled={researching || (mode === "url" ? !url.trim() : !name.trim())}
        >
          {researching ? "Researching..." : "Research person"}
        </Button>
      </div>

      {error && (
        <div className="notice notice-error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {data && (data.research_notes || data.hook) && (
        <>
          <div className="divider" />
          {data.research_notes && (
            <div className="fit-group">
              <div className="fit-group-label">Research notes</div>
              <div className="summary-box">{data.research_notes}</div>
            </div>
          )}
          {data.hook && (
            <div className="fit-group fit-group-strengths">
              <div className="fit-group-label">Outreach hook</div>
              <div className="summary-box">{data.hook}</div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
