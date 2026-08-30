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
- `api/analyze-posting.js` (full string injected into the posting analysis prompt, for both rubrics)
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
│  • Posting fit analysis (job or contract)             │      │  • Outreach message generation          │
│  • Hunter.io contact lookup                           │ ───> │    (uses outreach-composer skill +      │
│  • LinkedIn profile fetch                             │      │     project memory + reference          │
│  • Notion tracker writes                              │      │     templates: Boss Hunting,            │
│  • Freelance pitches (self-contained)                 │      │     Cold Outreach, Warm Outreach,       │
│  • Builds outreach prompts to copy to clipboard       │      │     Informational Interview)           │
└─────────────────────────────────────────────────────┘      └──────────────────────────────────────────┘
```

The "Draft outreach" button in this app does NOT call an LLM. It builds a structured prompt string and copies it to the clipboard. Pat manually pastes that into Claude.ai, where his skills and memory generate the actual message.

Generate pitch is the one exception. Freelance pitches have a specific repeatable format, so the tone rules are baked into the serverless function's system prompt and the message is generated end-to-end in this app. It sits directly beside Draft outreach in the Compose card, so the split is now between two adjacent buttons rather than two tabs: same card, different contracts.

DO NOT build any LLM-powered outreach generation for the contact flow in this app. That's a hard rule and is enforced in the Hard Rules section below.

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
│   ├── analyze-posting.js        # POST {posting, forceType?} → detects job vs contract, scores against the matching rubric
│   ├── find-contacts.js          # GET ?domain=... → proxies Hunter.io domain-search
│   ├── fetch-linkedin.js         # POST {url} → calls Anthropic with web_search to scrape a profile
│   ├── search-linkedin.js        # POST {company, titles} → calls Anthropic with web_search for LinkedIn fallback
│   ├── research-person.js        # POST {url}|{name,company} → calls Anthropic with web_search to research a founder/CEO (UC2)
│   ├── push-notion.js            # POST {contact} → creates a page in the Notion tracker
│   └── generate-pitch.js         # POST {posting, analysis?} → calls Groq to write a freelance pitch (Contra/Upwork/etc.)
├── src/
│   ├── App.jsx                   # Root wrapper; renders Dashboard (no tabs, no router)
│   ├── Dashboard.jsx             # The single page: owns all shared state, renders the four cards in a two-column workspace
│   ├── main.jsx                  # Vite entry
│   ├── styles.css                # Global styles + CSS variables for theming
│   ├── lib/
│   │   ├── profile.js            # PAT_PROFILE constant
│   │   ├── api.js                # Frontend wrappers for /api/* endpoints
│   │   ├── contact.js            # initContact() blank-contact factory + applyProfile() field merge (shared)
│   │   ├── contacts.js           # classifyTitle/classifyContact/mapLinkedInResult/mergeContacts + researchErrorMessage
│   │   └── notion-schema.js      # Notion data source ID and field mappings
│   ├── components/               # Cards 1-4 of the flow, plus the shared primitives
│   │   ├── PostingAnalyzer.jsx   # Card 1: paste a posting, detected type badge + branching result layout
│   │   ├── FindPeople.jsx        # Card 2: company search (Hunter + LinkedIn fallback) and direct URL/name look-up
│   │   ├── ContactPanel.jsx      # Card 3: the one contact editor + Research this person + Push to Notion
│   │   ├── ComposeCard.jsx       # Card 4: Draft outreach (clipboard prompt) + Generate pitch, context-aware emphasis
│   │   ├── Field.jsx             # Label + input wrapper
│   │   ├── Card.jsx              # Card container: step chip + title + provenance note; optional collapsible header
│   │   ├── Button.jsx            # Variants: default, blue, green, purple, coral
│   │   ├── Badge.jsx             # Status pills (green/amber/red/blue/coral/neutral)
│   │   ├── ContactCard.jsx       # Selectable contact result card
│   │   ├── PromptBox.jsx         # Copy-to-clipboard prompt display
│   │   └── FitBar.jsx            # Score bar with color coding
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
| `ANTHROPIC_API_KEY` | Yes | For the Anthropic API calls: posting analysis, LinkedIn fetch, LinkedIn search, person research |
| `GROQ_API_KEY` | Yes | For Generate pitch in the Compose card (`generate-pitch`), which uses Groq's free tier |
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

  --space-1:  5px;
  --space-2:  8px;
  --space-3: 10px;
  --space-4: 14px;
  --space-5: 20px;
}
```

