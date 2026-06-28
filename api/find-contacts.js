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

  const hunterUrl =
    `https://api.hunter.io/v2/domain-search` +
    `?domain=${encodeURIComponent(cleanDomain)}` +
    `&limit=${limit}` +
    `&api_key=${process.env.HUNTER_API_KEY}`;

  // Hunter sits behind Cloudflare, which intermittently returns a transient
  // 502/503/504 ("Bad Gateway") even when the API itself is healthy. These
  // almost always succeed on a quick retry, so we retry transient upstream
  // failures with a short increasing backoff before giving up. We do NOT retry
  // 4xx errors (bad key, bad domain), since those will never self-resolve.
  const TRANSIENT_STATUSES = [502, 503, 504];
  const MAX_ATTEMPTS = 3;
  let lastErrorDetail = "";
  let lastErrorStatus = 502;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(hunterUrl);

      if (res.ok) {
        const data = await res.json();
        return json(data);
      }

      const detail = await res.text();
      lastErrorDetail = detail;
      lastErrorStatus = res.status;

      // Non-transient (e.g. 401 bad key, 400 bad domain): fail immediately.
      if (!TRANSIENT_STATUSES.includes(res.status)) {
        console.error(`Hunter error ${res.status}:`, detail);
        return json({ error: `Hunter.io error ${res.status}: ${detail}` }, 502);
      }

      console.error(
        `Hunter transient error ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`
      );
    } catch (err) {
      // Network-level failure (DNS, connection reset): also worth retrying.
      lastErrorDetail = err.message;
      console.error(
        `find-contacts fetch failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err.message
      );
    }

    // Back off before the next attempt, but not after the final one.
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }

  return json(
    {
      error: `Hunter.io is temporarily unavailable (${lastErrorStatus}). Please try again in a moment.`,
      detail: lastErrorDetail,
    },
    502
  );
}
