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

Find who they are, their current role and company, where they are based, and one specific, real detail Pat could reference (a product they shipped, a recent launch, a problem their company is solving). Do not invent anything.

ALWAYS return valid JSON, no markdown. Use empty strings for fields you cannot find:
{"first_name":"<first name>","last_name":"<last name>","title":"<current role>","company":"<current company>","location":"<city, state or country>","research_notes":"<2-3 sentences on who they are and their recent work>","hook":"<one specific, real observation Pat can open with -- a point of view, never flattery>"}

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
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        tool_choice: { type: "any" },
        tools: [{ type: "web_search_20250305", name: "web_search" }],
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

    const parsed = JSON.parse(stripFences(textContent || "{}"));

    if (parsed.error === "not_found") {
      return json({ error: "not_found" }, 404);
    }

    // Format name as "First Last" with a single space, never underscore (Hard Rule #2).
    const fullName =
      parsed.first_name && parsed.last_name
        ? `${parsed.first_name} ${parsed.last_name}`
        : parsed.first_name || parsed.last_name || name;

    return json({
      name:           fullName,
      first_name:     parsed.first_name     || "",
      last_name:      parsed.last_name      || "",
      title:          parsed.title          || "",
      company:        parsed.company        || company,
      location:       parsed.location       || "",
      research_notes: parsed.research_notes || "",
      hook:           parsed.hook           || "",
    });
  } catch (err) {
    console.error("research-person:", err.message);
    return json({ error: "Failed to research person" }, 500);
  }
}
