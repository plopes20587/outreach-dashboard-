import { useState } from "react";
import { api } from "../lib/api";
import { useCopy } from "../hooks/useCopy";
import { useLinkedInFetch } from "../hooks/useLinkedInFetch";
import Card from "../components/Card";
import Field from "../components/Field";
import Button from "../components/Button";
import Badge from "../components/Badge";
import FitBar from "../components/FitBar";
import ContactPanel from "../components/ContactPanel";
import ResearchCard from "../components/ResearchCard";
import { initContact, applyProfile } from "../lib/contact";

// Contract terms use their own labels. The Outreach tab's "Primary/Secondary"
// wording is industry language and does not describe a rate or an hours figure.
const TERM_BADGE = {
  strong: "green",
  moderate: "amber",
  mismatch: "red",
  unstated: "neutral",
};
const TERM_LABEL = {
  strong: "Good",
  moderate: "Acceptable",
  mismatch: "Below target",
  unstated: "Not stated",
};

export default function PitchTab() {
  // Contract analysis: triage a posting before spending effort pitching it.
  const [contract, setContract] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [contractFit, setContractFit] = useState(null);
  const [contractOpen, setContractOpen] = useState(false);

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

  async function handleAnalyzeContract() {
    if (!contract.trim()) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setContractFit(null);
    try {
      const data = await api.analyzeContract(contract);
      setContractFit(data);
      // Carry the posting down into the pitch card so it never gets pasted twice.
      setPosting(contract);
    } catch (err) {
      console.error("analyzeContract:", err.message);
      setAnalyzeError(err.message || "Failed to analyze contract. Try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleClearContract() {
    setContract("");
    setContractFit(null);
    setAnalyzeError(null);
  }

  async function handleGenerate() {
    if (!posting.trim()) return;
    setGenerating(true);
    setError(false);
    try {
      // contractFit is optional. When present it steers what the pitch emphasizes.
      const data = await api.generatePitch(posting, contractFit);
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

      {/* Optional helper: triage a contract before pitching it. Criteria are
          part-time specific (rate, hours, scope, red flags), not the full-time
          job criteria used on the Outreach tab. */}
      <Card
        title="Analyze a freelance contract"
        optional
        collapsible
        open={contractOpen}
        onToggle={setContractOpen}
      >
        <Field>
          <textarea
            rows={9}
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="Paste the freelance contract or posting here..."
          />
        </Field>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <Button
            variant="coral"
            onClick={handleAnalyzeContract}
            disabled={analyzing || !contract.trim()}
          >
            {analyzing ? "Analyzing..." : "Analyze contract"}
          </Button>
          <Button variant="default" onClick={handleClearContract}>
            Clear
          </Button>
        </div>
        {analyzeError && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {analyzeError}
          </div>
        )}

        {/* Fit results render inline once analysis completes */}
        {contractFit && (
          <>
            <div className="divider" />
            <FitBar score={contractFit.fit_score} />
            <div className="tags-row">
              <Badge variant={TERM_BADGE[contractFit.rate_fit] || "neutral"}>
                {contractFit.rate} -- {TERM_LABEL[contractFit.rate_fit] || contractFit.rate_fit}
              </Badge>
              <Badge variant={TERM_BADGE[contractFit.time_fit] || "neutral"}>
                {contractFit.hours} -- {TERM_LABEL[contractFit.time_fit] || contractFit.time_fit}
              </Badge>
              <Badge variant={TERM_BADGE[contractFit.scope_fit] || "neutral"}>
                Scope -- {TERM_LABEL[contractFit.scope_fit] || contractFit.scope_fit}
              </Badge>
              {contractFit.industry && (
                <Badge variant="neutral">{contractFit.industry}</Badge>
              )}
            </div>
            {(contractFit.strengths?.length > 0) && (
              <div className="fit-group fit-group-strengths">
                <div className="fit-group-label">Why it's worth it</div>
                <ul className="fit-bullets">
                  {contractFit.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {(contractFit.gaps?.length > 0) && (
              <div className="fit-group fit-group-gaps">
                <div className="fit-group-label">Watch-outs</div>
                <ul className="fit-bullets">
                  {contractFit.gaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            )}
            {(contractFit.red_flags?.length > 0) && (
              <div className="fit-group fit-group-flags">
                <div className="fit-group-label">Red flags</div>
                <ul className="fit-bullets">
                  {contractFit.red_flags.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            <div className="summary-box">{contractFit.summary}</div>
          </>
        )}
      </Card>

      {/* Posting input. Pre-filled by the analyze card above when one ran. */}
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
