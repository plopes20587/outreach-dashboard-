// Plumbing shared by every /api endpoint. Each of these used to be copied into
// up to seven files, and the copies had already started to drift apart (one
// stripFences was reformatted, search-linkedin had its own near-copy of
// extractJson). One copy means a fix lands everywhere at once.

export const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Browsers send an OPTIONS "preflight" before a cross-origin POST to ask what
// is allowed. Returns the answer for that, or null for every other request.
export function preflight(request) {
  return request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: CORS })
    : null;
}

// Returns a 500 response naming the first missing env var, or null when all
// are set. The name is safe to show; the value never is.
export function missingEnv(...names) {
  const missing = names.find((name) => !process.env[name]);
  return missing ? json({ error: `${missing} is not configured` }, 500) : null;
}

// Parses a POST body. Returns the object, or null when it is not valid JSON so
// the caller can answer 400 instead of crashing.
export async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
}

// Pulls JSON out of model text. With web search on, Claude often wraps the JSON
// in prose or citations, so a plain JSON.parse throws. Tries a clean parse,
// then the outermost {...} or [...] block. Returns null instead of throwing, so
// a caller can answer "not found" rather than 500.
export function extractJson(text) {
  if (!text) return null;
  const stripped = stripFences(text);
  const candidates = [stripped];
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const start = stripped.indexOf(open);
    const end = stripped.lastIndexOf(close);
    if (start >= 0 && end > start) candidates.push(stripped.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// Hard Rule #2: names are "First Last" with a single space, never underscores.
export function formatName(firstName, lastName, fallback = "") {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

// Hard Rule #1: never an em dash. Prompts ask for this, but anything that ends
// up in a sent message or the Notion tracker is stripped anyway, since one that
// slips through is costly.
export function noEmDash(text) {
  return typeof text === "string" ? text.replace(/\s*\u2014\s*/g, ", ") : text;
}

// A failure from a service we call (Anthropic, Hunter, Notion), as opposed to a
// bug in our own code. It carries the service's own short error message, which
// is safe to show and usually says what to fix, but never its raw response
// body or a stack trace.
export class UpstreamError extends Error {
  constructor(service, status, upstreamMessage = "") {
    super(`${service} error ${status}${upstreamMessage ? `: ${upstreamMessage}` : ""}`);
    this.status = status;
  }
}

// Reads the human-readable message out of a failed upstream response. Each
// service nests it differently, so this checks the known shapes and caps the
// length rather than passing a raw body through.
export async function upstreamMessage(res) {
  const raw = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* not JSON */
  }
  const message =
    parsed?.error?.message ||        // Anthropic
    parsed?.message ||               // Notion
    parsed?.errors?.[0]?.details ||  // Hunter
    "";
  return String(message).slice(0, 200);
}

// The one way an endpoint turns a caught error into a response. Upstream
// failures are 502 (a service we depend on failed) with its message; anything
// else is our own bug, so the client gets a generic 500 and the details stay in
// the server log.
export function errorResponse(err, endpoint, fallbackMessage) {
  console.error(`${endpoint}:`, err.message);
  return err instanceof UpstreamError
    ? json({ error: err.message }, 502)
    : json({ error: fallbackMessage }, 500);
}
