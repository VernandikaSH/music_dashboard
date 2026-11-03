# Listening Tracker

Personal dashboard for my YouTube Music and YouTube listening history, read from
Last.fm. See `Music Dashboard - PRD.md` for the full plan.

## Setup

1. **Database.** In the Supabase dashboard, open SQL Editor → New query, paste
   all of `supabase/schema.sql`, and press Run. It is safe to run again.
2. **Keys.** Copy `.env.example` to `.env.local` and fill it in:
   - `LASTFM_API_KEY`, `LASTFM_USERNAME`: from last.fm/api/accounts.
   - `SUPABASE_URL`: Project Settings → Data API.
   - `SUPABASE_SECRET_KEY`: Project Settings → API Keys → secret key (`sb_secret_…`).
   - `DASHBOARD_PASSWORD`: the password you will log in with.
   - `SESSION_SECRET`, `CRON_SECRET`: run this twice, one value each:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **Run.** `npm run dev`, open http://localhost:3000, log in, press **Sync now**.

## Deploy (Vercel + GitHub Actions)

1. Push the repo to GitHub (private), import it in Vercel, and add the same
   variables from `.env.local` under Project Settings → Environment Variables.
2. In the GitHub repo, Settings → Secrets and variables → Actions, add:
   - `SYNC_URL`: `https://<your-app>.vercel.app/api/sync`
   - `CRON_SECRET`: the same value as in Vercel.
3. Actions tab → **Sync Last.fm** → Run workflow, to check it works. After that
   it runs every hour. **Heartbeat** commits once a month so GitHub keeps the
   schedule on.

## Layout

- `src/lib/sync.ts`: fetches Last.fm pages into `plays`, looking back 24 hours
  for late phone scrobbles.
- `supabase/schema.sql`: tables, the `visible_plays` view (not blocked, not
  duplicate), and the chart functions (all in Asia/Jakarta time).
- `src/proxy.ts` + `src/lib/auth.ts`: single-password login. Every data read and
  Server Action checks the session again.
