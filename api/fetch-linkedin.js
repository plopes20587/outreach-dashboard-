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

  const prompt = `Look up this LinkedIn profile and extract the person's information: ${url}

Search for: site:linkedin.com/in/${slug}

Return ONLY valid JSON, no markdown:
{"first_name":"<first name>","last_name":"<last name>","title":"<most recent job title>","company":"<most recent employer>","location":"<city, state or country>"}

Use the real name from their profile, not the URL slug. If not found, return: {"error":"not_found"}`;

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
        model: "claude-sonnet-4-5",
        max_tokens: 512,
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
    return json({ error: "Failed to fetch LinkedIn profile" }, 500);
  }
}
