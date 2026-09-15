import { useCopy } from "../hooks/useCopy";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
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

// Builds the structured prompt Pat copies into his Claude.ai project, where the
// outreach-composer skill and reference templates actually write the message.
// This app intentionally does NOT generate outreach itself (CLAUDE.md Hard Rule
// #9). `analysis` is the posting context when one was analyzed; `research` is
// the notes, company context, and hook when a person was researched. Both are
// optional.
function buildOutreachPrompt(contact, analysis, research) {
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

  if (analysis?.summary) {
    const label =
      analysis.posting_type === "freelance"
        ? "Contract context (from the posting)"
        : "Fit context (from the job description)";
    lines.push("", `${label}: ${analysis.summary}`);
    if (analysis.strengths?.length) {
      lines.push(`Why it fits: ${analysis.strengths.join("; ")}.`);
    }
  }

  // The research block is labeled rather than stated. It comes from a web search
  // that often reads an outdated profile, and an unqualified "Head of Design at
  // Acme" here is asserted as current fact in the message that gets sent. The
  // contact fields above are the ones Pat controls and has corrected, so they
  // stay authoritative and the research is explicitly subordinate to them.
  if (research?.research_notes || research?.company_context || research?.hook) {
    const dated = research.as_of && research.as_of !== "Unknown";
    lines.push(
      "",
      `Research below is from a web search${dated ? ` as of ${research.as_of}` : " with no date found"}, confidence ${research.confidence || "moderate"}, and is not verified.`,
      "The contact details above are authoritative. Do not state any role, company, or launch from the research as current fact; reference it only as something I noticed, and hedge if it matters.",
    );
    if (research.research_notes) lines.push(`Research on this person: ${research.research_notes}`);
    if (research.company_context) lines.push(`About the company: ${research.company_context}`);
    if (research.hook) lines.push(`Possible hook to open with: ${research.hook}`);
  }

  lines.push(
    "",
    `Suggested template: ${suggestTemplate(contact)}.`,
    "Use my outreach-composer skill and the suggested reference template to write the message.",
  );

  return lines.join("\n");
}

// Step 4 of the flow. Both ways of producing something to send live here, so
// the choice is a single decision in one place rather than a tab switch.
//
// Context changes emphasis, never availability: both buttons stay enabled at all
// times. Disabling one would guess at intent, and the guess is wrong often
// enough (a pitch for a posting you also have a contact at, outreach to someone
// you found without a posting) that a wrong guess costs more than a soft hint.
export default function ComposeCard({
  contact, analysis, research, posting,
  outreachPrompt, setOutreachPrompt,
  pitch, generating, pitchError, onGeneratePitch,
  step, done,
}) {
  const [copied, copy] = useCopy();

  const hasContact = Boolean(contact.name?.trim());
  const hasPosting = Boolean(analysis);
  const outreachPrimary = hasContact;
  const pitchPrimary = hasPosting && !hasContact;

  const helper =
    hasContact && hasPosting
      ? "Draft outreach to reach this person directly, or generate a pitch to apply to the posting."
      : hasContact
        ? "Copies a prompt for your Claude project to write the message."
        : hasPosting
          ? "Writes a pitch you can paste straight into the posting."
          : "Add a contact or analyze a posting to compose.";

  return (
    <Card title="Compose" step={step} done={done}>
      <div className="btn-row">
        <Button
          variant={outreachPrimary ? "purple" : "default"}
          onClick={() => setOutreachPrompt(buildOutreachPrompt(contact, analysis, research))}
        >
          Draft outreach
        </Button>
        <Button
          variant={pitchPrimary ? "coral" : "default"}
          onClick={onGeneratePitch}
          disabled={generating}
        >
          {generating ? "Generating..." : "Generate pitch"}
        </Button>
      </div>

      <div className="hint">{helper}</div>

      {pitchError && <div className="notice notice-error">{pitchError}</div>}

      {outreachPrompt && <PromptBox text={outreachPrompt} />}

      {pitch && (
        <>
          <div className="divider" />

          <div className="prompt-box-header">
            <span className="hint">Ready to copy into your proposal</span>
            <Button variant="coral" onClick={() => copy(pitch.message)}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          <textarea
            className="pitch-textarea"
            rows={10}
            value={pitch.message}
            readOnly
            onClick={(e) => e.target.select()}
          />

          <div className="divider" />

          <Field label="Personalization notes">
            <div className="pitch-notes">{pitch.notes}</div>
          </Field>

          <div className="btn-row">
            <Button variant="coral" onClick={onGeneratePitch} disabled={generating || !posting.trim()}>
              {generating ? "Generating..." : "Regenerate"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