### Layout

- Body: `background: var(--bg-0)`
- Max width: 1140px, centered, `padding: 28px 20px` on outer wrapper
- `.workspace` is a two-column grid (`minmax(0,1fr)` twice, `gap: var(--space-4)`, `align-items: start`). Each column is a `.workspace-col` flex stack, not a grid row, so a tall left card never drags a short right card down with it.
- Cards: `background: var(--bg-1)`, `border: 0.5px solid var(--border)`, `border-radius: var(--radius)`, `padding: 20px`
- **Spacing is tokenized**: `--space-1: 5px` through `--space-5: 20px`. Components must not set `marginTop` inline. `Card` wraps its children in `.card-body` (flex column, `gap: var(--space-3)`), so vertical rhythm is the card's job and a new section is spaced correctly by default. `.divider` carries `margin: 0` for the same reason.
- **Two breakpoints, the only ones in the file.** At `max-width: 1000px` the workspace collapses to one column (order: Analyze, Find people, Contact, Compose) and `.grid-3` drops to two-up. At `max-width: 600px` `.grid-2` and `.grid-3` both go one-up.

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

## Single-Page Flow

There are no tabs. The app is one page with **four cards, always visible, in a two-column workspace**:

```
LEFT (what you feed in)                RIGHT (what comes out)
1. Analyze a posting                   3. Contact
   (optional -- auto-detects              (the one shared person: fields,
    job vs freelance contract)             research notes, Push to Notion)

2. Find people                         4. Compose
   (company search + direct               (Draft outreach + Generate pitch,
    URL / name look-up)                    context-aware)
```

**Why one page.** The two-tab split (Outreach / Freelance Pitch) forced a choice up front that the actual work does not make. The same contact, the same research, and the same posting feed both outcomes, so `ContactPanel` was rendered twice, the two analyzers were structurally identical, and "produce the thing I send" was split across two tabs. Collapsing all of it removes the routing decision and the duplication.

**Why two columns.** Left is what you feed in, right is what comes out. The two are read at different moments -- you look left while gathering and right while producing -- and side by side you can watch a search result land in the Contact card without scrolling between them. Five stacked full-width cards in a 720px column made that connection invisible.

**Why "Find people" is one card.** "Research a person" and "Find contacts" were two cards doing one job: get a person and their information. The split forced the same up-front choice the tabs did ("am I searching a company or looking up one person?"), and it duplicated both a Company input and a URL input across the two cards. Research itself is not a finding step, so its action and its output moved to the Contact card, where the person lives.

Cards 1 and 2 are independent optional inputs: either, both, or neither can feed the Contact card. Card 3 is the single place a person is edited and researched. Card 4 is the single place something sendable is produced.

### Progress and provenance

`Card` takes `step` (number), `done` (bool), and `note` (string). The numbered step chip turns green when that step has produced output -- **done means it has output, not that it was visited**. `note` is a right-aligned provenance pill answering the question the old layout could not: where did this card's contents come from?

| Step | `done` when | `note` |
|------|-------------|--------|
| 1 Analyze a posting | `Boolean(analysis)` | -- |
| 2 Find people | search returned results, or a direct look-up succeeded | `From <org>` once the analyzer prefilled the fields |
| 3 Contact | name and company are both filled | `contactSource`: `Hunter.io` / `LinkedIn` / `Research` |
| 4 Compose | `outreachPrompt \|\| pitch` | -- |

There is deliberately **no separate progress rail**. At full width all four cards are on screen at once, so a rail would only restate what the headers already show.

### State (in `src/Dashboard.jsx`)

`Dashboard` owns everything shared across the cards. That ownership is what lets one Contact card serve every input path.

Related state is **grouped into objects with a patcher**, not held as loose `useState` calls. The old `FindContacts` took 20 props and the merged card would have taken close to 30; grouping keeps that at a readable size and means adding a field later does not thread two more props through.

