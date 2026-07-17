# Flip Scout — Twin Home Buyer AI Agent

Autonomous agent that finds fixer/value-add homes in **San Francisco, San Mateo, and
Sunnyvale**, runs conservative fix-and-flip math, scores each deal 1–10, and emails
Juan **only the deals scoring 8.0+ that are still profitable under the worst-case
scenario.** Runs entirely online. **$0/month** on free tiers.

## The one rule

Conservative only. A deal is shown **only** if it clears an 8/10 score **and** still
hits ≥$75K profit and ≥20% margin on cost using the *low* ARV, *high* renovation, and
*longer* holding period. Never on optimism.

## What runs where (all free)

| Job | Tool | Free tier |
|-----|------|-----------|
| AI brain + web search | Google Gemini 2.0 Flash | 1,500 req/day |
| Backend + daily cron | Cloudflare Workers | 100k req/day |
| Database | Supabase (Postgres) | 500 MB |
| Backup scheduler | GitHub Actions | free |
| Dashboard | any static host / open the file | free |
| Email (optional) | Resend HTTP API | 3,000/month |

> Money math is **100% deterministic JavaScript** (`src/tools/calculator.js`). AI only
> reads listings, classifies condition, finds comps, and writes prose — it never
> computes the numbers. MLS is not used; every run states that limitation.

## How it works each day

1. **Search** target neighborhoods (Redfin/Zillow/Realtor via Gemini grounded search)
2. **Extract** each listing's facts
3. **Buy-box gate** — price $700K–$2.5M, 2–5 beds, allowed types; rejects logged
4. **Research** — condition/scope, 3+ sold comps, public-records risk scan
5. **Analyze** — ARV (low/base/high), renovation, full project cost, 3 scenarios, MAO
6. **Score** 1–10 and decide (qualify only if conservative scenario is profitable)
7. **Report** — save to Supabase + email Juan the top deals

## Setup (~45 min, one time)

### 1. Get free keys
- **Gemini:** https://aistudio.google.com/apikey → create key
- **Supabase:** https://supabase.com → new project → **SQL Editor** → paste
  `supabase/schema.sql` → run. Then **Settings → API** → copy *Project URL* and a key.
- **Cloudflare:** https://dash.cloudflare.com/sign-up
- **Resend (optional, for email):** https://resend.com → API key

### 2. Install + deploy
```bash
npm install
npx wrangler login

# secrets (prompted for each value)
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret put AGENT_SECRET       # any long random string
npx wrangler secret put REPORT_EMAIL_TO    # juan@twinhomebuyer.com
npx wrangler secret put RESEND_API_KEY     # optional
npx wrangler secret put REPORT_EMAIL_FROM  # optional, e.g. Flip Scout <you@yourdomain>

npm run deploy
```
You'll get a URL like `https://flip-scout-agent.<you>.workers.dev`.
The daily cron (8 AM Pacific) is already configured in `wrangler.toml`.

### 3. Backup scheduler (optional)
In the GitHub repo → **Settings → Secrets and variables → Actions**, add:
- `WORKER_URL` = your Worker URL
- `AGENT_SECRET` = same secret as above

### 4. Dashboard
Open `dashboard/index.html` (locally or on GitHub Pages), enter your Worker URL +
secret once, click **Run Scan Now**.

## Run it

```bash
# full daily scan
curl -X POST https://<you>.workers.dev/run -H "Authorization: Bearer YOUR_SECRET"

# analyze a single listing you paste
curl -X POST https://<you>.workers.dev/analyze \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.redfin.com/..."}'
```

## Local dev & tests
```bash
cp .dev.vars.example .dev.vars   # fill in keys
npm run dev                       # local Worker
npm test                          # deterministic money-math tests (no network)
```

## Tuning
All rules live in `src/config.js`: buy box, target areas, financial assumptions,
renovation $/sqft, minimum score. Change and redeploy — no code changes needed.

## Safety
Never contacts agents/sellers, never makes offers, never writes to a CRM. Human
approval is required for every external action. Sources and calculations are stored
in Supabase for audit.
