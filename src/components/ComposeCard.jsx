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
// #9). `analysis` and `postingText` are the analyzed posting and the exact text
// it ran on; `research` is the notes, company context, and hook when a person
// was researched. All three are optional.
//
// Each section is built separately and dropped when it has nothing in it, so a
// contact with no posting and no research still reads as a clean prompt.
function buildOutreachPrompt(contact, analysis, research, postingText) {
  let opener = `Draft one outreach message to ${contact.name || "this contact"}`;
  if (contact.title)   opener += `, ${contact.title}`;
  if (contact.company) opener += ` at ${contact.company}`;
  opener += ".";

  // An email needs a subject line and a LinkedIn note has to be short, so the
  // channel is stated rather than left for Claude.ai to guess.
  const contactSection = [
    "## Contact (authoritative, I have checked these)",
    contact.contactType && `- Contact type: ${contact.contactType}`,
    contact.leadType    && `- Lead type: ${contact.leadType}`,
    contact.location    && `- Location: ${contact.location}`,
    contact.linkedin    && `- LinkedIn: ${contact.linkedin}`,
    contact.email
      ? "- Channel: email, so include a subject line"
      : "- Channel: LinkedIn message, so keep it short",
  ];

  // Only the strengths go in, framed as angles. The summary, gaps, red flags, and
  // score are Pat's private verdict on whether to pursue, and handing that to the
  // writer made messages generic and hedged. The posting text itself (below) is
  // what gives the message something specific to say.
  const reasonSection = analysis && [
    "## Why I'm reaching out",
    analysis.posting_type === "freelance"
      ? `- The ${analysis.client ? `${analysis.client} ` : ""}${analysis.project_type || "freelance"} contract in the posting below`
      : `- The ${analysis.company ? `${analysis.company} ` : ""}role in the posting below`,
    analysis.strengths?.length && "- Angles to lead with:",
    ...(analysis.strengths || []).map((strength) => `  - ${strength}`),
  ];

  // Research comes from a web search that often lands on an outdated profile.
  // Low confidence research is left out entirely: a claim too weak to assert
  // cannot be asserted if it is never sent. Everything else is labeled with its
  // date and confidence, and the writing rules below say to drop, not hedge,
  // anything that may be stale.
  const hasResearch = research?.research_notes || research?.company_context || research?.hook;
  const researchSection = hasResearch && research.confidence !== "low" && [
    `## Research (web search, ${research.as_of && research.as_of !== "Unknown" ? `as of ${research.as_of}` : "date unknown"}, confidence ${research.confidence || "moderate"}, not verified)`,
    research.research_notes  && `- About them: ${research.research_notes}`,
    research.company_context && `- About the company: ${research.company_context}`,
    research.hook            && `- Possible hook: ${research.hook}`,
  ];

  // The posting sits just before the instructions: Claude handles a long document
  // best when the instructions come after it.
  const postingSection = analysis && postingText?.trim() && [
    "## The posting",
    "<posting>",
    postingText.trim(),
    "</posting>",
  ];

  const instructionSection = [
    "## How to write it",
    `- Use my outreach-composer skill and the ${suggestTemplate(contact)} reference template.`,
    "- Be specific: open with one concrete detail from the posting or the hook, and name the overlap with one piece of my work. No generic praise.",
    "- Source priority: the contact fields, then the posting, then the research. The posting is first-party and current; the research may be out of date.",
    "- Never hedge. If you are not sure a detail is still current, leave it out rather than qualifying it.",
  ];

  return [[opener], contactSection, reasonSection, researchSection, postingSection, instructionSection]
    .filter(Boolean)
    .map((section) => section.filter(Boolean).join("\n"))
    .join("\n\n");
}

// Step 4 of the flow. Both ways of producing something to send live here, so
// the choice is a single decision in one place rather than a tab switch.
//
// Context changes emphasis, never availability: both buttons stay enabled at all
// times. Disabling one would guess at intent, and the guess is wrong often
// enough (a pitch for a posting you also have a contact at, outreach to someone
// you found without a posting) that a wrong guess costs more than a soft hint.
export default function ComposeCard({
  contact, analysis, research, posting, analyzedPosting,
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
          onClick={() => setOutreachPrompt(buildOutreachPrompt(contact, analysis, research, analyzedPosting))}
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
