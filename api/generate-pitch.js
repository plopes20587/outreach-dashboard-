export const config = { runtime: "edge" };

import { PAT_PROFILE } from "./lib/profile.js";
import { json, preflight, missingEnv, readBody, extractJson, noEmDash, errorResponse } from "./lib/http.js";
import { callClaude } from "./lib/anthropic.js";

// Structured outputs: the API guarantees the reply matches this shape, so a
// pitch can never come back missing its message or notes.
const PITCH_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    notes: { type: "string" },
  },
  required: ["message", "notes"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `${PAT_PROFILE}

You are writing a freelance pitch on Pat's behalf in response to a job posting (Contra, Upwork, or a similar freelance platform).

Tone rules (strictly enforced):
- Never use em dashes
- Write in plain, conversational language. No buzzwords, no corporate speak.
- Short and specific beats long and general. Restraint signals seniority.
- No performed insight. Do not write "I was drawn to your work" or "what struck me about your approach was" unless there is a specific, real reason from the posting. If a sentence exists to sound thoughtful rather than to say something true, cut it.
- The message should answer implicitly: "why do you understand my problem?" before it answers "what can you do?"
- Lead with a specific observation about their product, UX, or problem from the posting. Not a compliment, a point of view.
- Connect Pat's relevant past work briefly. Not a bio, a signal.
- Never use the word "pitch" in the message. Let the framing carry the low-pressure quality instead of naming it.
- Never write "that stuck with me" or any close variant. It reads as AI-generated.
- Do not lead with Verizon or telecom work. Open with whichever project is most relevant to this posting: SeneGence and KFC for e-commerce, shopping, and QSR, Cellebrite for marketing sites and design systems, patlopes.com for front-end and build work. Verizon can appear later as current-role context, just not as the opening.
- Close with a low-pressure invitation: a short conversation about fit, not a proposal.

Format: 2-3 short paragraphs. No greeting header. No subject line. Under 250 words. Conversational, not formal.

After the message, include a short PERSONALIZATION NOTES section explaining 2-3 key choices made.`;

export default async function handler(request) {
  const earlyResponse = preflight(request) || missingEnv("ANTHROPIC_API_KEY");
  if (earlyResponse) return earlyResponse;

  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request body" }, 400);

  const { posting, analysis } = body;
  if (!posting?.trim()) {
    return json({ error: "posting is required" }, 400);
  }

  // Optional context from /api/analyze-posting. Only the strengths and gaps are
  // passed through: red flags are Pat's walk-away signal and have no place in a
  // pitch, and a fit score would only make the model hedge its tone.
  const strengths = analysis?.strengths?.filter(Boolean) || [];
  const gaps = analysis?.gaps?.filter(Boolean) || [];
  const analysisBlock =
    strengths.length || gaps.length
      ? `
Fit analysis of this contract. Use it to decide what to emphasize. Do not quote it back or refer to it as an analysis.
${strengths.length ? `Angles to lead with: ${strengths.join(" | ")}` : ""}
${gaps.length ? `Open questions worth surfacing naturally: ${gaps.join(" | ")}` : ""}
`
      : "";

  const userMessage = `Here is a freelance job posting (Contra, Upwork, or similar) Pat is applying to:

---
${posting}
---
${analysisBlock}
Write the pitch following all tone and structure rules. Then add a PERSONALIZATION NOTES section.

Return as JSON:
{
  "message": "<the full application message, plain text, newlines as \\n>",
  "notes": "<personalization notes, 2-3 key choices explained, plain text>"
}`;

  try {
    // The pitch is pure writing with no web search, so it keeps adaptive
    // thinking at medium effort. Thinking counts against maxTokens, so the
    // ceiling leaves room for it on top of a ~250 word message.
    const textContent = await callClaude({
      system: SYSTEM_PROMPT,
      prompt: userMessage,
      maxTokens: 4000,
      effort: "medium",
      schema: PITCH_SCHEMA,
    });
    // Structured outputs already guarantee clean JSON; extractJson is defensive.
    const parsed = extractJson(textContent);

    if (!parsed?.message || !parsed?.notes) {
      return json({ error: "Unexpected response format from model" }, 502);
    }

    return json({ message: noEmDash(parsed.message), notes: noEmDash(parsed.notes) });
  } catch (err) {
    return errorResponse(err, "generate-pitch", "Failed to generate message");
  }
}
