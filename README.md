# Outreach Dashboard

Personal outreach tool for LinkedIn job leads and Contra freelance applications.

## Stack

- Vite + React 18 (JSX only, no TypeScript)
- Vanilla CSS with CSS variables
- Vercel serverless functions (Edge Runtime)

## Local development

The `/api/*` endpoints are Vercel Edge functions. Plain Vite does **not** run
them, so `npm run dev` uses `vercel dev`, which serves the React UI and the API
functions together on one origin (http://localhost:3000) — exactly like
production.

First-time setup (the API keys already live in Vercel, so we pull them down):

```bash
npm install                       # installs deps, including the Vercel CLI
npx vercel login                  # authenticate the CLI
npx vercel link                   # link this folder to the Vercel project
npx vercel env pull .env.local    # pull the keys into a local, gitignored .env.local
```

Then start the app:

```bash
npm run dev          # full app: UI + /api functions (http://localhost:3000)
```

UI-only work (faster boot, but every `/api/*` call will fail by design):

```bash
npm run dev:ui       # plain Vite, no functions
```

If you don't have a Vercel project yet, copy `.env.example` to `.env.local` and
fill in the keys manually instead of running `vercel env pull`.

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