```js
// Card 1: posting analysis (analysis.posting_type is the layout discriminator)
const [posting, setPosting] = useState("");
const [analyzing, setAnalyzing] = useState(false);
const [analysis, setAnalysis] = useState(null);
const [analyzeError, setAnalyzeError] = useState(null);

// Card 2: finding a person -- two clusters, one object each
const [search, setSearch] = useState({
  company: "", domain: "", searching: false,
  results: [], done: false, error: null, selIdx: null,
});
const [lookup, setLookup] = useState({
  mode: "url", url: "", name: "", company: "",
  loading: false, status: null, error: null,
});
const patchSearch = (fields) => setSearch((s) => ({ ...s, ...fields }));
const patchLookup = (fields) => setLookup((l) => ({ ...l, ...fields }));

// Card 3: the one shared contact, plus where its contents came from
const [contact, setContact] = useState(initContact());
const [contactSource, setContactSource] = useState(null);
const [researchData, setResearchData] = useState(null);  // { research_notes, hook }
const { fetching, fetchStatus, setFetchStatus, fetchLinkedIn } = useLinkedInFetch(setContact);

// Card 4: composed output
const [outreachPrompt, setOutreachPrompt] = useState(null);
const [pitch, setPitch] = useState(null);
const [generating, setGenerating] = useState(false);
const [pitchError, setPitchError] = useState(null);
```

**`runResearch(payload, resolvedLinkedin)` is the single research entry point.** Both the direct look-up in Find people and the `Research this person` button in the Contact card go through it, so `/api/research-person` is called exactly one way and its result is applied exactly one way (`applyProfile` onto the contact, notes/hook into `researchData`, `contactSource` to `"Research"`). It throws on failure and each caller renders the error where it belongs. There is no `researchKey`: research state is lifted, so Reset clears it directly rather than remounting a component.

### Card 1: Analyze a posting (`PostingAnalyzer.jsx`)

Plain titled `Card`. Textarea (9 rows), placeholder "Paste a job description or freelance contract. The type is detected automatically." Buttons: `Analyze` (blue), `Clear` (default). Results render inline.

The **type badge leads the `.result-head` row, next to the `FitBar`**: blue "Job posting" or coral "Freelance contract". Which rubric ran determines how every number below should be read, so the type and the score sit on one line rather than making the reader hold two facts that belong together.

Directly under it, a muted `.link-button` override: "Analyzed as a job posting. Re-run as freelance contract" (and vice versa). It calls `api.analyzePosting(posting, otherType)`. Detection is good, not perfect, and the override is the escape hatch.

Layout branches on `posting_type`:

- **Full-time:** `.result-head` -> badge row (industry fit, role level, strategic fit, AI environment) -> `.grid-2` of "Why it fits" (`strengths`) and "Watch-outs" (`gaps`) -> `summary-box`
- **Freelance:** `.result-head` -> badge row (rate, hours, scope, industry) -> `.grid-2` of "Why it's worth it" (`strengths`) and "Watch-outs" (`gaps`) -> "Red flags" (`red_flags`, only when non-empty, full width, `.fit-group-flags`) -> `summary-box`

Reasons for and reasons against are a pair, so they sit **side by side in a `.grid-2`** instead of stacking into two walls of bullets. They restack on their own at the 600px breakpoint. Red flags and the summary stay full width -- a red flag is a walk-away signal and should not be scanned as one half of a pair.

Badge maps are local to this component and **must not be shared across the two layouts**:

```js
const INDUSTRY_LABEL = { strong: "Primary industry fit", moderate: "Secondary industry fit", mismatch: "Industry mismatch" };
const STRATEGIC_LABEL = { strong: "Strategic involvement", moderate: "Limited strategic scope", weak: "Executional only" };
const AI_LABEL = { strong: "AI-integrated team", flag: "AI as product, not process" };

const TERM_BADGE = { strong: "green", moderate: "amber", mismatch: "red", unstated: "neutral" };
const TERM_LABEL = { strong: "Good", moderate: "Acceptable", mismatch: "Below target", unstated: "Not stated" };
```

`AI_LABEL` has no `neutral` entry on purpose, and rendering guards on the label map having an entry rather than on the field being present. A pill announcing that the posting did not mention AI either way is noise, and the same guard skips an unexpected model value instead of rendering an empty badge.

Never use the industry labels on a freelance result: "Primary/Secondary/Mismatch" is industry language and says nothing about a rate.

On success, `Dashboard` pre-fills the Find people search fields: a job posting's `company` fills both `search.company` and a guessed `search.domain` (lowercased company + ".com"); a contract's `client` fills `company` only, since a client name rarely maps to a searchable domain. That prefill is also what sets Find people's `From <org>` provenance note.

### Card 2: Find people (`FindPeople.jsx`)

The merge of the old "Research a person" and "Find contacts" cards. Finding a person is one job, so it is one card. This card only **finds** people; enriching them happens in the Contact card.

