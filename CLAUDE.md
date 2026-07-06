# CLAUDE.md — Outreach Dashboard Build Spec

This file is the source of truth for building Pat Lopes's outreach dashboard. Read it fully before writing any code. When in doubt, prefer simplicity and existing patterns in this file over inventing new ones.

---

## Project Goal

A personal-use web app that streamlines Pat's outreach workflow for both LinkedIn job opportunities and Contra freelance postings. The current process — pasting JDs into Claude, manually finding contacts on LinkedIn, looking up emails on Hunter.io, manually entering everything in Notion — gets compressed into a few clicks per contact.

This is a single-user tool. No auth, no multi-tenant, no user accounts. Pat is the only user.

---

## Owner Profile (used in prompts)

The full `PAT_PROFILE` constant is provided as a separate file `profile.js` alongside this CLAUDE.md. Copy that file's contents verbatim into `src/lib/profile.js` during Phase 1 scaffolding. Do NOT inline a shorter version of it here.

The profile is structured into labeled sections (Core Differentiator, Current Role, Signature Work, Target Roles, Target Industries, Strengths, Skills, Positioning Rules). The structure exists so the LLM can pull the right context for the right prompt. Do NOT collapse it into prose or rewrite it for brevity.

`PAT_PROFILE` is imported by:
- `api/analyze-jd.js` (full string injected into the JD analysis prompt)
- `api/generate-pitch.js` (relevant sections referenced in the system prompt)

Both serverless functions need access to the same constant. The cleanest approach: put `profile.js` at `src/lib/profile.js` and also create a thin `api/lib/profile.js` that re-exports from a shared location, OR duplicate the file (simpler, less ceremony). Pick the simpler option.

---

## Architecture Overview

The system is two cooperating tools, not one:

```
┌─────────────────────────────────────────────────────┐      ┌──────────────────────────────────────────┐
│  THIS APP (local Vite + Vercel)                       │      │  CLAUDE.AI PROJECT                       │
│                                                       │      │                                          │
│  Owns deterministic, repeatable work:                 │      │  Owns contextual writing:               │
│  • JD fit analysis                                    │      │  • Outreach message generation          │
│  • Hunter.io contact lookup                           │ ───> │    (uses outreach-composer skill +      │
│  • LinkedIn profile fetch                             │      │     project memory + reference          │
│  • Notion tracker writes                              │      │     templates: Boss Hunting,            │
│  • Contra application messages (self-contained)       │      │     Cold Outreach, Warm Outreach,       │
│  • Builds outreach prompts to copy to clipboard       │      │     Informational Interview)           │
└─────────────────────────────────────────────────────┘      └──────────────────────────────────────────┘
```

The "Draft outreach" button in this app does NOT call an LLM. It builds a structured prompt string and copies it to the clipboard. Pat manually pastes that into Claude.ai, where his skills and memory generate the actual message.

The Contra tab is the one exception. Contra messages have a specific repeatable format, so the freelance tone rules are baked into the serverless function's system prompt and the message is generated end-to-end in this app.

DO NOT build any LLM-powered outreach generation for the LinkedIn flow in this app. That's a hard rule and is enforced in the Hard Rules section below.

---

## Tech Stack

- **Vite** + **React 18** (no Next.js, no TypeScript — keep it simple, JSX only)
- **Vanilla CSS** with CSS variables for theming (no Tailwind, no styled-components)
- **No state management library** — `useState` and `useReducer` only
- **No router** — single-page app with tab state
- **Vercel** for hosting and serverless functions
- **Anthropic Messages API** via Vercel serverless function (NOT direct from browser)
- **Hunter.io** via Vercel serverless function (NOT direct from browser)
- **Notion API** via Vercel serverless function (NOT direct from browser)

### Why no direct browser → API calls

Three reasons, all critical:
1. **Security:** API keys must never be in the bundled JS. They live as Vercel environment variables only.
2. **CORS:** Hunter.io and Notion both block browser-origin requests. Must proxy through serverless.
3. **Future-proofing:** When Pat wants to add features like email enrichment, lead scoring, or batch import, having a server layer makes those additions trivial.

---

## File Structure

