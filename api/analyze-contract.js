export const config = { runtime: "edge" };

import { PAT_PROFILE } from "./lib/profile.js";

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

// Freelance criteria live here rather than in PAT_PROFILE because they are
// specific to contract work and do not apply to the full-time job analysis.
// Edit the rate floor and the hours ceiling in this one place.
const FREELANCE_CRITERIA = `Freelance contract scoring criteria.

These criteria are for PART-TIME contract work taken alongside a full-time job. They are deliberately different from how a full-time role would be judged.

RATE AND BUDGET (heavy weight)
Pat's rate floor is $75/hour.
- $75/hour or above: strong
- $50 to $75/hour: moderate
- Below $50/hour: mismatch
For a fixed-price budget, convert it to an implied hourly rate using the stated hours, or your best estimate of the hours the described scope would actually take, then score against the bands above. Show your conversion reasoning in the summary.
Score rate_fit on the converted number itself. If the implied hourly clears $75, rate_fit is "strong" even when the budget is fixed-price. Doubt about whether the hour estimate will hold is a real concern, but it belongs in gaps, not in a downgraded rate_fit. Do not mark a rate down twice for the same uncertainty.
If no rate or budget is stated at all, set rate_fit to "unstated". An unstated budget is a question to ask the client, NOT a rejection. Do not lower fit_score much for it.
Equity-only, revenue-share, "exposure", or deferred payment is a mismatch AND a red flag.

TIME COMMITMENT (heavy weight)
Pat has a full-time job. His ceiling is 20 hours per week, worked on his own schedule.
- Under 20 hours/week: strong
- Right at 20 hours/week: moderate
- Above 20 hours/week, "full-time", or "40 hours": mismatch
Also score as mismatch if the contract requires weekday daytime availability: daily standups, core-hours overlap, on-call rotation, or scheduled meetings during business hours. Async and flexible-schedule work scores strong.
If hours are not stated, set time_fit to "unstated" and estimate the realistic commitment from the described scope in the summary.

SCOPE FIT (moderate weight)
Score the work itself against Pat's actual strengths from his profile above: product design, end-to-end consumer flows, design systems, e-commerce and shopping experiences, prototyping, and production front-end (HTML, CSS, React).
Clearly defined deliverables with a stated timeline score higher than open-ended, ongoing, or vaguely described engagements.
Work far outside his strengths (motion graphics, 3D, print, illustration, brand identity from scratch) is a mismatch.

INDUSTRY (informational only, effectively zero weight)
Report the industry in the industry field and then stop reasoning about it.
CRITICAL OVERRIDE: the TARGET INDUSTRIES section of Pat's profile above, including its "explicit passes" list (telecom, B2B SaaS, insurance, ad-driven, EdTech, healthcare, climate/energy), applies ONLY to full-time career moves. It does NOT apply here. Contract work is paid work, not a career move, and it does not go on his resume as a role.
A well-paid, well-scoped, part-time-compatible contract is a good contract regardless of industry. A B2B SaaS, insurance, healthcare, or telecom contract at $100/hour for 15 hours a week is a GOOD contract and should score high.
Do not lower fit_score because of the industry. Do not list the industry as a gap or a red flag. Do not mention the industry as a reason to deprioritize the contract in the summary. Rate, time commitment, scope, and red flags are the only things that drive the score.

RED FLAGS (list them, and lower fit_score when present)
Only list red flags that are actually present in the posting. Do not invent them. Watch for:
- Vague or undefined scope, no concrete deliverables
- Unpaid test projects, spec work, or "sample task" requests
- Equity-only, revenue-share, or deferred compensation
- Unrealistic timelines for the described scope
- Scope-creep signals: "and other tasks as needed", "wear many hats", "help with whatever comes up"
- No named client, product, or company
- Rate-haggling language: "looking for the best rate", "budget-friendly", "long-term potential at a lower rate to start"
- A full-time job described as a contract to avoid paying benefits
- Requests for free work, unclear ownership or IP terms, or no contract mentioned`;

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

  const { contract } = body;
  if (!contract?.trim()) {
    return json({ error: "contract is required" }, 400);
  }

  const prompt = `${PAT_PROFILE}

Evaluate this freelance contract posting for Pat.

Freelance posting:
${contract}

${FREELANCE_CRITERIA}

Scoring: fit_score is an overall 0-100 judgment of whether Pat should pursue this contract. Weight rate and time commitment most heavily, then scope, then red flags. Industry should barely move the number.

Never use em dashes in any field of your response.

The "rate" and "hours" fields are rendered as small badges in a UI, so they must be SHORT and scannable. Keep each under 30 characters. Compress rather than quote verbatim.
Good rate values: "$95/hour", "$18,000 fixed (~$120/hr)", "Not stated", "Equity only".
Good hours values: "15 hrs/week, 10 weeks", "12-15 hrs/week", "Full-time", "Not stated".
Put the detail and the reasoning in strengths, gaps, and summary, not in these two fields.

Respond ONLY with valid JSON, no markdown:
{"fit_score":<0-100>,"client":"<client or company name from the posting, empty string if unclear>","project_type":"<short description of the work, e.g. 'Mobile app redesign'>","industry":"<industry>","rate":"<stated rate or budget verbatim, or 'Not stated'>","rate_fit":"strong|moderate|mismatch|unstated","hours":"<stated time commitment verbatim, or 'Not stated'>","time_fit":"strong|moderate|mismatch|unstated","scope_fit":"strong|moderate|mismatch","strengths":["<specific reason this is a good contract for Pat, cite his past work or a concrete detail from the posting>"],"gaps":["<specific concern or unknown to clarify before pitching>"],"red_flags":["<concrete warning sign actually present in the posting>"],"summary":"<3-4 sentences: is this worth pursuing, and what to clarify before pitching>"}

For strengths and gaps: 2-4 bullets each, specific and evidence-based. For red_flags: 0-4 bullets, empty array if the posting is clean.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Anthropic error:", detail);
      return json({ error: `Anthropic error ${res.status}: ${detail}` }, 502);
    }

    const data = await res.json();
    const textBlock = data.content?.find((b) => b.type === "text");
    const parsed = JSON.parse(stripFences(textBlock?.text || "{}"));
    return json(parsed);
  } catch (err) {
    console.error("analyze-contract:", err.message);
    return json({ error: "Failed to analyze contract" }, 500);
  }
}
