# Deploy Flip Scout so it runs on its own (every morning)

~15 minutes, one time. Free. After this the agent searches your neighborhoods
daily, finds real houses, ranks them, and can email you the lead — no pasting.

## 1. Get a free Gemini key
- Go to https://aistudio.google.com/apikey → sign in with Google → **Create API key** → copy it.

## 2. (Optional now) Supabase — to store results
- https://supabase.com → new project → open **SQL Editor** → paste `supabase/schema.sql` → Run.
- **Settings → API** → copy the *Project URL* and a key.
- You can skip this at first; the agent still runs and reports without it.

## 3. (Optional) Email — to receive the daily report
- https://resend.com → create an API key (free: 3,000/month).

## 4. Deploy
```bash
npm install
npx wrangler login                 # opens browser, log into Cloudflare (free)

npx wrangler secret put GEMINI_API_KEY     # paste your Gemini key
npx wrangler secret put AGENT_SECRET       # any long random password (you invent it)

# optional:
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put REPORT_EMAIL_TO    # juan@twinhomebuyer.com

npx wrangler deploy
```
You'll get a URL like `https://flip-scout-agent.<you>.workers.dev`.
The daily 8 AM Pacific run is already scheduled in `wrangler.toml`.

## 5. VERIFY IT WORKS (do this before trusting it)
Replace `YOUR_SECRET` and the URL with yours:
```bash
# a) confirm the key works AND the agent can find real listings
curl -H "Authorization: Bearer YOUR_SECRET" https://flip-scout-agent.<you>.workers.dev/selftest
```
Look for `"geminiOk": true` and `"listingUrlsFound"` greater than 0 with real
`sampleUrls`. If `ready` is true, discovery is working.

```bash
# b) run a full scan on demand (don't wait for morning)
curl -X POST -H "Authorization: Bearer YOUR_SECRET" https://flip-scout-agent.<you>.workers.dev/run
```
This returns the ranked leads JSON (and emails it if Resend is configured).

## Honest expectations
- **Discovery quality depends on Gemini's web search.** Listing sites increasingly
  limit automated access, so on some days the agent may find fewer houses or thin
  comp data. `/selftest` tells you how well discovery is working that day.
- The agent **never** contacts anyone, makes an offer, or updates a CRM. Every lead
  requires your approval before any action.
- If discovery returns too few houses, we tune the search prompts / add sources —
  the analysis engine itself is already solid (22 tests) and needs no changes.

## Troubleshooting
- `geminiKeyPresent: false` → you didn't set the secret: `wrangler secret put GEMINI_API_KEY`, redeploy.
- `401 unauthorized` → wrong/missing `Authorization: Bearer YOUR_SECRET` header.
- Gemini quota is 1,500 requests/day (free) — plenty for a daily scan.
