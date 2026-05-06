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

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!process.env.HUNTER_API_KEY) {
    return json({ error: "HUNTER_API_KEY is not configured" }, 500);
  }

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 50);

  if (!domain) {
    return json({ error: "domain query param is required" }, 400);
  }

  // Basic domain sanitization: strip protocol, path, whitespace
  const cleanDomain = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  try {
    const hunterUrl =
      `https://api.hunter.io/v2/domain-search` +
      `?domain=${encodeURIComponent(cleanDomain)}` +
      `&limit=${limit}` +
      `&api_key=${process.env.HUNTER_API_KEY}`;

    const res = await fetch(hunterUrl);

    if (!res.ok) {
      const detail = await res.text();
      console.error("Hunter error:", detail);
      return json({ error: `Hunter.io error ${res.status}: ${detail}` }, 502);
    }

    const data = await res.json();
    return json(data);
  } catch (err) {
    console.error("find-contacts:", err.message);
    return json({ error: "Failed to fetch contacts" }, 500);
  }
}
