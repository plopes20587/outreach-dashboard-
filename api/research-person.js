export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// The freshness levels the Contact card knows how to render. Anything else the
// model returns is coerced to "moderate" rather than shown as an empty badge.
const CONFIDENCE_LEVELS = ["high", "moderate", "low"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
}

// Extract a JSON object from the model's text. With web search on, Claude often
// wraps the JSON in prose or citations, so a plain JSON.parse throws. Try a clean
// parse first, then fall back to the first {...} block. Returns null on failure
// (never throws) so the caller can respond gracefully instead of 500-ing.
function extractJson(text) {
  if (!text) return null;
  const stripped = stripFences(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Research a person from either a URL (Product Hunt, Crunchbase, company site,
// LinkedIn) or a name + company. Used by the "Research a person" panel for
// freelance acquisition (UC2). This is research/enrichment only -- it does NOT
// write outreach messages, so it does not touch the Claude.ai handoff.
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

  const url = body.url?.trim() || "";
  const name = body.name?.trim() || "";
  const company = body.company?.trim() || "";

  if (!url && !name) {
    return json({ error: "Provide either a url or a name" }, 400);
  }

  // Describe the target two ways so the model has the strongest possible search seed.
  const target = url
    ? `this profile or page: ${url}`
    : `a person named "${name}"${company ? ` who works at "${company}"` : ""}`;

  const searchHints = url
    ? `Search the web for "${url}" and related pages.`
    : `Run web searches like "${name}" "${company}", "${name}" founder, and "${name}" linkedin.`;

  const prompt = `Research ${target} so Pat can send a cold freelance-outreach message.

${searchHints}

Find who they are, their current role and company, what the company actually does, where they are based, and one specific, real detail Pat could reference (a product they shipped, a recent launch, a problem their company is solving). Do not invent anything.

Report how fresh your findings actually are. Web pages about a person are frequently out of date, and Pat needs to know when to double check a title before he sends a message:
- as_of: the most recent date you have real evidence for on their role and company, as "YYYY-MM". Use "Unknown" when no page you read carried a date. Never guess it from today's date.
- confidence: "high" when a current, dated source states the role; "moderate" when your sources are undated or more than a year old; "low" when the role is inferred rather than stated anywhere.
- sources: up to 3 plain URLs of pages you actually used. Do not invent URLs.

Never use em dashes in any field (CLAUDE.md Hard Rule #1). This text is read straight into an outreach prompt and into the Notion tracker, so it has to follow the same writing rules as everything else Pat sends.

ALWAYS return valid JSON, no markdown. Use empty strings for fields you cannot find:
{"first_name":"<first name>","last_name":"<last name>","title":"<current role>","company":"<current company>","location":"<city, state or country>","research_notes":"<2-3 sentences on who they are and their recent work>","company_context":"<1-2 sentences on what the company does, its stage or size, and what it is currently shipping>","hook":"<one specific, real observation Pat can open with -- a point of view, never flattery>","as_of":"<YYYY-MM or Unknown>","confidence":"high|moderate|low","sources":["<url>"]}

Only return {"error":"not_found"} if you found absolutely nothing about this person.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // Thinking is off because the API rejects it alongside a forced tool
        // call, and forcing the search is what keeps research from answering
        // out of stale memory. max_uses caps the paid web searches per call.
        model: "claude-sonnet-5",
        thinking: { type: "disabled" },
        max_tokens: 1200,
        tool_choice: { type: "any" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Anthropic error:", detail);
      return json({ error: "Anthropic API error", detail: res.status }, 502);
    }

    const data = await res.json();
    const textContent = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const parsed = extractJson(textContent);

    if (!parsed || parsed.error === "not_found") {
      return json({ error: "not_found" }, 404);
    }

    // Format name as "First Last" with a single space, never underscore (Hard Rule #2).
    const fullName =
      parsed.first_name && parsed.last_name
        ? `${parsed.first_name} ${parsed.last_name}`
        : parsed.first_name || parsed.last_name || name;

    return json({
      name:            fullName,
      first_name:      parsed.first_name      || "",
      last_name:       parsed.last_name       || "",
      title:           parsed.title           || "",
      company:         parsed.company         || company,
      location:        parsed.location        || "",
      research_notes:  parsed.research_notes  || "",
      company_context: parsed.company_context || "",
      hook:            parsed.hook            || "",
      // Freshness metadata. confidence is validated against the three known
      // values because it drives a badge variant in the Contact card, and an
      // unexpected string would render an uncolored pill.
      as_of:           parsed.as_of           || "Unknown",
      confidence:      CONFIDENCE_LEVELS.includes(parsed.confidence) ? parsed.confidence : "moderate",
      sources:         Array.isArray(parsed.sources) ? parsed.sources.filter(Boolean).slice(0, 3) : [],
    });
  } catch (err) {
    console.error("research-person:", err.message);
    return json({ error: "Failed to research person" }, 500);
  }
}