Two sections, separated by a `.divider`:

**A. Search a company.** Two-column `Company` + `Company domain` grid, one green `Search` button. Hunter.io runs first and renders immediately. The LinkedIn web search is slow, unreliable, and paid, so it runs **only when Hunter returns fewer than 2 contacts**, and its errors are swallowed so a LinkedIn miss never wipes out Hunter results. While it runs, a muted `.results-header.muted` "Also checking LinkedIn..." line shows above the results. Selecting a `ContactCard` fills in the Contact card.

**B. Or add someone directly.** **Always rendered, never toggled** -- it is the reliable path when a company search misses, and the only path for the founder/CEO case (UC2) where there is no company worth searching. One input replaces what used to be two near-identical fields across the two cards, and it routes on the URL:

- contains `linkedin.com/in/` -> `fetchLinkedIn(url)` (Haiku, cheap field extraction)
- anything else (Product Hunt, Crunchbase, a company site) -> `runResearch({ url })` (Sonnet, the only endpoint that can actually read those pages)

A `.link-button` swaps to a `Name` + `Company` pair, which calls `runResearch({ name, company })`. That is the third of the three entry paths the two old cards had between them, preserved with one card, one mode toggle, and one Company input fewer.

Every message this card can produce renders **inside this card**: search error, results list, empty state, and the look-up feedback. The empty state uses neutral `notice-info`, not `notice-error`, because no results is a normal outcome. The LinkedIn path reports through `fetchStatus` (which `fetchLinkedIn` sets rather than throwing); the research path reports through `lookup.status` / `lookup.error`.

Copy in a two-column layout must not be positional. "the contact below" became "the Contact card"; there is no "above" or "below" between columns.

The `classifyTitle` / `classifyContact` / `mapLinkedInResult` / `mergeContacts` helpers live in **`src/lib/contacts.js`**, not in this file. They are pure functions with no React in them, and keeping them out is the difference between a ~200-line component and a ~330-line one.

### Card 3: Contact (`ContactPanel.jsx`)

The one place a person is edited **and researched**. Everything known about a contact lives here: the field grid, the LinkedIn fetch badge, the research notes, and the Notion write.

Buttons: `Research this person` (blue), `Push to Notion` (green), `Reset` (default).

`Research this person` derives its payload from the contact rather than from its own inputs: a `linkedin` URL wins when there is one, otherwise `name` + `company`. It calls `Dashboard`'s shared `runResearch`, and keeps only its own `researching` / `researchError` state, since nothing outside this card reacts to them.

Research output renders as `Field` label + `.summary-box` for the notes, and label + `.summary-box.summary-box-accent` for the hook. **One box per idea, never a box inside a box** -- the old Research card wrapped a `.summary-box` inside a `.fit-group`, which rendered as visible double nesting. The hook gets an accent border instead of its own container.

Research lives here rather than in Find people because notes about a person belong with that person. Splitting them meant a contact's title rendered in one card and the same contact's notes in another.

`Draft outreach` and its `PromptBox` are in Compose. The prompt needs the posting analysis and the research notes as well as the contact, and building it here would have made this component reach for state it does not own.

Reset clears everything belonging to the cleared contact: the search selection, the direct look-up inputs, the research, the `contactSource` note, and any outreach prompt. The posting analysis and generated pitch survive on purpose, since they belong to the posting rather than the person.

### Card 4: Compose (`ComposeCard.jsx`)

Both ways of producing something sendable, side by side: `Draft outreach` (purple) and `Generate pitch` (coral).

**Context changes emphasis, never availability.** Both buttons are always rendered and always clickable; only the variant changes:

```js
const hasContact = Boolean(contact.name?.trim());
const hasPosting = Boolean(analysis);
const outreachPrimary = hasContact;
const pitchPrimary = hasPosting && !hasContact;
```

The primary button gets its accent variant, the other gets `default`. Neither is ever disabled. Disabling would guess at intent, and the guess is wrong often enough (a pitch for a posting you also have a contact at; outreach to someone found without a posting) that a wrong guess costs more than a soft hint.

A single muted helper line below the buttons changes with context:

| Condition | Helper line |
|-----------|-------------|
| contact + posting | "Draft outreach to reach this person directly, or generate a pitch to apply to the posting." |
| contact only | "Copies a prompt for your Claude project to write the message." |
| posting only | "Writes a pitch you can paste straight into the posting." |
| neither | "Add a contact or analyze a posting to compose." |

