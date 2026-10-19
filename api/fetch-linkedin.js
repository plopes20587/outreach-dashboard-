export const config = { runtime: "edge" };

import { json, preflight, missingEnv, readBody, extractJson, formatName, errorResponse } from "./lib/http.js";
import { callClaude } from "./lib/anthropic.js";

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

// Convert "john-doe-designer-abc123" to "john doe designer": the first three
// hyphen-separated words, minus number-only segments. Used as a search hint, so
// a stray third word costs nothing.
function slugToName(slug) {
  return slug
    .split("-")
    .filter(s => !/^\d+$/.test(s))   // drop pure-number segments
    .slice(0, 3)
    .join(" ")
    .toLowerCase();
}

export default async function handler(request) {
  const earlyResponse = preflight(request) || missingEnv("ANTHROPIC_API_KEY");
  if (earlyResponse) return earlyResponse;

  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request body" }, 400);

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
    // Pure field extraction, so thinking is off (callClaude does that for web
    // search calls). max_uses caps the paid web searches.
    const textContent = await callClaude({ prompt, maxTokens: 400, webSearchUses: 2 });

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

    return json({
      name:       formatName(parsed.first_name, parsed.last_name),
      first_name: parsed.first_name || "",
      last_name:  parsed.last_name  || "",
      title:      parsed.title      || "",
      company:    parsed.company    || "",
      location:   parsed.location   || "",
    });
  } catch (err) {
    return errorResponse(err, "fetch-linkedin", "Failed to fetch LinkedIn profile");
  }
}
