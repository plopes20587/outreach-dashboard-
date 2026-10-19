export const config = { runtime: "edge" };

import { json, preflight, missingEnv, readBody, extractJson, errorResponse } from "./lib/http.js";
import { callClaude } from "./lib/anthropic.js";

export default async function handler(request) {
  const earlyResponse = preflight(request) || missingEnv("ANTHROPIC_API_KEY");
  if (earlyResponse) return earlyResponse;

  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request body" }, 400);

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

Look for linkedin.com/in/ URLs in the search results. They may appear in portfolio sites, conference attendee lists, blog posts, GitHub profiles, or anywhere else on the web. Extract name, job title, and LinkedIn URL for each person you find.

Return ONLY a valid JSON array, no markdown:
[{"name":"<First Last>","linkedin":"<full linkedin.com/in/... URL>","title":"<job title>","snippet":"<brief context>"}]

If no profiles found after searching, return: []`;

  try {
    // Parsing URLs out of search results, so thinking is off (callClaude does
    // that for web search calls). max_uses caps the paid web searches.
    const textContent = await callClaude({ prompt, maxTokens: 512, webSearchUses: 2 });

    // No contact_type is asked for: the frontend's classifyTitle is the one
    // thing that decides who is relevant, for Hunter and LinkedIn alike. When
    // the model chose the type, it could only pick relevant ones, so an
    // irrelevant title (a CFO) skipped the "Other" drop and was kept.
    // Any parse failure is an empty list: this is a best-effort fallback source.
    const parsed = extractJson(textContent);
    return json(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    return errorResponse(err, "search-linkedin", "Failed to search LinkedIn");
  }
}
