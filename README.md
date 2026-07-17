# Flip Scout — Twin Home Buyer AI Agent

Autonomous agent that finds fixer/value-add homes in **San Francisco, San Mateo, and
Sunnyvale**, runs conservative fix-and-flip math, scores each deal 1–10, and emails
Juan **only the deals scoring 8.0+ that are still profitable under the worst-case
scenario.** Runs entirely online. **$0/month** on free tiers.

## The one rule

Conservative only. A deal is shown **only** if it clears an 8/10 score **and** still
hits ≥$75K profit and ≥20% margin on cost using the *low* ARV, *high* renovation, and
*longer* holding period. Never on optimism.

## Condition strategy — "ugly but fixable"

The agent targets the **middle** of the condition range, not the extremes:

| Category | Condition-fit (0–15) | Default decision |
|---|---|---|
| Turnkey / too nice | 0–3 | Reject *unless* a big enough discount makes the conservative scenario pass. Reason: **"Too turnkey / insufficient value-add potential."** |
| Light cosmetic | 7–11 | Candidate only if the discount creates conservative profit |
| **Middle — "ugly but fixable"** | **12–15** | **Priority target** (outdated, worn, cluttered, original, partial reno, but usable) |
| Heavy but possible | 5–10 | Review carefully; needs higher spread + contingency |
| Extreme / too risky | 0–4 | Reject. Reason: **"Condition too severe / renovation and timeline risk too high."** |

The condition-fit score is **one 15-point input to the 100-point deal score** — it
never overrides a financial or critical-risk failure. A property qualifies only when
score ≥ 8.0, conservative profit ≥ $75K, margin ≥ 20%, ARV backed by **3+ comps**, no
unresolved critical risk (e.g. foundation failure red-flags the deal), renovation is
achievable in ~4–6 months, and it is **not already priced like a renovated home**.

Ugly ≠ unsafe: a "worse-looking = better" rule is explicitly **not** used.

### New per-property fields
`Condition Category`, `Condition Fit Score`, `Juan Strategy Fit: Strong/Moderate/Weak/Reject`,
`Why It Fits or Does Not Fit`, `Turnkey Signals`, `Ugly-but-Fixable Signals`,
`Extreme-Risk Signals`, `Likely Renovation Scope`, `Estimated Timeline`,
`Condition Confidence`, `Required Physical Verification`.

> **No photo analysis.** Condition signals come from **listing text only**, labeled
> "Confirmed from listing text". The agent never claims a defect is "visually confirmed
> from photos" — anything not in the text is "Requires inspection" / "Unknown".

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

1. **Search** target neighborhoods for "ugly but fixable" homes (Redfin/Zillow/Realtor
   public pages via Gemini grounded search)
2. **Extract** each listing's facts
3. **Buy-box gate** — price $700K–$2.5M, 2–5 beds, allowed types; rejects logged
4. **Condition classify** — turnkey / light / middle / heavy / extreme + condition-fit
5. **Research** — 3+ sold comps, public-records risk scan (assessor, GIS, permits,
   FEMA, fire maps — the free sources checked are recorded on every report)
6. **Analyze** — ARV (low/base/high), renovation, full project cost, 3 scenarios, MAO
7. **Score** 1–10 and decide (qualify only if conservative scenario is profitable, the
   condition isn't turnkey/extreme, and no critical risk is unresolved)
8. **Report** — save to Supabase + email Juan the top deals with their Strategy Fit

Every run also reports: middle-condition targets found, turnkey rejected, extreme/
critical rejected, properties needing photo review, properties needing inspection.
The dashboard adds condition filters (ugly but fixable, light cosmetic, heavy but
possible, too turnkey, too risky, unknown).

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
