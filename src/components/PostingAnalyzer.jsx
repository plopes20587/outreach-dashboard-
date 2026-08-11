import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import Badge from "./Badge";
import FitBar from "./FitBar";

// Full-time badge maps. These describe an industry and a role, so they are kept
// well away from the freelance term maps below: "Primary industry fit" is
// meaningless applied to a rate.
const INDUSTRY_BADGE = { strong: "green", moderate: "amber", mismatch: "red" };
const INDUSTRY_LABEL = {
  strong: "Primary industry fit",
  moderate: "Secondary industry fit",
  mismatch: "Industry mismatch",
};

const STRATEGIC_BADGE = { strong: "green", moderate: "amber", weak: "red" };
const STRATEGIC_LABEL = {
  strong: "Strategic involvement",
  moderate: "Limited strategic scope",
  weak: "Executional only",
};

// No entry for ai_environment "neutral" on purpose: a pill announcing that the
// posting did not mention AI either way is noise. The render guards on the label
// map having an entry, so the neutral case simply renders nothing.
const AI_BADGE = { strong: "green", flag: "red" };
const AI_LABEL = { strong: "AI-integrated team", flag: "AI as product, not process" };

// Freelance term maps, local to this component. A rate is "Good" or "Below
// target", never "Primary" or "Secondary".
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

// Card 1 of the single-page flow. Always visible. Takes any posting, detects
// whether it is a job description or a freelance contract, and renders the
// matching rubric's result inline. The detected type drives the layout, so the
// type badge is rendered first: it must be obvious which rubric produced the
// numbers below it.
export default function PostingAnalyzer({
  posting, setPosting, analysis, analyzing, analyzeError, onAnalyze, onClear,
}) {
  const isFreelance = analysis?.posting_type === "freelance";
  const otherType = isFreelance ? "full-time" : "freelance";

  return (
    <Card title="Analyze a posting">
      <Field>
        <textarea
          rows={9}
          value={posting}
          onChange={(e) => setPosting(e.target.value)}
          placeholder="Paste a job description or freelance contract. The type is detected automatically."
        />
      </Field>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <Button
          variant="blue"
          onClick={() => onAnalyze()}
          disabled={analyzing || !posting.trim()}
        >
          {analyzing ? "Analyzing..." : "Analyze"}
        </Button>
        <Button variant="default" onClick={onClear}>
          Clear
        </Button>
      </div>

      {analyzeError && (
        <div className="notice notice-error" style={{ marginTop: 10 }}>
          {analyzeError}
        </div>
      )}

      {analysis && (
        <>
          <div className="divider" />

          {/* Which rubric ran, and the escape hatch when detection got it wrong. */}
          <div className="tags-row">
            <Badge variant={isFreelance ? "coral" : "blue"}>
              {isFreelance ? "Freelance contract" : "Job posting"}
            </Badge>
          </div>
          <button
            type="button"
            className="link-button"
            onClick={() => onAnalyze(otherType)}
            disabled={analyzing}
          >
            {isFreelance
              ? "Analyzed as a freelance contract. Re-run as job posting"
              : "Analyzed as a job posting. Re-run as freelance contract"}
          </button>

          <FitBar score={analysis.fit_score} />

          {isFreelance ? (
            <div className="tags-row">
              <Badge variant={TERM_BADGE[analysis.rate_fit] || "neutral"}>
                {analysis.rate} -- {TERM_LABEL[analysis.rate_fit] || analysis.rate_fit}
              </Badge>
              <Badge variant={TERM_BADGE[analysis.time_fit] || "neutral"}>
                {analysis.hours} -- {TERM_LABEL[analysis.time_fit] || analysis.time_fit}
              </Badge>
              <Badge variant={TERM_BADGE[analysis.scope_fit] || "neutral"}>
                Scope -- {TERM_LABEL[analysis.scope_fit] || analysis.scope_fit}
              </Badge>
              {analysis.industry && <Badge variant="neutral">{analysis.industry}</Badge>}
            </div>
          ) : (
            <div className="tags-row">
              <Badge variant={INDUSTRY_BADGE[analysis.industry_fit] || "neutral"}>
                {analysis.industry} -- {INDUSTRY_LABEL[analysis.industry_fit] || analysis.industry_fit}
              </Badge>
              {analysis.role_level && <Badge variant="blue">{analysis.role_level}</Badge>}
              {STRATEGIC_LABEL[analysis.strategic_fit] && (
                <Badge variant={STRATEGIC_BADGE[analysis.strategic_fit]}>
                  {STRATEGIC_LABEL[analysis.strategic_fit]}
                </Badge>
              )}
              {AI_LABEL[analysis.ai_environment] && (
                <Badge variant={AI_BADGE[analysis.ai_environment]}>
                  {AI_LABEL[analysis.ai_environment]}
                </Badge>
              )}
            </div>
          )}

          {analysis.strengths?.length > 0 && (
            <div className="fit-group fit-group-strengths">
              <div className="fit-group-label">
                {isFreelance ? "Why it's worth it" : "Why it fits"}
              </div>
              <ul className="fit-bullets">
                {analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {analysis.gaps?.length > 0 && (
            <div className="fit-group fit-group-gaps">
              <div className="fit-group-label">Watch-outs</div>
              <ul className="fit-bullets">
                {analysis.gaps.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}

          {/* Red flags are freelance-only and get their own red styling: a gap is
              something to address in the pitch, a red flag is a reason to walk. */}
          {analysis.red_flags?.length > 0 && (
            <div className="fit-group fit-group-flags">
              <div className="fit-group-label">Red flags</div>
              <ul className="fit-bullets">
                {analysis.red_flags.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          <div className="summary-box">{analysis.summary}</div>
        </>
      )}
    </Card>
  );
}
