export const config = { runtime: "edge" };

import { PAT_PROFILE } from "./lib/profile.js";

// This function intentionally uses Groq's free tier (OpenAI-compatible API)
// instead of Anthropic (cost decision -- see CLAUDE.md Hard Rule #7 carve-out).
// The pitch is pure text generation with no web search, so it ports cleanly.
const GROQ_MODEL = "llama-3.3-70b-versatile";

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
}

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
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!process.env.GROQ_API_KEY) {
    return json({ error: "GROQ_API_KEY is not configured" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

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

Return as JSON only, no markdown:
{
  "message": "<the full application message, plain text, newlines as \\n>",
  "notes": "<personalization notes, 2-3 key choices explained, plain text>"
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1200,
        // JSON mode: forces a JSON object back. The user message already asks for JSON,
        // which OpenAI-compatible JSON mode requires.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Groq error:", detail);
      return json({ error: "Groq API error", detail: res.status }, 502);
    }

    const data = await res.json();
    const textBlock = data.choices?.[0]?.message?.content;
    // stripFences is defensive only -- JSON mode should already give us clean JSON.
    const parsed = JSON.parse(stripFences(textBlock || "{}"));

    if (!parsed.message || !parsed.notes) {
      return json({ error: "Unexpected response format from model" }, 502);
    }

    // Pat's hard rule: never use em dashes. Open models honor this less reliably
    // than Claude did, so strip any that slip through before returning.
    const noEmDash = (s) => s.replace(/\s*—\s*/g, ", ");
    return json({ message: noEmDash(parsed.message), notes: noEmDash(parsed.notes) });
  } catch (err) {
    console.error("generate-pitch:", err.message);
    return json({ error: "Failed to generate message" }, 500);
  }
}