**Draft outreach still does NOT call an LLM** (Hard Rule #9). It builds a prompt string and renders it in `PromptBox`. `buildOutreachPrompt(contact, analysis, research)` carries contact fields, the analysis summary and strengths (labeled by `posting_type`), the research notes and hook, and a suggested reference template.

**Generate pitch** calls `api.generatePitch(posting, context)` where `context` is the analysis **only when `analysis.posting_type === "freelance"`**. A full-time fit analysis would feed job-hunting language into a client proposal. Only `strengths` and `gaps` are forwarded server-side; `red_flags` and `fit_score` are deliberately withheld (red flags are a walk-away signal with no place in a pitch, and a score only makes the model hedge).

Both outputs render inside this card, stacked: `PromptBox` for outreach, then `.pitch-textarea` (coral-bordered readonly) plus `.pitch-notes`. Those are CSS classes, not inline styles -- nothing in this card sets `style` by hand.

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

### `/api/analyze-posting` (POST)

**Request:** `{ posting: string, forceType?: "full-time" | "freelance" }`

One endpoint for both job descriptions and freelance contracts. It replaced `analyze-jd` and `analyze-contract`, which were structurally identical (same Edge runtime, same CORS/`json()`/`stripFences()` helpers, same Anthropic call, same strengths/gaps/summary shape) and differed only in rubric. Keeping them apart meant two prompts to maintain and, in the UI, a decision the user had to make before pasting.

**Behavior:** Edge runtime, Anthropic `claude-sonnet-4-6`, `max_tokens` 1400 (the union schema is larger than either original). Imports `PAT_PROFILE` from `./lib/profile.js`. `FREELANCE_CRITERIA` stays a module-level constant, separate from `PAT_PROFILE`, because those criteria apply only to contract work: the rate floor and hours ceiling are edited in that one place.

`forceType` is validated against the two known values and ignored otherwise, so an arbitrary string can never reach the prompt as an unvalidated instruction. When set, it both overrides detection and pins `posting_type` in the response.

**Detection.** The prompt classifies before it scores:

- Full-time signals: annual salary or band, benefits, PTO, equity/RSUs, "full-time", "FTE", "permanent", reporting structure, onboarding, team headcount
- Freelance signals: hourly rate, project budget, fixed fee, "contract", "freelance", "part-time", "3 month engagement", milestone payments, statement of work, "1099"
- **When signals conflict, payment structure wins**: an annual salary means full-time, an hourly or project rate means freelance. This is the single most reliable discriminator, and postings frequently mix the other signals.

**Full-time rubric.** Five weighted dimensions:

| Dimension | Weight | Field |
|-----------|--------|-------|
| Industry | 25% | `industry_fit` |
| Role level | 20% | `role_level` |
| Strategic involvement | 25% | `strategic_fit` |
| AI environment | 15% | `ai_environment` |
| Environment signals | 15% | `environment_signals` |

Industry tiers: primary (strong) travel, gaming, entertainment, e-commerce; secondary (moderate) AI, fintech; adjacent (moderate) food/QSR, media, music streaming, retail, sports; explicit mismatches telecom, B2B SaaS, insurance, ad-driven models, EdTech, healthcare, climate/energy tech. **Company size is not a disqualifier** -- the disqualifier is bureaucracy that slows shipping combined with design having no strategic voice, and the model is told to look for those signals in the posting rather than infer them from size.

`strategic_fit` catches a senior-sounding title with executional duties. `ai_environment` distinguishes AI as how the team works from AI as what the company sells (the latter is `flag`). `environment_signals` is where the bureaucracy disqualifier actually gets scored.

**Freelance rubric.** `FREELANCE_CRITERIA` tracks Pat's freelance strategy doc, which is the source of truth for the numbers below. It is a module-level constant separate from `PAT_PROFILE` precisely so those numbers are edited in one place.

- **Rate.** $80/hr floor for hourly work, $750 floor for a fixed-price project. Fixed budgets are also converted to an implied hourly and sanity checked against the hourly bands; when the total clears the project floor but the implied hourly does not, the scope is too big for the budget, and `rate_fit` scores the implied hourly. `rate_fit` scores the converted number, so a fixed-price budget can be `strong`. Doubt about the hour estimate belongs in `gaps`, not in a second markdown of the same rate.
- **Below-floor flex.** Pat will go under his floor for a genuinely strong portfolio piece (travel, gaming, entertainment, e-commerce, or anything publicly shippable and nameable). This raises `fit_score` but never `rate_fit`, which stays a pure judgment of the money: it is the one case where a `mismatch` rate can still belong to a contract worth pursuing. The rule is deliberately one-directional. Portfolio value is a reason to take an underpaid contract, never a reason to discount a well-paid one, so weak portfolio value must not be listed as a gap when the rate already clears the floor.
- **Time.** Freelance availability is 5 to 10 hrs/week alongside the full-time job. At or under 10 is `strong`; above 10 up to 20 is `moderate` and the strain gets named in `gaps`; above 20 is `mismatch`. Required weekday daytime availability (standups, core hours, on-call) is a `mismatch` regardless of the hour count.
- **Service tiers.** Four packages -- Design audit ($750), Landing page or marketing site ($2,500-$4,500), Product or web app UI/UX ($6,000-$10,000), Retainer ($80/hr, 5 hrs/week minimum). The matched tier is returned in `tier` and is what a quote gets built from. A budget well under its tier's range is a **gap, not a red flag**: it usually means the client underestimated the work, which is a conversation, not a walk-away. `unclear` when the posting does not describe enough to place it.
- **Pricing model.** Fixed for defined scope, hourly for open-ended work. A mismatch between the two (an ongoing engagement at one fixed price, or a tight deliverable pinned to an hourly cap) is flagged in `gaps` as a term to renegotiate. This is separate from whether the number itself is good.
- **Scope** against Pat's product design and front-end strengths, including Framer and Webflow builds. **Red flags** lower the score.
- **Industry at zero weight.** The override is load-bearing: without an explicit statement that the profile's "explicit passes" list applies to full-time career moves only, the model penalizes a well-paid B2B SaaS or insurance contract, which is wrong here. Contract work is paid work, not a career move.

The prompt also caps `rate` and `hours` at 30 characters and gives compressed examples, because both render as badges and verbatim strings wrap the badge row onto multiple lines.

**Response.** A discriminated union keyed on `posting_type`. Only the fields for that type are returned.

Full-time:
```json
{"posting_type":"full-time","fit_score":<0-100>,"company":"<name or empty>","industry":"<industry>","industry_fit":"strong|moderate|mismatch","role_level":"<Senior|Lead|Staff|Principal|Other>","strategic_fit":"strong|moderate|weak","ai_environment":"strong|neutral|flag","environment_signals":"strong|neutral|warning","strengths":["<2-4>"],"gaps":["<2-4>"],"summary":"<4-5 sentences>","search_titles":["<t1>","<t2>","<t3>"]}
```

Freelance:
```json
{"posting_type":"freelance","fit_score":<0-100>,"client":"<name or empty>","project_type":"<short description>","tier":"Design audit|Landing page or marketing site|Product or web app UI/UX|Retainer|unclear","industry":"<industry, reported only>","rate":"<max 30 chars or 'Not stated'>","rate_fit":"strong|moderate|mismatch|unstated","hours":"<max 30 chars or 'Not stated'>","time_fit":"strong|moderate|mismatch|unstated","scope_fit":"strong|moderate|mismatch","strengths":["<2-4>"],"gaps":["<2-4>"],"red_flags":["<0-4, empty array if clean>"],"summary":"<3-4 sentences>"}
```

`red_flags` stays separate from `gaps`: a gap is something to address in the pitch, a red flag is a reason to walk away.

`tier` renders as a neutral badge in the freelance badge row, never a colored one. It answers "what do I quote for this?", which is a different question from "is this a good contract?", and coloring it would read as a fit judgment. It is hidden when `unclear`.

**The handler defends the discriminator.** The entire UI branches on `posting_type`, so a response missing it would render as neither layout. If the model returns something other than the two known values, the handler falls back to `forceType` when one was given, otherwise to `"full-time"`.

**An override replaces detection rather than arguing with it.** When `forceType` is set, the prompt omits the detection rules, the other rubric, and the other schema entirely, and states the type as already-decided. An earlier version appended an `OVERRIDE:` line to the detection section while still presenting both rubrics; a posting with strong signals for the other type won that argument every time and the override silently did nothing. Omitting the unused rubric also shortens the prompt.

### `/api/find-contacts` (GET)

**Query params:** `domain` (required), `limit` (default **10**)

> The limit is 10 because Pat's Hunter.io plan caps a domain-search at 10 results. Requesting more returns a `pagination_error` 400 from Hunter, which surfaces to the UI as a 502. Do not raise this without checking the plan first.

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

**Request:** `{ posting: string, analysis?: object }`

`analysis` is the optional **freelance** result of `/api/analyze-posting` (the frontend forwards it only when `posting_type === "freelance"`, so a full-time fit analysis never reaches a client proposal). When present, only its `strengths` and `gaps` are appended to the **user message** (never the system prompt, so the tone rules are untouched). `red_flags` and `fit_score` are deliberately NOT passed through: red flags are Pat's walk-away signal and have no place in a pitch, and a score only makes the model hedge its tone. With no `analysis`, behavior is identical to before.

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
  analyzePosting:   (posting, forceType) => request("/api/analyze-posting", { method: "POST", body: JSON.stringify({ posting, forceType }) }),
  findContacts:     (domain, limit=10) => request(`/api/find-contacts?domain=${encodeURIComponent(domain)}&limit=${limit}`),
  fetchLinkedIn:    (url)              => request("/api/fetch-linkedin",    { method: "POST", body: JSON.stringify({ url }) }),
  searchLinkedIn:   (company, titles)  => request("/api/search-linkedin",   { method: "POST", body: JSON.stringify({ company, titles }) }),
  researchPerson:   ({ url, name, company }) => request("/api/research-person", { method: "POST", body: JSON.stringify({ url, name, company }) }),
  pushNotion:       (contact)          => request("/api/push-notion",       { method: "POST", body: JSON.stringify({ contact }) }),
  generatePitch:    (posting, analysis) => request("/api/generate-pitch",   { method: "POST", body: JSON.stringify({ posting, analysis }) }),
};
```

Components import `api` and call methods directly. Errors bubble up as exceptions and components handle them.

---

## Hunter Result Filtering & Classification (Frontend)

These helpers live in `src/lib/contacts.js` and are imported by `FindPeople.jsx`. When `findContacts` returns Hunter's response, classify and rank each contact, then **keep only design-relevant people**. `classifyTitle(title)` is a pure helper returning `{ score, contactType }`; the result mappers **drop any contact classified as "Other"** (finance, sales, engineering, marketing, ops, legal, or no title), as well as any contact with no usable name. This keeps the results to people actually worth reaching out to for design work (a company search used to surface everyone in the org, which was mostly noise). The same `classifyTitle` + Other-drop rule is reused by both the Hunter and LinkedIn result mappers so both sources rank on one scale.

**Six categories (in priority order):**

| Category | Score | Criteria |
|----------|-------|---------|
| Hiring Manager | 100 | Design/UX/experience + leadership keyword, OR creative director/head of creative |
| Referral | 80 | Design IC titles (product designer, UX designer, etc.) -- excludes graphic/fashion/industrial/game |
| Recruiter | 70 | Recruit/talent/sourcer titles -- excludes sales, finance, legal, ops recruiters |
| Informational | 50 | Product manager/lead/director/VP/CPO, design ops, UX research, service/content designer, design engineer |
| Boss Hunt | 40 | Founder, co-founder, CEO -- fallback for small startups with no design leader |
| Other | 10 | Everything else (CFO, CTO, VP Sales, marketing, engineering, ops, legal, etc.) and contacts with no title. **Dropped from results** (not design-relevant). |

```js
// Pure helper: title -> { score, contactType }. Unmatched -> Other (which the
// mappers then drop). This helper itself never drops -- it only classifies.
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

