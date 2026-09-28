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

// Return the first [...] block in the text, or "" if there is none.
function sliceArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
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
        // Parsing URLs out of search results, so thinking is off: it would add
        // cost without better results, and the API rejects it with a forced tool
        // call anyway. max_uses caps the paid web searches.
        model: "claude-sonnet-5",
        thinking: { type: "disabled" },
        max_tokens: 512,
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

    // With web search on, Claude often wraps the JSON array in prose or
    // citations, so a plain parse returns nothing. Try a clean parse, then fall
    // back to the first [...] block. Any failure yields an empty list (this is a
    // best-effort fallback source, so an empty result is acceptable).
    let results = [];
    const stripped = stripFences(textContent || "");
    for (const candidate of [stripped, sliceArray(stripped)]) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) { results = parsed; break; }
      } catch { /* try next candidate */ }
    }

    return json(results);
  } catch (err) {
    console.error("search-linkedin:", err.message);
    return json({ error: "Failed to search LinkedIn" }, 500);
  }
}
