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

  const { jd } = body;
  if (!jd?.trim()) {
    return json({ error: "jd is required" }, 400);
  }

  const prompt = `${PAT_PROFILE}

Evaluate this job description for Pat.

Job description:
${jd}

Industry fit scoring:
Primary targets (score strong): travel, gaming, entertainment, e-commerce
Secondary targets (score moderate): AI, fintech
Adjacent consumer-facing (score moderate): food/QSR, media, music streaming, retail, sports
Explicit mismatches (score low, flag): telecom, B2B SaaS, insurance, ad-driven business models, EdTech, healthcare, climate/energy tech

Travel includes: travel booking, hospitality, tourism, experiences, maps/navigation, trip planning
Gaming includes: video game studios, game platforms, esports, gaming peripherals, game streaming
Entertainment includes: streaming platforms, film/TV studios, music platforms, live events, sports entertainment
E-commerce includes: DTC brands, marketplaces, retail platforms, shopping tools, commerce infrastructure

Company size is NOT a disqualifier. Large companies (Google, Netflix, Spotify, Amazon, Meta, Blizzard) are valid targets. The actual disqualifier is bureaucracy that slows shipping combined with design having no strategic voice. Look for signals of this in the JD, not company size. Do NOT flag a role just because the company is large or well-known.

Valid flag examples (use where applicable):
- "Travel industry -- primary target"
- "Gaming industry -- primary target"
- "B2B SaaS -- explicit mismatch"
- "Telecom -- explicit mismatch, Pat's current industry"
- "Design appears executional -- no strategic involvement signals"
- "Large company, no design influence signals"
- "Agency model -- deliverable-focused, not product-focused" / "Agency model -- confirm product vs campaign focus before applying"

Respond ONLY with valid JSON, no markdown:
{"fit_score":<0-100>,"company":"<exact company name from JD, empty string if unclear>","industry":"<industry>","industry_fit":"strong|moderate|mismatch","role_level":"<Senior|Lead|Staff|Principal|Other>","strengths":["<specific reason Pat is a strong match — cite his past work or a concrete detail from the JD>"],"gaps":["<specific concern, skill gap, or mismatch — be concrete, not generic>"],"summary":"<3-4 sentences on fit, gaps, whether Pat should pursue>","search_titles":["<title 1>","<title 2>","<title 3>"]}

For strengths and gaps: 2-4 bullets each, specific and evidence-based. For search_titles: 3 exact LinkedIn-searchable titles to target.`;

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
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Anthropic error:", detail);
      return json({ error: `Anthropic error ${res.status}: ${detail}` }, 502);
    }

    const data = await res.json();
    const textBlock = data.content?.find((b) => b.type === "text");
    const parsed = JSON.parse(stripFences(textBlock?.text || "{}"));
    return json(parsed);
  } catch (err) {
    console.error("analyze-jd:", err.message);
    return json({ error: "Failed to analyze job description" }, 500);
  }
}
