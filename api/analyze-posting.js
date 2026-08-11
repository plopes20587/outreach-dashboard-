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

const FULLTIME_RUBRIC = `Score across five dimensions:

1. Industry fit
   Primary (strong): travel, gaming, entertainment, e-commerce
   Secondary (moderate): AI, fintech
   Adjacent (moderate): food/QSR, media, music streaming, retail, sports
   Explicit mismatches (mismatch, flag): telecom, B2B SaaS, insurance, ad-driven models, EdTech, healthcare, climate/energy tech
   Company size is NOT a disqualifier. The disqualifier is bureaucracy that slows shipping combined with design having no strategic voice.

2. Role level fit
   Strong: Lead, Staff, Principal, or UX Engineer with strategic scope
   Moderate: Senior Product Designer with clear ownership
   Mismatch: Senior IC with no strategic involvement or purely executional scope

3. Strategic involvement
   Strong: "own the design direction," "partner with leadership," "define the experience," "shape product strategy," "influence roadmap"
   Weak: "execute designs," "work from provided specs," "support the design team"
   Flag if executional even when the title sounds senior.

4. AI environment
   Strong: AI used as a tool in the team's workflow, named tools like Cursor, Copilot, Claude
   Neutral: no mention
   Flag: AI is the product or market but not part of how the team works

5. Environment signals
   Strong: "collaborative from ideation," "design has a seat at the table," "autonomous team"
   Warning: heavy process or documentation emphasis without autonomy language, "will be reviewed by"

fit_score weighting: industry 25%, role level 20%, strategic 25%, AI environment 15%, environment signals 15%.`;

const FREELANCE_RUBRIC = `Score against the freelance contract scoring criteria above. Industry is reported but carries ZERO weight: the explicit passes list applies to full-time career moves only, not to contract work. A well-paid B2B SaaS contract is fine.`;

// Only meaningful for freelance results: both fields render as small badges, and
// a verbatim string wraps the badge row onto multiple lines.
const BADGE_RULES = `The "rate" and "hours" fields are rendered as small badges in a UI, so they must be SHORT and scannable. Keep each under 30 characters. Compress rather than quote verbatim.
Good rate values: "$95/hour", "$18,000 fixed (~$120/hr)", "Not stated", "Equity only".
Good hours values: "15 hrs/week, 10 weeks", "12-15 hrs/week", "Full-time", "Not stated".
Put the detail and the reasoning in strengths, gaps, and summary, not in these two fields.`;

const FULLTIME_SCHEMA = `{"posting_type":"full-time","fit_score":<0-100>,"company":"<name or empty>","industry":"<industry>","industry_fit":"strong|moderate|mismatch","role_level":"<Senior|Lead|Staff|Principal|Other>","strategic_fit":"strong|moderate|weak","ai_environment":"strong|neutral|flag","environment_signals":"strong|neutral|warning","strengths":["<2-4 specific, evidence-based>"],"gaps":["<2-4 specific>"],"summary":"<4-5 sentences covering all five dimensions and whether Pat should pursue>","search_titles":["<title 1>","<title 2>","<title 3>"]}`;

const FREELANCE_SCHEMA = `{"posting_type":"freelance","fit_score":<0-100>,"client":"<name or empty>","project_type":"<short description>","industry":"<industry, reported only>","rate":"<max 30 chars, or 'Not stated'>","rate_fit":"strong|moderate|mismatch|unstated","hours":"<max 30 chars, or 'Not stated'>","time_fit":"strong|moderate|mismatch|unstated","scope_fit":"strong|moderate|mismatch","strengths":["<2-4>"],"gaps":["<2-4>"],"red_flags":["<0-4, empty array if clean>"],"summary":"<3-4 sentences>"}`;

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

  const { posting, forceType } = body;
  if (!posting?.trim()) {
    return json({ error: "posting is required" }, 400);
  }

  // Only two rubrics exist, so anything else is ignored rather than passed
  // through into the prompt as an unvalidated instruction.
  const override =
    forceType === "full-time" || forceType === "freelance" ? forceType : null;

  // An override does not argue with detection, it replaces it. An earlier version
  // appended an "OVERRIDE:" line to the detection rules while still presenting both
  // rubrics and both schemas; a posting with strong signals for the other type won
  // that argument every time and the override silently did nothing. Presenting only
  // the chosen rubric removes the conflict, and cuts prompt size as a side effect.
  // The freelance criteria and badge rules are dead weight on a full-time-only
  // analysis, so they are omitted there rather than left to be ignored.
  const wantsFreelance = override !== "full-time";

  const typeSection = override
    ? `POSTING TYPE (already decided)
This posting has been classified as a ${override.toUpperCase()} posting by the user, who is explicitly overriding automatic detection. Do NOT re-classify it from its own signals, even if those signals point the other way. Set "posting_type" to "${override}" and score it using only the rubric below.`
    : `DETECTION
First determine whether this is a FULL-TIME JOB or a FREELANCE CONTRACT, then evaluate it against the matching rubric.
Full-time signals: annual salary or salary band, benefits, PTO, equity/RSUs, "full-time," "FTE," "permanent," reporting structure, onboarding, team headcount
Freelance signals: hourly rate, project budget, fixed fee, "contract," "freelance," "part-time," "3 month engagement," milestone-based payment, statement of work, "1099"
When signals conflict, weight payment structure most heavily: an annual salary means full-time, an hourly or project rate means freelance.`;

  const rubricSection = override
    ? (override === "freelance" ? FREELANCE_RUBRIC : FULLTIME_RUBRIC)
    : `IF FULL-TIME, ${FULLTIME_RUBRIC}\n\nIF FREELANCE, ${FREELANCE_RUBRIC}`;

  const schemaSection = override
    ? `Respond ONLY with valid JSON, no markdown, in exactly this shape:\n\n${override === "freelance" ? FREELANCE_SCHEMA : FULLTIME_SCHEMA}`
    : `Respond ONLY with valid JSON, no markdown. Include "posting_type" plus the fields for that type only.\n\nFor full-time:\n${FULLTIME_SCHEMA}\n\nFor freelance:\n${FREELANCE_SCHEMA}`;

  const prompt = `${PAT_PROFILE}
${wantsFreelance ? `\n${FREELANCE_CRITERIA}\n` : ""}
${typeSection}

Posting:
${posting}

${rubricSection}

Never use em dashes in any field of your response.
${wantsFreelance ? `\n${BADGE_RULES}\n` : ""}
${schemaSection}`;

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
        max_tokens: 1400,
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

    // The whole UI branches on posting_type, so a response missing it would
    // render as neither layout. Fall back to the override when there was one,
    // otherwise to full-time, rather than returning something unrenderable.
    if (parsed.posting_type !== "full-time" && parsed.posting_type !== "freelance") {
      parsed.posting_type = override || "full-time";
    }

    return json(parsed);
  } catch (err) {
    console.error("analyze-posting:", err.message);
    return json({ error: "Failed to analyze posting" }, 500);
  }
}
