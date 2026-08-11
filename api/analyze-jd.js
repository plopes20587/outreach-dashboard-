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

Additional scoring dimensions:

Strategic involvement signals -- look for language indicating Pat would influence direction, not just execute it.
Strong: "own the design direction," "partner with leadership," "define the experience," "shape product strategy," "work directly with founders," "influence roadmap"
Weak: "execute designs," "work from provided specs," "support the design team," no mention of strategy or ownership
Score as strategic_fit: strong|moderate|weak. Score weak if the role appears executional even when the title sounds senior.

AI integration signals -- Pat wants environments already using AI as a thinking tool in design/product work, not just companies whose product is AI.
Strong: "AI-assisted design," "use AI tools in your workflow," explicit mention of tools like Cursor, Copilot, Claude, Midjourney
Neutral: no mention either way
Flag: companies that mention AI only as their product or market, not as part of how the team works
Score as ai_environment: strong|neutral|flag.

Environment signals -- look for language indicating trust, autonomy, and early design involvement.
Strong: "collaborative from ideation," "design has a seat at the table," "move fast," "autonomous team," "work directly with founders"
Warning: heavy emphasis on process or documentation without autonomy language, "will be reviewed by" language, "support multiple stakeholders" with no ownership framing
Score as environment_signals: strong|neutral|warning.

Respond ONLY with valid JSON, no markdown:
{"fit_score":<0-100, weighted: industry 25%, role level 20%, strategic 25%, AI environment 15%, environment signals 15%>,"company":"<exact company name from JD, empty string if unclear>","industry":"<industry>","industry_fit":"strong|moderate|mismatch","role_level":"<Senior|Lead|Staff|Principal|Other>","strategic_fit":"strong|moderate|weak","ai_environment":"strong|neutral|flag","environment_signals":"strong|neutral|warning","strengths":["<specific reason Pat is a strong match -- cite his past work or a concrete detail from the JD>"],"gaps":["<specific concern, skill gap, or mismatch -- be concrete, not generic>"],"summary":"<4-5 sentences covering industry fit, role level, strategic involvement, AI environment, and whether Pat should pursue and why>","search_titles":["<title 1>","<title 2>","<title 3>"]}

For strengths and gaps: 2-4 bullets each, specific and evidence-based. Summary should address all five dimensions. For search_titles: 3 exact LinkedIn-searchable titles to target.`;

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
        max_tokens: 1000,
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
