import { useCopy } from "../hooks/useCopy";
import { isWarmLead, sameCompany } from "../lib/contact";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import PromptBox from "./PromptBox";

// Suggest which Claude.ai reference template the outreach-composer skill should
// lean on, based on contact type first, then lead temperature.
function suggestTemplate(contact) {
  if (contact.contactType === "Boss Hunt")     return "Boss Hunting Playbook";
  if (contact.contactType === "Informational") return "Informational Interview";
  if (isWarmLead(contact)) {
    return "Warm Outreach Strategy";
  }
  return "Cold Outreach Strategy";
}

// Whether the posting belongs in a message to this contact. An explicit ask
// settles it: only a referral for this role is about the posting, and a chat
// about the future or a reconnect that quotes a job description reads like an
// application in disguise. With no ask, the posting is in unless it is clearly
// about a different employer, which is what happens when a target company is
// picked while an older posting is still loaded.
//
// Shared by the prompt builder and the brief at the top of the card, so what the
// card says will be sent and what is sent cannot disagree.
function postingApplies(contact, analysis) {
  if (!analysis) return false;
  const ask = isWarmLead(contact) ? contact.ask : "";
  if (ask) return ask === "Referral for this role";
  const org = analysis.posting_type === "freelance" ? analysis.client : analysis.company;
  return !org || !contact.company?.trim() || sameCompany(contact.company, org);
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

  // The relationship is the one thing a warm message has that a cold one does
  // not, so it gets its own section, in Pat's words. Dropped for Cold leads and
  // when left blank, so a stray value never turns a cold message into a warm one.
  const connectionSection = isWarmLead(contact) && contact.connection?.trim() && [
    "## How I know them",
    `- ${contact.connection.trim()}`,
  ];

  // The ask changes what the message is for, so it gets its own section.
  const ask = isWarmLead(contact) ? contact.ask : "";
  const askSection = ask && [
    "## What I'm asking for",
    `- ${ask}`,
  ];
  const aboutPosting = postingApplies(contact, analysis);

  // Only the strengths go in, framed as angles. The summary, gaps, red flags, and
  // score are Pat's private verdict on whether to pursue, and handing that to the
  // writer made messages generic and hedged. The posting text itself (below) is
  // what gives the message something specific to say.
  const reasonSection = analysis && aboutPosting && [
    "## Why I'm reaching out",
    analysis.posting_type === "freelance"
      ? `- The ${analysis.client ? `${analysis.client} ` : ""}${analysis.project_type || "freelance"} contract in the posting below`
      : `- The ${analysis.company ? `${analysis.company} ` : ""}${analysis.job_title || "role"} in the posting below${analysis.job_title ? ` (exact title from the posting: "${analysis.job_title}")` : ""}`,
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
  const postingSection = analysis && aboutPosting && postingText?.trim() && [
    "## The posting",
    "<posting>",
    postingText.trim(),
    "</posting>",
  ];

  // Voice rules live in the outreach-composer skill and my project memory. Only
  // the rules that change from message to message are restated here.
  const instructionSection = [
    "## How to write it",
    "- Run my skills in order: humanizer, then outreach-composer, then stop-slop. Open the skill files each time.",
    `- Use the ${suggestTemplate(contact)} reference template. This is the first message only, so no follow-up language.`,
    analysis && !aboutPosting &&
      "- There is no open role in this message. Do not mention a posting or apply for anything. Make one small, easy ask that matches what I wrote above.",
    analysis?.posting_type !== "freelance" && analysis?.job_title && aboutPosting &&
      `- Use the exact title "${analysis.job_title}" and nothing else. Check it against the posting before using it.`,
    "- Plain subject line for an email, written the way a person would say it. Target about 85 words: one hook, one proof point with a number, one small question the posting does not already answer, my portfolio link, a graceful exit.",
    "- Open with who I am and what I want in plain words. Never open by quoting or paraphrasing the posting or something they wrote and then drawing a conclusion from it.",
    "- Lead with the project closest to this role (e-commerce and shopping proof first). Do not lead with Verizon or telecom unless it is the strongest signal for this specific role.",
    "- Only claim what I can defend in a live conversation. If any detail about my background is unclear, ask me before drafting.",
    "- Shape it for this person and contact type. Do not reuse the same opener or structure as my other drafts.",
    "- Be specific: one concrete detail from the posting or the hook, and the overlap with one piece of my work. No generic praise, no performed admiration.",
    isWarmLead(contact) && contact.connection?.trim() &&
      "- This person already knows me. Open from how we know each other, in the same words I used above. Do not invent shared history, details, or a recent conversation beyond what I wrote.",
    "- Source priority: the contact fields, then the posting, then the research. The posting is first-party and current; the research may be out of date.",
    "- Never hedge. If you are not sure a detail is still current, leave it out rather than qualifying it.",
  ];

  return [[opener], contactSection, connectionSection, askSection, reasonSection, researchSection, postingSection, instructionSection]
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

  // What each option will be made from, read straight off the other three cards.
  // It is the reason this card can sit apart from them: it shows what Compose
  // will work from without scrolling back to check.
  const org = analysis?.posting_type === "freelance" ? analysis?.client : analysis?.company;
  const role = analysis?.posting_type === "freelance" ? analysis?.project_type : analysis?.job_title;
  const postingLine = [role, org].filter(Boolean).join(" at ") || "Posting analyzed";
  const postingLeftOut = hasContact && hasPosting && !postingApplies(contact, analysis);

  return (
    <Card title="Compose" step={step} done={done}>
      {/* The two things this card can make, each stated as an offer: what it
          is, what it will be made from, and the button that makes it. An empty
          card therefore reads as a menu with its requirements, and a full one as
          a brief of exactly what each button is about to use. */}
      <div className="compose-options">
        <div className="compose-option">
          <div className="compose-option-text">
            <span className="compose-option-name">Outreach message</span>
            {hasContact ? (
              <>
                <span className="compose-option-source">
                  To {[contact.name, contact.title].filter(Boolean).join(", ")}
                  {contact.company ? ` at ${contact.company}` : ""}
                </span>
                {hasPosting && (
                  <span className="compose-option-note">
                    {postingLeftOut
                      ? "The posting is left out: it is not about this contact."
                      : `About ${postingLine}`}
                  </span>
                )}
              </>
            ) : (
              <span className="compose-option-note">
                Needs a person. Find one in step 2 or type them into Contact.
                Copies a prompt for your Claude project to write.
              </span>
            )}
          </div>
          <Button
            variant={outreachPrimary ? "primary" : "default"}
            onClick={() => setOutreachPrompt(buildOutreachPrompt(contact, analysis, research, analyzedPosting))}
          >
            Draft outreach
          </Button>
        </div>

        <div className="compose-option">
          <div className="compose-option-text">
            <span className="compose-option-name">Freelance pitch</span>
            {posting.trim() ? (
              <span className="compose-option-source">
                {hasPosting ? `For ${postingLine}` : "From the posting in step 1"}
              </span>
            ) : (
              <span className="compose-option-note">
                Needs a posting. Paste one in step 1.
                Written here, ready to paste into the application.
              </span>
            )}
          </div>
          <Button
            variant={pitchPrimary ? "primary" : "default"}
            onClick={onGeneratePitch}
            disabled={generating}
          >
            {generating ? "Generating..." : "Generate pitch"}
          </Button>
        </div>
      </div>

      {pitchError && <div className="notice notice-error">{pitchError}</div>}

      {outreachPrompt && <PromptBox text={outreachPrompt} />}

      {pitch && (
        <>
          <div className="divider" />

          <div className="prompt-box-header">
            <span className="hint">Ready to copy into your proposal</span>
            <Button variant="primary" onClick={() => copy(pitch.message)}>
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
            <Button variant="default" onClick={onGeneratePitch} disabled={generating || !posting.trim()}>
              {generating ? "Generating..." : "Regenerate"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
