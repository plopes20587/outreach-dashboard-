import { UpstreamError, upstreamMessage } from "./http.js";

// Every endpoint runs on Sonnet 5 (CLAUDE.md Hard Rule #7). One constant means
// changing the model is a one-line edit instead of five.
export const MODEL = "claude-sonnet-5";

// The one place this app calls the Anthropic Messages API. The endpoints use it
// in two shapes, and the options pick between them:
//
// - webSearchUses: forces a web search, capped at that many paid searches.
//   Thinking is off here, because the API rejects thinking alongside a forced
//   tool call, and forcing the search is what keeps answers out of stale memory.
// - effort (and optional schema): adaptive thinking, Sonnet 5's default, at
//   that effort level. Thinking counts against maxTokens, so callers leave
//   headroom; unused headroom is not billed. A schema turns on structured
//   outputs, which guarantees the reply matches it.
//
// Sonnet 5 rejects temperature and assistant prefill, so neither is ever sent.
// Returns the reply's text. Throws UpstreamError when the API call fails.
export async function callClaude({ prompt, system, maxTokens, webSearchUses, effort, schema }) {
  const usesWebSearch = Boolean(webSearchUses);

  const requestBody = {
    model: MODEL,
    max_tokens: maxTokens,
    ...(system && { system }),
    messages: [{ role: "user", content: prompt }],
    ...(usesWebSearch && {
      thinking: { type: "disabled" },
      tool_choice: { type: "any" },
      // Deliberately the 2025 version. web_search_20260209 (dynamic filtering)
      // was tested in Oct 2026 on the same three lookups: ~2.5x the tokens,
      // 10-20x slower (up to 140s, past Edge's response window), research
      // confidence dropped from high to low, and LinkedIn search found 0 people
      // instead of 3. Re-test before switching.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: webSearchUses }],
    }),
    ...(effort && {
      output_config: {
        effort,
        ...(schema && { format: { type: "json_schema", schema } }),
      },
    }),
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      ...(usesWebSearch && { "anthropic-beta": "web-search-2025-03-05" }),
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    throw new UpstreamError("Anthropic", res.status, await upstreamMessage(res));
  }

  // A web search reply interleaves text with search results and citations, so
  // every text block is joined. A thinking reply has one text block after its
  // thinking blocks, which this handles the same way.
  const data = await res.json();
  return (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
