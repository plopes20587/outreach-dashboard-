# Outreach Dashboard

Personal outreach tool for LinkedIn job leads and Contra freelance applications.

## Stack

- Vite + React 18 (JSX only, no TypeScript)
- Vanilla CSS with CSS variables
- Vercel serverless functions (Edge Runtime)

## Local development

```bash
npm install
npm run dev
```

For local API testing, copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

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
