export const config = { runtime: "edge" };

import { PAT_PROFILE } from "./lib/profile.js";

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
- Close with a low-pressure invitation: a short conversation about fit, not a proposal.

Format: 2-3 short paragraphs. No greeting header. No subject line. Under 250 words. Conversational, not formal.

After the message, include a short PERSONALIZATION NOTES section explaining 2-3 key choices made.`;

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { posting } = body;
  if (!posting?.trim()) {
    return json({ error: "posting is required" }, 400);
  }

  const userMessage = `Here is a freelance job posting (Contra, Upwork, or similar) Pat is applying to:

---
${posting}
---

Write the pitch following all tone and structure rules. Then add a PERSONALIZATION NOTES section.

Return as JSON only, no markdown:
{
  "message": "<the full application message, plain text, newlines as \\n>",
  "notes": "<personalization notes, 2-3 key choices explained, plain text>"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Anthropic error:", detail);
      return json({ error: "Anthropic API error", detail: res.status }, 502);
    }

    const data = await res.json();
    const textBlock = data.content?.find((b) => b.type === "text");
    const parsed = JSON.parse(stripFences(textBlock?.text || "{}"));

    if (!parsed.message || !parsed.notes) {
      return json({ error: "Unexpected response format from model" }, 502);
    }

    return json(parsed);
  } catch (err) {
    console.error("generate-pitch:", err.message);
    return json({ error: "Failed to generate message" }, 500);
  }
}