// Hunter record -> unified result. Dropped when there is no usable name OR when
// the title is not design-relevant (classifyTitle -> "Other").
function classifyContact(person, targetTitles = []) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  if (!fullName) return null;

  const title = person.position || "";
  let { score, contactType } = classifyTitle(title);

  // Keep only design-relevant contacts; drop the "Other" noise bucket.
  if (contactType === "Other") return null;

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

// Then (design-relevant contacts only, ranked; null entries filtered out):
const scored = (data.data?.emails || [])
  .map(p => classifyContact(p, fit?.search_titles || []))
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);
```

LinkedIn results from `/api/search-linkedin` are normalized through the same `classifyTitle` (via a `mapLinkedInResult` helper) and merged into the Hunter list with a `mergeContacts` helper that de-dupes by email, then normalized LinkedIn URL, then lowercased name (the record with an email wins, missing fields backfilled from the other).

**Verification table:** (`classifyTitle` still returns "Other, score 10" for the rows below; the result mappers then drop those, so they do not appear in search results.)

| Title | Expected result |
|-------|-----------------|
| "Chief Financial Officer" | Other, score 10 -> dropped |
| "VP of Solutions Engineering" | Other, score 10 -> dropped |
| "Program Director" | Other, score 10 -> dropped |
| "Senior Director of Marketing" | Other, score 10 -> dropped |
| "Sales Recruiter" | Other, score 10 -> dropped |
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
6. `FitBar.jsx` — score number + bar
7. `ContactCard.jsx` — full contact result card
8. `PromptBox.jsx` — copyable prompt display with select-all on click
9. `useCopy.js` hook — wraps execCommand-based copy with copied state

### Phase 3: Card Layouts (no API yet)

10. `PostingAnalyzer.jsx`, `FindPeople.jsx`, `ContactPanel.jsx`, `ComposeCard.jsx` — card UI with props only, API calls throwing "not implemented"
11. `Dashboard.jsx` — owns all shared state, renders the four cards in the two-column workspace
12. `App.jsx` — root wrapper rendering `<Dashboard />`

At this point, run `npm run dev` and verify all visuals match the dark theme spec, all interactions work locally (typing, selecting, etc), and there are no console errors.

### Phase 4: Backend Functions

Build all seven `/api/*` endpoints. Test each one independently by hitting it with curl or the browser before wiring it to the frontend. Functions should:

- Use Edge Runtime
- Set CORS headers
- Validate required env vars and return 500 with a clear message if missing
- Return JSON with consistent shape: `{ ...data }` on success, `{ error: "...", detail?: "..." }` on failure
- Never expose env vars or stack traces to the client

### Phase 5: Wiring

13. Build `src/lib/api.js`
14. Wire each component method to the API client
15. Add error handling: every API call wrapped in try/catch, errors shown in the appropriate notice box

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
7. **Model choice is per-endpoint and deliberate.** Don't swap a model without a reason recorded here.

   | Endpoint | Model | Why |
   |----------|-------|-----|
   | `analyze-posting`, `research-person` | `claude-sonnet-4-6` | Judgment and writing: scoring against a rubric, writing research notes and a hook. |
   | `fetch-linkedin`, `search-linkedin` | `claude-haiku-4-5` | Pure field extraction from web search. Roughly 3x cheaper per token, no quality loss on this task. |
   | `generate-pitch` | Groq `llama-3.3-70b-versatile` | Cost decision, see below. |

   **Exception:** `generate-pitch` intentionally uses Groq's free tier (`llama-3.3-70b-versatile`, OpenAI-compatible API) instead of Anthropic. This is a deliberate cost decision, not a model substitution within an Anthropic call. It is safe because the pitch is self-contained (no web search, no Claude.ai skills/connectors) so the swap does not affect any other flow.
8. **Notion field names are case-sensitive.** They are: `Contact Name`, `Company`, `Title`, `Location`, `Email`, `Linkedin` (lowercase k), `Contact Type`, `Lead Type`, `Status`, `Email Sent`, `Follow up date`. Do not change these.
9. **Do NOT build LLM-powered outreach generation in the Outreach flow.** No `/api/draft-outreach` endpoint. The Draft outreach button is a pure clipboard copy of a structured prompt (now enriched with fit summary, research notes/hook, and a suggested template). Outreach writing happens in Claude.ai where Pat's skills and reference templates live. The `/api/research-person` endpoint is allowed because it only researches a person; it does not write outreach. See the Architecture Overview at the top of this doc.
10. **Generate pitch (in the Compose card) IS the exception** to rule 9. Pitches are generated end-to-end via `/api/generate-pitch` because the tone rules are self-contained and don't need the outreach-composer skill. Draft outreach, sitting right next to it in the same card, is still a pure clipboard copy.
11. **All four cards are always visible, in a fixed two-column workspace:** left column Analyze a posting then Find people, right column Contact then Compose. Do not add tabs, collapse cards, or conditionally hide a card. Cards render their empty state when unused. Below the 1000px breakpoint the columns unwrap to a single column in the order Analyze, Find people, Contact, Compose.
12. **Spacing is tokenized and owned by `Card`.** No component sets `marginTop`/`marginBottom` inline. Vertical rhythm comes from `.card-body`'s gap; use a `.divider` when a section needs a harder break. Same rule for the rest: prefer a class in `styles.css` over an inline `style` object.

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
