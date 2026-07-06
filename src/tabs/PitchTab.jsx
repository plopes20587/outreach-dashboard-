import { useState } from "react";
import { api } from "../lib/api";
import { useCopy } from "../hooks/useCopy";
import { useLinkedInFetch } from "../hooks/useLinkedInFetch";
import Card from "../components/Card";
import Field from "../components/Field";
import Button from "../components/Button";
import ContactPanel from "../components/ContactPanel";
import ResearchCard from "../components/ResearchCard";
import { initContact, applyProfile } from "../lib/contact";

export default function PitchTab() {
  // Freelance pitch generation (UC3).
  const [posting, setPosting] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  const [copied, copy] = useCopy();

  // Person research (UC2): founders/CEOs sourced from Product Hunt, Crunchbase,
  // etc. ResearchCard owns its inputs; it reports results up here to populate the
  // shared contact card and keep the notes/hook for the Draft outreach prompt.
  const [contact, setContact] = useState(initContact());
  const [researchData, setResearchData] = useState(null); // { research_notes, hook }
  // Bumping this key remounts ResearchCard to clear its inputs on Reset.
  const [researchKey, setResearchKey] = useState(0);
  const { fetching, fetchStatus, setFetchStatus, fetchLinkedIn } = useLinkedInFetch(setContact);

  function handleResearchResult(data, resolvedLinkedin) {
    setContact((c) => ({
      ...applyProfile(c, data),
      linkedin: resolvedLinkedin || c.linkedin,
    }));
    setResearchData({ research_notes: data.research_notes, hook: data.hook });
  }

  async function handleGenerate() {
    if (!posting.trim()) return;
    setGenerating(true);
    setError(false);
    try {
      const data = await api.generatePitch(posting);
      setResult(data);
    } catch (err) {
      console.error("generatePitch:", err.message);
      setError(true);
    } finally {
      setGenerating(false);
    }
  }

  function handleClear() {
    setPosting("");
    setResult(null);
    setError(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Research a person (founders/CEOs from Product Hunt, Crunchbase, etc.) */}
      <ResearchCard key={researchKey} onResult={handleResearchResult} />

      {/* Shared contact card. Fed by research above; its notes + hook feed the
          Draft outreach prompt. Reset clears the results and remounts ResearchCard
          (via researchKey) to clear its inputs too. */}
      <ContactPanel
        contact={contact}
        setContact={setContact}
        research={researchData}
        fetching={fetching}
        fetchStatus={fetchStatus}
        setFetchStatus={setFetchStatus}
        onFetchLinkedIn={fetchLinkedIn}
        onReset={() => {
          setResearchData(null);
          setResearchKey((k) => k + 1);
        }}
      />

      {/* Posting input */}
      <Card title="Freelance posting">
        <Field>
          <textarea
            rows={9}
            value={posting}
            onChange={(e) => setPosting(e.target.value)}
            placeholder="Paste a Contra, Upwork, or other freelance posting here..."
          />
        </Field>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <Button
            variant="coral"
            onClick={handleGenerate}
            disabled={generating || !posting.trim()}
          >
            {generating ? "Generating..." : "Generate pitch"}
          </Button>
          <Button variant="default" onClick={handleClear}>
            Clear
          </Button>
        </div>
        {error && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            Failed to generate message. Try again.
          </div>
        )}
      </Card>

      {/* Generated result */}
      {result && (
        <Card title="Pitch">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              Ready to copy into your proposal
            </span>
            <Button variant="coral" onClick={() => copy(result.message)}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          <textarea
            style={{ border: "0.5px solid var(--coral-bd)" }}
            rows={10}
            value={result.message}
            readOnly
            onClick={(e) => e.target.select()}
          />

          <div className="divider" />

          <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>
            Personalization notes
          </div>
          <div
            style={{
              border: "0.5px solid var(--border-2)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
              fontSize: "13px",
              lineHeight: "1.6",
              color: "var(--text-2)",
            }}
          >
            {result.notes}
          </div>

          <div style={{ marginTop: 10 }}>
            <Button variant="coral" onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Regenerate"}
            </Button>
          </div>
        </Card>
      )}

    </div>
  );
}
