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

  const { company, titles } = body;
  if (!company?.trim()) {
    return json({ error: "company is required" }, 400);
  }

  const titleList = Array.isArray(titles) ? titles.slice(0, 3) : [];
  const queries = titleList.length > 0
    ? titleList.map((t) => `"${company}" "${t}" linkedin.com/in`).join("\n")
    : `"${company}" designer linkedin.com/in`;

  const prompt = `Search the web for LinkedIn profiles of people at ${company} using these queries:
${queries}

Look for linkedin.com/in/ URLs in the search results — they may appear in portfolio sites, conference attendee lists, blog posts, GitHub profiles, or anywhere else on the web. Extract name, job title, and LinkedIn URL for each person you find.

Return ONLY a valid JSON array, no markdown:
[{"name":"<First Last>","linkedin":"<full linkedin.com/in/... URL>","title":"<job title>","snippet":"<brief context>","contact_type":"<Hiring Manager|Recruiter|Boss Hunt|Referral>"}]

If no profiles found after searching, return: []`;

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
        max_tokens: 1024,
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

    let results;
    try {
      results = JSON.parse(stripFences(textContent || "[]"));
      if (!Array.isArray(results)) results = [];
    } catch {
      results = [];
    }

    return json(results);
  } catch (err) {
    console.error("search-linkedin:", err.message);
    return json({ error: "Failed to search LinkedIn" }, 500);
  }
}
