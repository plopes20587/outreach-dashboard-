export const config = { runtime: "edge" };

import { json, preflight, missingEnv, readBody, extractJson, formatName, noEmDash, errorResponse } from "./lib/http.js";
import { callClaude } from "./lib/anthropic.js";

// The freshness levels the Contact card knows how to render. Anything else the
// model returns is coerced to "moderate" rather than shown as an empty badge.
const CONFIDENCE_LEVELS = ["high", "moderate", "low"];

// Research a person from either a URL (Product Hunt, Crunchbase, company site,
// LinkedIn) or a name + company. Used by the "Research a person" panel for
// freelance acquisition (UC2). This is research/enrichment only -- it does NOT
// write outreach messages, so it does not touch the Claude.ai handoff.
export default async function handler(request) {
  const earlyResponse = preflight(request) || missingEnv("ANTHROPIC_API_KEY");
  if (earlyResponse) return earlyResponse;

  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request body" }, 400);

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

Find who they are, their current role and company, what the company actually does, where they are based, and one specific, real detail Pat could reference (a product they shipped, a recent launch, a problem their company is solving). Do not invent anything.

Report how fresh your findings actually are. Web pages about a person are frequently out of date, and Pat needs to know when to double check a title before he sends a message:
- as_of: the most recent date you have real evidence for on their role and company, as "YYYY-MM". Use "Unknown" when no page you read carried a date. Never guess it from today's date.
- confidence: "high" when a current, dated source states the role; "moderate" when your sources are undated or more than a year old; "low" when the role is inferred rather than stated anywhere.
- sources: up to 3 plain URLs of pages you actually used. Do not invent URLs.

Never use em dashes in any field (CLAUDE.md Hard Rule #1). This text is read straight into an outreach prompt and into the Notion tracker, so it has to follow the same writing rules as everything else Pat sends.

ALWAYS return valid JSON, no markdown. Use empty strings for fields you cannot find:
{"first_name":"<first name>","last_name":"<last name>","title":"<current role>","company":"<current company>","location":"<city, state or country>","research_notes":"<2-3 sentences on who they are and their recent work>","company_context":"<1-2 sentences on what the company does, its stage or size, and what it is currently shipping>","hook":"<one specific, real observation Pat can open with -- a point of view, never flattery>","as_of":"<YYYY-MM or Unknown>","confidence":"high|moderate|low","sources":["<url>"]}

Only return {"error":"not_found"} if you found absolutely nothing about this person.`;

  try {
    // A forced web search with thinking off, which is what keeps research from
    // answering out of stale memory. max_uses caps the paid searches.
    const textContent = await callClaude({ prompt, maxTokens: 1200, webSearchUses: 3 });

    const parsed = extractJson(textContent);

    if (!parsed || parsed.error === "not_found") {
      return json({ error: "not_found" }, 404);
    }

    return json({
      name:            formatName(parsed.first_name, parsed.last_name, name),
      first_name:      parsed.first_name      || "",
      last_name:       parsed.last_name       || "",
      title:           parsed.title           || "",
      company:         parsed.company         || company,
      location:        parsed.location        || "",
      // These three are read straight into the outreach prompt and the Notion
      // note, so an em dash the model slipped in is stripped (Hard Rule #1).
      research_notes:  noEmDash(parsed.research_notes  || ""),
      company_context: noEmDash(parsed.company_context || ""),
      hook:            noEmDash(parsed.hook            || ""),
      // Freshness metadata. confidence is validated against the three known
      // values because it drives a badge variant in the Contact card, and an
      // unexpected string would render an uncolored pill.
      as_of:           parsed.as_of           || "Unknown",
      confidence:      CONFIDENCE_LEVELS.includes(parsed.confidence) ? parsed.confidence : "moderate",
      sources:         Array.isArray(parsed.sources) ? parsed.sources.filter(Boolean).slice(0, 3) : [],
    });
  } catch (err) {
    return errorResponse(err, "research-person", "Failed to research person");
  }
}
