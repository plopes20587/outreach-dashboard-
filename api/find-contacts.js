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

// Hunter sits behind Cloudflare, which intermittently returns a transient
// 502/503/504 ("Bad Gateway") even when the API itself is healthy. These
// almost always succeed on a quick retry, so we retry transient upstream
// failures with a short increasing backoff before giving up. We do NOT retry
// 4xx errors (bad key, bad domain), since those will never self-resolve.
// Returns { data } on success or { error, status, detail } on failure.
async function fetchHunter(params) {
  const hunterUrl =
    "https://api.hunter.io/v2/domain-search?" +
    new URLSearchParams({ ...params, api_key: process.env.HUNTER_API_KEY });

  const TRANSIENT_STATUSES = [502, 503, 504];
  const MAX_ATTEMPTS = 3;
  let lastErrorDetail = "";
  let lastErrorStatus = 502;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(hunterUrl);

      if (res.ok) {
        return { data: await res.json() };
      }

      const detail = await res.text();
      lastErrorDetail = detail;
      lastErrorStatus = res.status;

      // Non-transient (e.g. 401 bad key, 400 bad domain): fail immediately.
      if (!TRANSIENT_STATUSES.includes(res.status)) {
        console.error(`Hunter error ${res.status}:`, detail);
        return { error: `Hunter.io error ${res.status}: ${detail}`, status: 502 };
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

  return {
    error: `Hunter.io is temporarily unavailable (${lastErrorStatus}). Please try again in a moment.`,
    detail: lastErrorDetail,
    status: 502,
  };
}

// The plan caps a search at 10 results, and unfiltered those slots fill with
// engineers and sales at any large company, all of which the frontend then
// drops (at consensys.io, 2 of 10 kept unfiltered vs 6 of 10 on design,hr).
// So the search widens in tiers: designers and recruiters first, then product
// leads and founders, then everyone, because Hunter leaves many people
// untagged by department. It stops at the first tier with 2+ named people.
// Hunter does not charge for a search with no results, so the extra tiers
// cost little on a dead domain.
const DEPARTMENT_TIERS = ["design,hr", "management,executive", null];

const namedCount = (data) =>
  (data?.data?.emails || []).filter((e) => e.first_name || e.last_name).length;

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!process.env.HUNTER_API_KEY) {
    return json({ error: "HUNTER_API_KEY is not configured" }, 500);
  }

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim();
  // Pat's Hunter plan caps a domain-search at 10 results; asking for more
  // returns a pagination_error 400. Do not raise without checking the plan.
  const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10) || 10, 10);

  if (!domain) {
    return json({ error: "domain query param is required" }, 400);
  }

  // Basic domain sanitization: strip protocol, path, whitespace
  const cleanDomain = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  // personal skips role inboxes (info@, jobs@), which have no name and get
  // dropped anyway.
  const baseParams = { domain: cleanDomain, limit: String(limit), type: "personal" };

  let best = null;
  for (const department of DEPARTMENT_TIERS) {
    const result = await fetchHunter(department ? { ...baseParams, department } : baseParams);
    if (result.error) {
      // A failure on the first tier is the real error. A later tier failing
      // should not throw away what an earlier tier already found.
      if (!best) return json({ error: result.error, detail: result.detail }, result.status);
      break;
    }
    if (!best || namedCount(result.data) > namedCount(best)) best = result.data;
    if (namedCount(best) >= 2) break;
  }

  return json(best);
}