```
outreach-app/
├── api/                          # Vercel serverless functions
│   ├── analyze-jd.js             # POST → calls Anthropic to analyze a JD
│   ├── find-contacts.js          # GET ?domain=... → proxies Hunter.io domain-search
│   ├── fetch-linkedin.js         # POST {url} → calls Anthropic with web_search to scrape a profile
│   ├── search-linkedin.js        # POST {company, titles} → calls Anthropic with web_search for LinkedIn fallback
│   ├── research-person.js        # POST {url}|{name,company} → calls Anthropic with web_search to research a founder/CEO (UC2)
│   ├── push-notion.js            # POST {contact} → creates a page in the Notion tracker
│   └── generate-pitch.js         # POST {posting} → calls Anthropic to write a freelance pitch (Contra/Upwork/etc.)
├── src/
│   ├── App.jsx                   # Root with tab switcher
│   ├── main.jsx                  # Vite entry
│   ├── styles.css                # Global styles + CSS variables for theming
│   ├── lib/
│   │   ├── profile.js            # PAT_PROFILE constant
│   │   ├── api.js                # Frontend wrappers for /api/* endpoints
│   │   ├── contact.js            # initContact() blank-contact factory + applyProfile() field merge (shared)
│   │   └── notion-schema.js      # Notion data source ID and field mappings
│   ├── components/
│   │   ├── Tabs.jsx              # Top tab bar
│   │   ├── Field.jsx             # Label + input wrapper
│   │   ├── Card.jsx              # Card container: plain title or collapsible/optional header
│   │   ├── Button.jsx            # Variants: default, blue, green, purple, coral
│   │   ├── Badge.jsx             # Status pills (green/amber/red/blue/neutral)
│   │   ├── ContactCard.jsx       # Selectable contact result card
│   │   ├── ContactPanel.jsx      # Shared always-visible Contact card + Notion/Draft outreach; LinkedIn fetch status comes in via props
│   │   ├── ResearchCard.jsx      # Self-contained "Research a person" card (UC2); reports results via onResult, reset by key remount
│   │   ├── PromptBox.jsx         # Copy-to-clipboard prompt display
│   │   └── FitBar.jsx            # Score bar with color coding
│   ├── tabs/
│   │   ├── OutreachTab.jsx       # Job-based outreach (UC1): JD fit → find contacts → shared ContactPanel → outreach handoff
│   │   └── PitchTab.jsx          # Freelance flow: ResearchCard (UC2) → shared ContactPanel, and Contra/Upwork posting → pitch (UC3)
│   └── hooks/
│       ├── useCopy.js            # Hook for clipboard copy with copied state
│       └── useLinkedInFetch.js   # Hook owning one LinkedIn fetch + fetching/fetchStatus, shared by every fetch trigger
├── .env.example                  # Documents required env vars (no real values)
├── .gitignore                    # node_modules, .env, dist
├── package.json
├── vite.config.js
├── vercel.json                   # Optional: rewrites or function config
├── README.md                     # Setup and deploy instructions
└── CLAUDE.md                     # This file
```

---

## Required Environment Variables (Vercel)

Document these in `.env.example`. Pat sets them in the Vercel dashboard, not in any committed file.

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | For the Anthropic API calls: JD analysis, LinkedIn fetch, LinkedIn search, person research |
| `GROQ_API_KEY` | Yes | For the Freelance Pitch tab (`generate-pitch`), which uses Groq's free tier |
| `HUNTER_API_KEY` | Yes | For Hunter.io domain-search |
| `NOTION_API_KEY` | Yes | Internal integration token for the Notion workspace |
| `NOTION_DATABASE_ID` | Yes | The Contact Tracker database ID: `2f312b17-d357-8155-b06f-000b29a1c83f` |
| `ALLOWED_ORIGIN` | No | Defaults to `*` for dev. Set in production for security. |

---

## Visual Design

### Color tokens (CSS variables in `styles.css`)

Use the dark palette throughout. No light mode — single forced dark theme.

```css
:root {
  --bg-0: #0f0f0e;
  --bg-1: #1a1a18;
  --bg-2: #232320;
  --bg-3: #2c2c29;

  --border:   rgba(255, 255, 255, 0.07);
  --border-2: rgba(255, 255, 255, 0.13);

  --text:    #f0ede8;
  --text-2:  #888680;

  /* Accent ramps — each has color, border, and tinted bg */
  --blue:     #85B7EB;
  --blue-bd:  #378ADD;
  --blue-bg:  #042C53;

  --green:    #5DCAA5;
  --green-bd: #1D9E75;
  --green-bg: #04342C;

  --amber:    #EF9F27;
  --amber-bd: #BA7517;
  --amber-bg: #412402;

  --red:      #F09595;
  --red-bd:   #E24B4A;
  --red-bg:   #501313;

  --purple:    #AFA9EC;
  --purple-bd: #7F77DD;
  --purple-bg: #26215C;

  --coral:    #F0997B;
  --coral-bd: #D85A30;
  --coral-bg: #4A1B0C;

  --radius:    12px;
  --radius-md: 8px;
  --radius-sm: 6px;
}
```

### Layout

- Body: `background: var(--bg-0)`
- Max width: 720px, centered, `padding: 24px 16px` on outer wrapper
- Vertical stacking with 14px gap between cards
- Cards: `background: var(--bg-1)`, `border: 0.5px solid var(--border)`, `border-radius: var(--radius)`, `padding: 20px`

### Typography

- Font: `system-ui, -apple-system, sans-serif`
- Body: `13px`
- Labels: `12px`, `var(--text-2)`
- Step titles: `14px`, weight `500`, `var(--text)`
- Fit score: `22px`, weight `500`

### Inputs

- `background: var(--bg-2)`, `border: 0.5px solid var(--border-2)`, `border-radius: var(--radius-sm)`, `padding: 7px 10px`, `font-size: 13px`
- No focus ring shadow — just `border-color` change to white-ish on focus
- Textareas: same as inputs but with `resize: none` and explicit row count

### Buttons

Five variants: `default`, `blue` (primary), `green` (success/Notion), `purple` (outreach prompt), `coral` (Contra). All share base styles:

- `padding: 7px 14px`, `border-radius: var(--radius-sm)`, `font-size: 13px`, `font-weight: 500`
- 0.5px borders matching the variant color
- Tinted bg matching the variant
- `cursor: pointer`, `transition: background 0.15s`

### Tabs

Sticky bar at top inside a `var(--bg-1)` rounded container with 6px padding. Each tab is a button: 8px 14px padding, 8px radius. Active tab has `var(--bg-2)` background; inactive is transparent with `var(--text-2)`.

---

## Tab 1: Outreach Flow (UC1, job-based)

This tab handles the job-based entry point:
- **UC1 (job-based):** paste a JD → fit analysis → find contacts (Hunter/LinkedIn) → contact card.

(Person research — UC2 — lives on the Freelance Pitch tab, since Pat only researches founders/CEOs for freelance acquisition. See Tab 2.)

