# Outreach Dashboard

Personal outreach tool: job-based outreach (LinkedIn), founder/CEO freelance acquisition, and freelance pitches (Contra/Upwork).

## Stack

- Vite + React 18 (JSX only, no TypeScript)
- Vanilla CSS with CSS variables
- Vercel serverless functions (Edge Runtime)

## Local development

The `/api/*` endpoints are Vercel Edge functions. Plain Vite does **not** run
them, so the full app is served by `vercel dev` (the `start` script), which runs
the React UI and the API functions together on one origin
(http://localhost:3000) — exactly like production.

Two scripts:

```bash
npm start            # FULL app: UI + /api functions (vercel dev, http://localhost:3000)
npm run dev          # UI only (plain Vite, faster) — /api calls will fail by design
```

> `start` cannot be named `dev`: if the npm `dev` script were `vercel dev`,
> `vercel dev` would recursively call itself. `vercel.json` sets
> `"devCommand": "vite --port $PORT"` so `vercel dev` starts the front end with
> Vite instead of looping.

First-time setup (the API keys already live in Vercel, so we pull them down):

```bash
npm install                                  # installs deps, including the Vercel CLI
npx vercel login                             # authenticate the CLI
npx vercel link                              # link this folder to the Vercel project
npx vercel env pull .env --environment=production   # write the keys into a local, gitignored .env
```

Two gotchas this command works around:

1. **Use `.env`, not `.env.local`.** `vercel dev` does not inject `.env.local`
   into the local Edge runtime, so the functions must read from a plain `.env`.
2. **Use `--environment=production`.** The keys are stored in Vercel for
   Production/Preview, not Development; a plain `vercel env pull` (which defaults
   to Development) pulls none of them.

If you don't have a Vercel project yet, copy `.env.example` to `.env` and fill in
the keys manually instead of running `vercel env pull`.

## Required environment variables

Set these in the Vercel project settings before deploying:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API for JD analysis, LinkedIn fetch, Contra generation |
| `HUNTER_API_KEY` | Hunter.io for contact/email lookup |
| `NOTION_API_KEY` | Notion internal integration token |
| `NOTION_DATABASE_ID` | Contact Tracker database ID |
| `ALLOWED_ORIGIN` | (Optional) Restrict CORS to your production URL |

## Notion setup (first deploy only)

1. Go to https://www.notion.so/profile/integrations and create a new internal integration.
2. Copy the integration token to `NOTION_API_KEY` in Vercel.
3. Open your Contact Tracker database in Notion.
4. Click the three-dot menu, go to Connections, and add your integration.

Without step 3, the Notion API will return a 404.

## Deploy

1. Push to GitHub.
2. Import the repo in Vercel.
3. Set the five environment variables above.
4. Deploy. Test the production URL end-to-end.
5. Set `ALLOWED_ORIGIN` to your production Vercel URL once verified.
