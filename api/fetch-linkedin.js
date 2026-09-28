export const config = { runtime: "edge" };

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

function getSlug(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    const inIdx = parts.indexOf("in");
    return inIdx >= 0 ? parts[inIdx + 1] || "" : "";
  } catch {
    return "";
  }
}

// Convert "john-doe-designer-abc123" → "john doe" (first two hyphen-separated words)
function slugToName(slug) {
  return slug
    .split("-")
    .filter(s => !/^\d+$/.test(s))   // drop pure-number segments
    .slice(0, 3)
    .join(" ")
    .toLowerCase();
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

  const { url } = body;
  if (!url?.trim()) {
    return json({ error: "url is required" }, 400);
  }

  const slug = getSlug(url);
  const nameHint = slugToName(slug);

  const prompt = `Search for this LinkedIn profile and extract the person's information: ${url}

Run these two searches:
1. site:linkedin.com/in/${slug}
2. "${nameHint}" linkedin

LinkedIn profiles often appear in Google as a title snippet like: "John Doe - Product Designer at Acme Corp - San Francisco Bay Area". Extract the person's details from whatever snippets or pages you find that reference this profile.

ALWAYS return valid JSON, no markdown. Use empty strings for any fields you could not find:
{"first_name":"<first name>","last_name":"<last name>","title":"<most recent job title>","company":"<most recent employer>","location":"<city, state or country>"}

Only return {"error":"not_found"} if you found absolutely no information about this person at all.`;

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
        // Pure field extraction, so thinking is off: it would add cost without
        // better results, and the API rejects it with a forced tool call anyway.
        // max_uses caps the paid web searches.
        model: "claude-sonnet-5",
        thinking: { type: "disabled" },
        max_tokens: 400,
        tool_choice: { type: "any" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
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

    // No parseable JSON, an explicit not_found, or every field empty -> treat as
    // "not found" rather than an error. LinkedIn blocks Google indexing of
    // profiles, so a web-search lookup often genuinely finds nothing.
    const hasAnyField =
      parsed &&
      (parsed.first_name || parsed.last_name || parsed.title || parsed.company || parsed.location);

    if (!parsed || parsed.error === "not_found" || !hasAnyField) {
      return json({ error: "not_found" }, 404);
    }

    // Ensure name is "First Last" with a single space, never underscore
    const name =
      parsed.first_name && parsed.last_name
        ? `${parsed.first_name} ${parsed.last_name}`
        : parsed.first_name || parsed.last_name || "";

    return json({
      name,
      first_name: parsed.first_name || "",
      last_name:  parsed.last_name  || "",
      title:      parsed.title      || "",
      company:    parsed.company    || "",
      location:   parsed.location   || "",
    });
  } catch (err) {
    console.error("fetch-linkedin:", err.message);
    return json({ error: "Failed to fetch LinkedIn profile", detail: err.message }, 500);
  }
}