The JD analysis and Find contacts sections are collapsible **optional** panels (no numbered steps); the Contact card (the shared `ContactPanel` component) is always visible. The "Draft outreach" button still does NOT call an LLM (Hard Rule #9) -- it builds an enriched prompt (fit summary, contact/lead type, and a suggested reference template) and copies it to the clipboard for Pat's Claude.ai outreach-composer skill.

### State (in `OutreachTab.jsx`)

The Contact card's own state (`pushing`, `notionStatus`, `outreachPrompt`) lives inside the shared `ContactPanel` component. The LinkedIn fetch + its `fetching`/`fetchStatus` badge state come from the `useLinkedInFetch(setContact)` hook, owned by the tab and passed into `ContactPanel` so the badge fires for search-select, manual URL, and the card's own field alike. `OutreachTab` keeps the search/analysis state and lifts `contact`/`setContact`, passing them plus `fit` into `<ContactPanel>`.

```js
const [jd, setJd] = useState("");
const [analyzing, setAnalyzing] = useState(false);
const [fit, setFit] = useState(null);  // { fit_score, company, industry, industry_fit, role_level, flags, summary, search_titles }
const [company, setCompany] = useState("");
const [domain, setDomain] = useState("");
const [searching, setSearching] = useState(false);    // LinkedIn fallback
const [searchResults, setSearchResults] = useState([]);
const [searchDone, setSearchDone] = useState(false);
const [hunterError, setHunterError] = useState(null);
const [selIdx, setSelIdx] = useState(null);
const [showManual, setShowManual] = useState(false);
const [manualUrl, setManualUrl] = useState("");
const [contact, setContact] = useState(initContact());
const { fetching, fetchStatus, setFetchStatus, fetchLinkedIn } = useLinkedInFetch(setContact);
```

`initContact()` (exported from `ContactPanel.jsx`) returns:

```js
{ name: "", company: "", title: "", location: "", email: "", linkedin: "",
  contactType: "", leadType: "", status: "Did not send" }
```

### Step 1: Job Description

- Card with step number 1, title "Job description"
- Textarea, 7 rows, full width
- Buttons: `Analyze fit` (blue, primary), `Clear` (default)
- On analyze: POST to `/api/analyze-jd` with `{ jd, profile: PAT_PROFILE }`. Set `fit` state on response.
- Auto-extract company name and pre-fill both `company` and a guessed `domain` (lowercased company + ".com")

### Step 2: Fit Analysis & Contact Search

Visible only after analyze succeeds.

- Score row: `{score}/100` (22px text) + horizontal bar (5px tall, full width). Bar color: green ≥75, amber ≥50, red <50.
- Tags row: industry fit pill (green/amber/red), role level pill (blue), and any flags (neutral).
- Summary in a `var(--bg-2)` box, line-height 1.7.
- Divider.
- Two-column grid: `Company` input + `Company domain (for Hunter.io)` input.
- Hunter proxy section: text label "Hunter.io proxy URL" + `Configured` badge if set. Click "Configure" to reveal the input. URL is saved to `sessionStorage` under key `hunterProxy` so it persists across the tab session.
- **Wait — see "API Architecture" below. Pat is moving to a real backend, so the proxy URL field comes OUT.** Hunter calls go directly to `/api/find-contacts` on the same Vercel deployment. No proxy URL state needed.
- One action button: `Search` (green). It queries both sources from a single click. Hunter.io (fast, needs a domain) runs first and its results render immediately; the LinkedIn web-search fallback (slow, and a paid Anthropic web search) runs **only when Hunter returns fewer than 2 contacts** and is merged in when it arrives. Enabled when either a domain or a company is present. (The fallback was previously fired on every Search; it is now gated to the Hunter-empty case for cost efficiency.)
- Loading states: the button shows "Searching..." while pending. While the LinkedIn pass is still running after Hunter results appear, show a muted "Also checking LinkedIn..." line above the results.
- Error display in red-tinted box if Hunter fails. LinkedIn errors are swallowed (best-effort augment) so a LinkedIn miss never wipes out Hunter results.

### Search Results

- Header: "{n} contact(s) found — select one to populate the profile below"
- Each result is a `ContactCard`:
  - Avatar circle with initials
  - Name (13px, weight 500)
  - Title (12px, text-2)
  - Email if present (11px, green)
  - Snippet if present (12px, text-2)
  - LinkedIn URL link (11px, blue, opens in new tab, stops propagation)
  - Contact type pill if present (neutral tag)
  - "Selected" indicator on right when active
- Click anywhere on the card to select. If it has a LinkedIn URL with `linkedin.com/in/`, also trigger `/api/fetch-linkedin` to enrich data. Always populate name, title, email, linkedin, contact type, and company from the result.
- Below results: "None of these — add a LinkedIn URL manually" toggle button.

**Feedback grouping (UX):** every message this action can produce renders **inside the Find contacts card**, so it is always clear which action caused it (this mirrors how the Analyze card shows its fit results inline). That means: the Hunter error, the search results, the empty state, and the manual look-up feedback all live in this one card — no floating notices between cards. The empty state ("No contacts found for X. Add someone by LinkedIn URL below.") uses the neutral `notice-info` style, not `notice-error`, because "no results" is a normal outcome, not a failure. It is hidden once a profile has been loaded (`fetchStatus === "ok"`), and `fetchStatus` is cleared at the start of each new Search.

### Manual LinkedIn URL Entry

Rendered inside the Find contacts card. Visible when the "add a LinkedIn URL manually" toggle is on, or automatically when a search returns no results.

- Single input + green "Look up profile" button (label "Looking up..." while pending)
- On click: calls `/api/fetch-linkedin` with the URL via the shared `useLinkedInFetch` hook
- Its own success/error notice appears right below it ("Profile loaded into the contact below." / "Couldn't load that profile...")
- Result populates the contact profile fields below

### Step 3: Contact Profile

Always visible at the bottom.

- 2-column grid: `Contact name *`, `Company *`
- 2-column grid: `Title`, `Location`
- 2-column grid: `Email (from Hunter.io)`, `LinkedIn URL — paste and press Enter to auto-fill` with status badge inline
  - LinkedIn input has `onBlur` and `onKeyDown` (Enter) handlers that call `/api/fetch-linkedin`
  - Badge states: `Fetching profile...` (amber), `Profile loaded` (green), `Could not load — fill in manually` (red)
- 3-column grid:
  - `Contact type` select: Hiring Manager, Boss Hunt, Recruiter, Referral, Informational, Freelance/Client
  - `Lead type` select: Cold, Warm-ish, Warm
  - `Status` select: Did not send (default), Email Sent, Follow-up Sent, Responded, No response
- Divider.
- Three buttons:
  - `Push to Notion` (green) — POST to `/api/push-notion`. On Email Sent or Follow-up Sent status, also include today's date and a +10-day follow-up date.
  - `Draft outreach` (purple) — generates a prompt string with all contact context and shows it in a copy-to-clipboard box (PromptBox component) for Pat to paste into Claude.
  - `Reset` (default) — clears the contact profile fields.
- Success/error notice bars below buttons.

### Draft Outreach Prompt Format

**IMPORTANT ARCHITECTURE NOTE:** Outreach message generation is intentionally NOT performed by the local app. The local app's only job here is to build a structured prompt string and copy it to the clipboard. Pat then pastes that prompt into Claude.ai (his Claude project), where his custom outreach-composer skill, project memory, and reference templates (Boss Hunting Playbook, Cold Outreach Strategy, Warm Outreach Strategy, Informational Interview templates) generate the final message.

This split exists because:
- The contact-type nuance (Hiring Manager vs Boss Hunt vs Recruiter vs Referral vs Informational) requires reference files that live only in Claude.ai
- The local app handles deterministic work (data lookup, Notion writes, JD analysis); Claude.ai handles contextual writing
- This avoids duplicating skill content across two places that would need to stay in sync

**Do NOT build a `/api/draft-outreach` endpoint.** Do NOT add Anthropic calls for outreach generation. The button is purely a clipboard copy interaction.

The frontend builds the prompt using exactly this function (no LLM call):

```js
function buildOutreachPrompt(contact, fit) {
  let msg = `Draft an outreach message for ${contact.name || "this contact"}`;
  if (contact.title)   msg += `, ${contact.title}`;
  if (contact.company) msg += ` at ${contact.company}`;
  msg += ".";
  if (contact.contactType) msg += ` Contact type: ${contact.contactType}.`;
  if (contact.leadType)    msg += ` Lead type: ${contact.leadType}.`;
  if (contact.linkedin)    msg += ` LinkedIn: ${contact.linkedin}.`;
  if (contact.location)    msg += ` Location: ${contact.location}.`;
  if (fit?.summary)        msg += ` Fit context: ${fit.summary.substring(0, 300)}`;
  return msg;
}
```

The PromptBox component renders this in a `<textarea readOnly>` so it's natively selectable and copyable. Use `document.execCommand("copy")` via a hidden textarea for the Copy button. `navigator.clipboard` can be unreliable in some browsers/contexts.

PromptBox should also include a small helper line below the textarea, in muted text:

> "Paste into your Claude project to generate the message using your outreach skill and templates."

This makes the handoff between tools explicit in the UI so Pat doesn't lose the workflow context when he comes back to this after a break.

---

## Tab 2: Freelance Flow (UC2 person research + UC3 pitch)

This tab serves Pat's freelance acquisition. It hosts two independent workflows, top to bottom:

- **UC2 (person research):** research a founder/CEO by URL or name+company (`/api/research-person`) → the shared `ContactPanel` contact card. Research notes + hook feed the "Draft outreach" clipboard prompt (Hard Rule #9 preserved — no LLM writes the message here). The contact can be pushed to Notion.
- **UC3 (pitch):** paste a freelance posting (Contra, Upwork, or similar) → generate a tailored pitch end-to-end. No contact is saved for this workflow.

Independent state from the Outreach tab (no shared runtime context; only the `ContactPanel` UI is shared).

### State

```js
// UC3 pitch
const [posting, setPosting] = useState("");
const [generating, setGenerating] = useState(false);
const [result, setResult] = useState(null);  // { message, notes }
const [error, setError] = useState(false);

// UC2 person research (populates the shared ContactPanel)
const [contact, setContact] = useState(initContact());
const [researchData, setResearchData] = useState(null);  // { research_notes, hook }
const [researchKey, setResearchKey] = useState(0);        // bump to remount ResearchCard on Reset
const { fetching, fetchStatus, setFetchStatus, fetchLinkedIn } = useLinkedInFetch(setContact);
```

The research inputs (mode, URL, name, company, loading, error) live inside `ResearchCard`, not the tab.

### Research a person (UC2)

- Rendered as `<ResearchCard key={researchKey} onResult={handleResearchResult} />` at the top of the tab.
- `ResearchCard` is a plain titled `Card` (not collapsible). Mode toggle: `By URL` / `By name + company`. URL mode is a single input (Product Hunt, Crunchbase, site, or LinkedIn); name mode is a two-column name + company grid.
- `Research person` button (green) calls `/api/research-person`. On success `ResearchCard` renders the notes + hook and calls `onResult(data, resolvedLinkedin)`; the tab's `handleResearchResult` merges the profile into the contact via `applyProfile` (plus the resolved LinkedIn URL) and stores `{ research_notes, hook }` in `researchData`.
- Below it, render `<ContactPanel contact={contact} setContact={setContact} research={researchData} fetching={fetching} fetchStatus={fetchStatus} setFetchStatus={setFetchStatus} onFetchLinkedIn={fetchLinkedIn} onReset={() => { setResearchData(null); setResearchKey((k) => k + 1); }} />`. Reset clears the results and remounts `ResearchCard` (via `researchKey`) so its inputs clear too.

### Step 1: Posting Input

- Textarea, 9 rows, "Paste the full Contra job posting here..."
- Buttons: `Generate application message` (coral, primary), `Clear` (default)

### Step 2: Result

Visible after generation succeeds.

- Header bar: "Ready to copy into Contra" + Copy button (coral)
- Message in a coral-bordered textarea, 10 rows, readonly, click-to-select-all
- Divider, then "Personalization notes" label + plain text in a bordered notes box
- `Regenerate` button at the bottom

### Generation Logic

POST to `/api/generate-pitch` with `{ posting }`. The serverless function uses a system prompt baked in (see API spec below) to enforce tone rules.

---

## API Architecture (Vercel Serverless Functions)

All functions are **Edge Runtime** (`export const config = { runtime: "edge" }`) for no cold starts.

All functions return JSON. All set CORS headers based on `ALLOWED_ORIGIN` env var (default `*` for dev).

### Standard CORS Helper

Each function uses this pattern:

```js
const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

if (request.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: corsHeaders });
}
```

### `/api/analyze-jd` (POST)

**Request:** `{ jd: string }`

**Behavior:** Call Anthropic Messages API with claude-sonnet-4-20250514, max_tokens 800. Build the prompt server-side using `PAT_PROFILE` (also imported into `/api/lib/profile.js` so it's available server-side).

**Prompt template:**
```
${PAT_PROFILE}

Evaluate this job description for Pat.

Job description:
${jd}

Respond ONLY with valid JSON, no markdown:
{"fit_score":<0-100>,"company":"<exact company name from JD, empty string if unclear>","industry":"<industry>","industry_fit":"strong|moderate|mismatch","role_level":"<Senior|Lead|Staff|Principal|Other>","flags":["<flag>"],"summary":"<3-4 sentences on fit, gaps, whether Pat should pursue>","search_titles":["<title 1>","<title 2>","<title 3>"]}

For search_titles: 3 exact LinkedIn-searchable titles to target.
```

**Response:** Pass through the parsed JSON object. Strip code fences if present.

### `/api/find-contacts` (GET)

**Query params:** `domain` (required), `limit` (default 25)

**Behavior:** Sanitize domain, hit `https://api.hunter.io/v2/domain-search?domain=...&limit=...&api_key=${HUNTER_API_KEY}`, return Hunter's response as-is.

**Important:** Do NOT score/filter contacts on the server. Return raw Hunter results — let the frontend handle the scoring logic. Keeps the API thin and lets the frontend tweak ranking without redeploys.

### `/api/fetch-linkedin` (POST)

**Request:** `{ url: string }`

**Behavior:** Call Anthropic with the web_search tool. Uses `claude-haiku-4-5` (this is pure field extraction, so Haiku is enough at ~3x lower token cost than Sonnet) with `max_tokens` 400 and web_search capped at `max_uses: 2` for cost efficiency. Use this prompt:

```
Look up this LinkedIn profile and extract the person's information: ${url}

Search for: site:linkedin.com/in/${slug}

Return ONLY valid JSON, no markdown:
{"first_name":"<first name>","last_name":"<last name>","title":"<most recent job title>","company":"<most recent employer>","location":"<city, state or country>"}

Use the real name from their profile, not the URL slug. If not found, return: {"error":"not_found"}
```

**Response:** Parse the JSON from Anthropic's response. Format the name as `${first_name} ${last_name}` (single space, NOT underscore — explicitly NOT underscore, this was a bug Pat caught earlier).

### `/api/search-linkedin` (POST)

**Request:** `{ company: string, titles: string[] }`

**Behavior:** Call Anthropic with web_search. Run `site:linkedin.com/in "${company}" "${title}"` queries for each title. Parse out real LinkedIn profile URLs from results. Return array of `{ name, linkedin, title, snippet, contact_type }`. Uses `claude-haiku-4-5` with `max_tokens` 512 and web_search capped at `max_uses: 2` for cost efficiency.

This is the LinkedIn fallback when Hunter doesn't return useful results, and the frontend now calls it **only when Hunter returns fewer than 2 contacts** (cost efficiency). Note: this is unreliable since LinkedIn blocks Google indexing of profiles — keep the implementation as it is in the current artifact and accept that it may return empty.

### `/api/push-notion` (POST)

**Request:** `{ contact: { name, company, title, location, email, linkedin, contactType, leadType, status } }`

**Behavior:** Use the Notion REST API directly (NOT the MCP server, since that's an interactive tool). Required headers:

```
Authorization: Bearer ${NOTION_API_KEY}
Notion-Version: 2022-06-28
Content-Type: application/json
```

POST to `https://api.notion.com/v1/pages` with body:

```js
{
  parent: { database_id: NOTION_DATABASE_ID },
  properties: {
    "Contact Name": { title: [{ text: { content: contact.name } }] },
    "Company": { rich_text: [{ text: { content: contact.company } }] },
    ...(contact.title    && { "Title":    { rich_text: [{ text: { content: contact.title    } }] } }),
    ...(contact.location && { "Location": { rich_text: [{ text: { content: contact.location } }] } }),
    ...(contact.email    && { "Email":    { email: contact.email } }),
    ...(contact.linkedin && { "Linkedin": { url: contact.linkedin } }),
    ...(contact.contactType && { "Contact Type": { select: { name: contact.contactType } } }),
    ...(contact.leadType    && { "Lead Type":    { select: { name: contact.leadType    } } }),
    "Status": { select: { name: contact.status || "Did not send" } },
    ...((contact.status === "Email Sent" || contact.status === "Follow-up Sent") && {
      "Email Sent":     { date: { start: today() } },
      "Follow up date": { date: { start: tenDaysFromNow() } },
    }),
  }
}
```

**Important:** The first time Pat deploys, he needs to:
1. Create a Notion internal integration at `https://www.notion.so/profile/integrations`
2. Copy the integration token to `NOTION_API_KEY`
3. **Share the Contact Tracker database with the integration** (Notion → database → Connections → add the integration). Without this, the API will 404.

Document this in the README.

### `/api/research-person` (POST)

**Request:** `{ url?: string, name?: string, company?: string }` (at least one of `url` or `name` required)

**Behavior:** Call Anthropic with the web_search tool (mirror `fetch-linkedin.js`, but kept on `claude-sonnet-4-6` because writing research notes and a hook needs reasoning; web_search capped at `max_uses: 3`) to research a founder/CEO for freelance outreach (UC2). Return JSON: `{ name, first_name, last_name, title, company, location, research_notes, hook }`, where `research_notes` is 2-3 sentences and `hook` is one specific real observation to open with. Name formatted as `First Last`. This is research/enrichment only -- it does not write outreach (Hard Rule #9 preserved).

### `/api/generate-pitch` (POST)

**Request:** `{ posting: string }`

**Behavior:** Call Groq (`llama-3.3-70b-versatile`, free tier, OpenAI-compatible `chat/completions` endpoint) with a system prompt that combines `PAT_PROFILE` (imported from `lib/profile.js`) with the Contra-specific tone rules below. Groq is used here instead of Anthropic as a cost decision (see Hard Rule #7 exception); the request uses `response_format: { type: "json_object" }` to guarantee a `{ message, notes }` JSON object. The system prompt should follow this template:

```js
const systemPrompt = `${PAT_PROFILE}

You are writing a Contra application message on Pat's behalf.

Tone rules (strictly enforced):
- Never use em dashes
- Write in plain, conversational language. No buzzwords, no corporate speak.
- Short and specific beats long and general. Restraint signals seniority.
- No performed insight. Do not write "I was drawn to your work" or "what struck me about your approach was" unless there is a specific, real reason from the posting. If a sentence exists to sound thoughtful rather than to say something true, cut it.
- The message should answer implicitly: "why do you understand my problem?" before it answers "what can you do?"
- Lead with a specific observation about their product, UX, or problem from the posting. Not a compliment, a point of view.
- Connect Pat's relevant past work briefly. Not a bio, a signal.
- Close with a low-pressure invitation: a short conversation about fit, not a proposal.

Format: 2-3 short paragraphs. No greeting header. No subject line. Under 250 words. Conversational, not formal.

After the message, include a short PERSONALIZATION NOTES section explaining 2-3 key choices made.`;
```

This way, when Pat updates his profile (new role, new project, new differentiator), the Contra messages automatically reflect that without editing the serverless function. The tone rules stay separate because they're specific to Contra.

**User message:**

```
Here is a Contra job posting Pat is applying to:

---
${posting}
---

Write the application message following all tone and structure rules. Then add a PERSONALIZATION NOTES section.

Return as JSON only, no markdown:
{
  "message": "<the full application message, plain text, newlines as \\n>",
  "notes": "<personalization notes, 2-3 key choices explained, plain text>"
}
```

Use Groq `llama-3.3-70b-versatile` with `max_tokens` 1200.

---

## Frontend API Client (`src/lib/api.js`)

Single module that wraps every `/api/*` call. Example pattern:

```js
const API_BASE = ""; // Same origin

async function request(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  analyzeJD:        (jd)               => request("/api/analyze-jd",        { method: "POST", body: JSON.stringify({ jd }) }),
  findContacts:     (domain, limit=25) => request(`/api/find-contacts?domain=${encodeURIComponent(domain)}&limit=${limit}`),
  fetchLinkedIn:    (url)              => request("/api/fetch-linkedin",    { method: "POST", body: JSON.stringify({ url }) }),
  searchLinkedIn:   (company, titles)  => request("/api/search-linkedin",   { method: "POST", body: JSON.stringify({ company, titles }) }),
  researchPerson:   ({ url, name, company }) => request("/api/research-person", { method: "POST", body: JSON.stringify({ url, name, company }) }),
  pushNotion:       (contact)          => request("/api/push-notion",       { method: "POST", body: JSON.stringify({ contact }) }),
  generatePitch:    (posting)          => request("/api/generate-pitch",    { method: "POST", body: JSON.stringify({ posting }) }),
};
```

Components import `api` and call methods directly. Errors bubble up as exceptions and components handle them.

---

## Hunter Result Filtering & Classification (Frontend)

When `findContacts` returns Hunter's response, classify and rank each contact. EVERY named contact is surfaced -- titles that do not match a known category fall through to "Other" with a low score so they still appear, just ranked below the relevant roles. A contact is only dropped when it has no usable name. (This replaces the earlier drop-everything rule: Pat wants to see all possible contacts in an org from one Search, then pick.) Classification is split into a pure `classifyTitle(title)` helper that returns `{ score, contactType }`, reused by both the Hunter and LinkedIn result mappers so both sources rank on one scale.

**Six categories (in priority order):**

| Category | Score | Criteria |
|----------|-------|---------|
| Hiring Manager | 100 | Design/UX/experience + leadership keyword, OR creative director/head of creative |
| Referral | 80 | Design IC titles (product designer, UX designer, etc.) -- excludes graphic/fashion/industrial/game |
| Recruiter | 70 | Recruit/talent/sourcer titles -- excludes sales, finance, legal, ops recruiters |
| Informational | 50 | Product manager/lead/director/VP/CPO, design ops, UX research, service/content designer, design engineer |
| Boss Hunt | 40 | Founder, co-founder, CEO -- fallback for small startups with no design leader |
| Other | 10 | Everything else (CFO, CTO, VP Sales, marketing, engineering, ops, legal, etc.) and contacts with no title. Still surfaced, ranked last. |

```js
// Pure helper: title -> { score, contactType }. Never drops; unmatched -> Other.
function classifyTitle(title = "") {
  const designLeader =
    /(design|ux|user\s*experience)/i.test(title) &&
    /(head|director|vp|chief|lead|principal|staff|manager)/i.test(title);

  const creativeLeader =
    /(creative\s*director|head\s*of\s*creative|chief\s*creative)/i.test(title);

  const designIC =
    /(product\s*designer|ux\s*designer|ui\s*designer|senior\s*designer|interaction\s*designer|visual\s*designer|brand\s*designer)/i.test(title) ||
    (/(designer)/i.test(title) && !/(graphic|merchandise|fashion|interior|industrial|game)/i.test(title));

  const recruiter =
    /(recruit|talent\s*acquisition|sourcer|talent\s*partner)/i.test(title) &&
    !/(sales|finance|legal|operations|account|customer\s*success)\s*recruit/i.test(title);

  const informational =
    /(product\s*manager|product\s*lead|head\s*of\s*product|director\s*of\s*product|vp\s*of\s*product|chief\s*product)/i.test(title) ||
    /(design\s*ops|designops|design\s*operations)/i.test(title) ||
    /(ux\s*research|user\s*research|ux\s*researcher|user\s*researcher|design\s*research)/i.test(title) ||
    /(service\s*designer|content\s*designer|content\s*strategist|ux\s*writer)/i.test(title) ||
    /(design\s*technologist|design\s*engineer|prototyper)/i.test(title);

  const founder = /(founder|co-founder|ceo)/i.test(title);

  if (designLeader || creativeLeader) return { score: 100, contactType: "Hiring Manager" };
  if (designIC)                       return { score: 80,  contactType: "Referral" };
  if (recruiter)                      return { score: 70,  contactType: "Recruiter" };
  if (informational)                  return { score: 50,  contactType: "Informational" };
  if (founder)                        return { score: 40,  contactType: "Boss Hunt" };
  return { score: 10, contactType: "Other" };
}

// Hunter record -> unified result. Dropped only when there is no usable name.
function classifyContact(person, targetTitles = []) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  if (!fullName) return null;

  const title = person.position || "";
  let { score, contactType } = classifyTitle(title);

  const t = title.toLowerCase();
  targetTitles.forEach(target => {
    const keyword = target.toLowerCase().split(" ")[0];
    if (keyword && t.includes(keyword)) score += 5;
  });

  return {
    name: fullName,
    email: person.value || "",
    title,
    linkedin: person.linkedin || "",
    contact_type: contactType,
    snippet: person.department ? `Dept: ${person.department}` : "",
    score,
  };
}

// Then (no slice -- show every named contact, ranked):
const scored = (data.data?.emails || [])
  .map(p => classifyContact(p, fit?.search_titles || []))
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);
```

LinkedIn results from `/api/search-linkedin` are normalized through the same `classifyTitle` (via a `mapLinkedInResult` helper) and merged into the Hunter list with a `mergeContacts` helper that de-dupes by email, then normalized LinkedIn URL, then lowercased name (the record with an email wins, missing fields backfilled from the other).

**Verification table:**

| Title | Expected result |
|-------|-----------------|
| "Chief Financial Officer" | Other, score 10 |
| "VP of Solutions Engineering" | Other, score 10 |
| "Program Director" | Other, score 10 |
| "Senior Director of Marketing" | Other, score 10 |
| "Sales Recruiter" | Other, score 10 |
| "CEO" | Boss Hunt, score 40 |
| "Senior Technical Recruiter" | Recruiter, score 70 |
| "Head of Design" | Hiring Manager, score 100 |
| "Director of Product Design" | Hiring Manager, score 100 |
| "Senior Product Designer" | Referral, score 80 |
| "Brand Designer" | Referral, score 80 |
| "Senior Product Manager" | Informational, score 50 |
| "Head of Product" | Informational, score 50 |
| "VP of Product" | Informational, score 50 |
| "Senior UX Researcher" | Informational, score 50 |
| "Design Operations Manager" | Hiring Manager, score 100 |
| "Content Designer" | Referral, score 80 |
| "Design Engineer" | Informational, score 50 |

---

## Build Order (for the agent)

Execute in this order. Do not skip ahead.

### Phase 1: Scaffolding

1. `npm create vite@latest outreach-app -- --template react`
2. `cd outreach-app && npm install`
3. Delete the boilerplate: `src/App.css`, `src/App.jsx` content, `public/vite.svg`, default styles in `index.css`
4. Replace `src/index.css` with `src/styles.css` and import in `main.jsx`
5. Set up `.gitignore`, `.env.example`, `README.md`, `CLAUDE.md` (this file)
6. Create the directory structure under `src/` and `api/`

### Phase 2: Component Library

Build these in order, with no API calls yet, so the visual layer is testable in isolation:

1. `styles.css` with all CSS variables
2. `Card.jsx` — wraps content with step number, title, padding
3. `Field.jsx` — label + children + optional badge
4. `Button.jsx` — accepts variant prop, renders styled button
5. `Badge.jsx` — accepts variant + children
6. `Tabs.jsx` — tab bar, accepts active + onChange
7. `FitBar.jsx` — score number + bar
8. `ContactCard.jsx` — full contact result card
9. `PromptBox.jsx` — copyable prompt display with select-all on click
10. `useCopy.js` hook — wraps execCommand-based copy with copied state

### Phase 3: Tab Layouts (no API yet)

11. `OutreachTab.jsx` — full UI with all state, but API calls just throw "not implemented"
12. `PitchTab.jsx` — full UI with all state, same approach
13. `App.jsx` — root with Tabs + active tab

At this point, run `npm run dev` and verify all visuals match the dark theme spec, all interactions work locally (typing, selecting, etc), and there are no console errors.

### Phase 4: Backend Functions

Build all six `/api/*` endpoints. Test each one independently by hitting it with curl or the browser before wiring it to the frontend. Functions should:

- Use Edge Runtime
- Set CORS headers
- Validate required env vars and return 500 with a clear message if missing
- Return JSON with consistent shape: `{ ...data }` on success, `{ error: "...", detail?: "..." }` on failure
- Never expose env vars or stack traces to the client

### Phase 5: Wiring

14. Build `src/lib/api.js`
15. Wire each component method to the API client
16. Add error handling: every API call wrapped in try/catch, errors shown in the appropriate notice box

### Phase 6: Deploy

17. Push to GitHub
18. Import in Vercel
19. Set all 5 env vars in Vercel
20. Deploy
21. Test the production URL end-to-end
22. Update `ALLOWED_ORIGIN` to the production URL once verified

---

## Hard Rules

These are NOT suggestions. The agent must follow them strictly.

1. **No em dashes anywhere.** Not in comments, not in UI strings, not in prompts. Pat's memory bank is explicit on this.
2. **The contact name format is `First Last` with a single space.** Not `First_Last`. Not `firstName.lastName`. Just first space last.
3. **API keys never appear in client code.** Not in `src/`, not in `index.html`, not in any committed file. Always backend-only.
4. **No localStorage in the artifact's React tree** for sensitive data. The Hunter proxy URL session storage from the previous artifact version is no longer needed since calls go to same-origin `/api/*`.
5. **Visual fidelity matters.** This is a designer's tool. Match the dark palette and spacing exactly. Don't introduce new colors, new spacings, or different border styles.
6. **Single-file components stay single-file.** Don't split a 50-line component into 4 files. The file structure above is the limit of how granular this should get.
7. **Use the exact Anthropic model `claude-sonnet-4-20250514`** in all backend functions. Don't substitute a different model. **Exception:** `generate-pitch` intentionally uses Groq's free tier (`llama-3.3-70b-versatile`, OpenAI-compatible API) instead of Anthropic. This is a deliberate cost decision, not a model substitution within an Anthropic call. It is safe because the pitch is self-contained (no web search, no Claude.ai skills/connectors) so the swap does not affect any other flow.
8. **Notion field names are case-sensitive.** They are: `Contact Name`, `Company`, `Title`, `Location`, `Email`, `Linkedin` (lowercase k), `Contact Type`, `Lead Type`, `Status`, `Email Sent`, `Follow up date`. Do not change these.
9. **Do NOT build LLM-powered outreach generation in the Outreach flow.** No `/api/draft-outreach` endpoint. The Draft outreach button is a pure clipboard copy of a structured prompt (now enriched with fit summary, research notes/hook, and a suggested template). Outreach writing happens in Claude.ai where Pat's skills and reference templates live. The `/api/research-person` endpoint is allowed because it only researches a person; it does not write outreach. See the Architecture Overview at the top of this doc.
10. **The Freelance Pitch tab IS the exception** to rule 9. Pitches are generated end-to-end via `/api/generate-pitch` because the tone rules are self-contained and don't need the outreach-composer skill.

---

## Future Enhancements (Don't Build Yet)

These are intentionally out of scope for v1. Note them but do NOT implement:

- Bulk JD import (paste 10 JDs, get 10 contact lists)
- Email sending (Resend, SendGrid)
- Calendar integration for follow-ups
- Browser extension for one-click LinkedIn scraping
- Multi-user support
- Saved JDs / saved contacts library
- Email templates beyond the current draft prompt

When v1 is solid and Pat's using it daily, we'll revisit.

---

## Reference: Notion Database Schema

Database ID: `2f312b17-d357-8155-b06f-000b29a1c83f`

| Field | Type | Notes |
|-------|------|-------|
| Contact Name | Title | Required, format: "First Last" |
| Company | Rich text | Required |
| Title | Rich text | Optional |
| Location | Rich text | Optional |
| Email | Email | Optional |
| Linkedin | URL | Optional, lowercase 'k' |
| Contact Type | Select | Hiring Manager, Boss Hunt, Recruiter, Referral, Informational, Freelance/Client |
| Lead Type | Select | Cold, Warm-ish, Warm |
| Status | Select | Did not send (default), Email Sent, Follow-up Sent, Responded, No response |
| Email Sent | Date | Auto-set when status changes to Email Sent or Follow-up Sent |
| Follow up date | Date | Auto-set to +10 days when Email Sent date is set |

---

End of spec.
