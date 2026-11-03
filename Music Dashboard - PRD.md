# Listening Tracker — PRD

Oct 24, 2026 · @dika · updated Oct 25, 2026

## Overview

Listening Tracker is a personal web dashboard that shows my full listening history from YouTube Music and YouTube at any time, for any date range, not just a yearly top 5.

**Problem.** Spotify Wrapped and YouTube Music Recap appear once or twice a year and only show the top few artists and tracks. There is no way to see the full ranking, how it changes over time, or to check it whenever I want.

**Solution.** Every song played on YouTube Music or YouTube is logged to Last.fm as it happens through a scrobbler, with non-music videos filtered out. The dashboard reads that history, cleans messy YouTube titles into real song names, and shows charts that are always current. Old history from Google Takeout can be imported later. Spotify is deferred to a later phase.

**User.** One person (me), on laptop and Android phone. Not a public product: the whole dashboard sits behind a single password.

## Goals and non-goals

**Goals**

- See full top artists, tracks, and albums for any date range, always up to date
- Track how listening changes over time (daily, weekly, monthly graphs)
- Merge official audio, MV, lyric, and translation uploads of one song into a single entry
- Combine YouTube Music and music played on regular YouTube into one history
- Run at zero cost

**Non-goals (for now)**

- Multi-user accounts or a public app
- Real-time tracking of regular (non-music) YouTube on the phone
- Spotify support for now (added in a later phase)
- Exact listening minutes: shown as an estimate only

## Data sources

Last.fm is the single live source; exports fill in history from before scrobbling started.

| Source | Covers | Updates | Used for | Phase |
| --- | --- | --- | --- | --- |
| Last.fm API (`user.getRecentTracks`) | YouTube Music + YouTube via scrobbling | Near real-time | Main play history | 1 |
| Web Scrobbler (browser extension) | music.youtube.com and youtube.com on laptop | While the tab is open | Feeds Last.fm | 1 |
| Pano Scrobbler (Android) | YouTube Music app on phone (YouTube app off by default) | Background, via notifications | Feeds Last.fm | 1 |
| Last.fm `track.getCorrection` / MusicBrainz API | Canonical artist + title | On lookup | Cleanup, flagging non-music plays | 2 |
| Google Takeout `watch-history.json` | Past YouTube + YouTube Music | Manual, or scheduled every 2 months | Backfill, YouTube tab | 3–4 |
| YouTube Data API (`videos.list`) | Channel, duration, category per video ID | On lookup | Music filter for Takeout imports, YouTube tab | 3–4 |
| Spotify → Last.fm link + Extended Streaming History | Spotify | Automatic / one-time export | Spotify support | Later |

**Listening habits.** Mostly K-pop. On the laptop, music is played on youtube.com (mostly official MVs), so most laptop plays arrive as raw video titles like `BTS (방탄소년단) 'Danger' Official MV`. On the phone, music is played in YouTube Music, which sends clean song names.

Scrobbler settings: Web Scrobbler is on for youtube.com and music.youtube.com, with the YouTube category filter **on** (only Music and Entertainment categories are scrobbled). Uploaders set categories freely, so some real songs are skipped: one upload of Hindia's "Cincin" was refused because it isn't in either category. Whether to turn the filter off is an open question (see the end of this PRD). If a song shows "will not scrobble" for a different reason, reload the video page so the category can load. Pano Scrobbler listens to the YouTube Music app only; the YouTube app is off, because Pano can't check a video's category and would scrobble non-music videos. It can be turned on later, with Pano's block rules and the dashboard blocklist as the filter. On Android, battery optimization is set to "no restrictions" for Pano.

**What a scrobble contains.** A Last.fm scrobble stores only artist, title, album, and timestamp: no channel name and no video ID. The scrobbler has already guessed the artist and title from the YouTube page before sending. This means:

- The YouTube Data API can only be used on Takeout imports.
- Channel signals ("- Topic", VEVO, official artist channel) exist only for Takeout plays. For Last.fm plays, version detection and cleanup rely on title keywords and the scrobbler-parsed artist.
- Blocking by channel only affects Takeout plays; Last.fm plays are blocked by artist or track.

## Features and requirements

Phase 1 ships a working dashboard on Last.fm data; later phases add cleanup, history, and YouTube.

**Phase 1 — Core dashboard**

1. Sync: fetch all scrobbles from Last.fm (200 per page) into Supabase; later syncs fetch plays from 24 hours before the last saved timestamp onward, so late-arriving phone scrobbles (sent with their original play time) aren't missed; rows already saved are skipped by the unique key. Skip the "now playing" entry (it has no timestamp yet).
2. Scheduled sync every hour via GitHub Actions, plus a "Sync now" button. The sync API route requires a secret header (`CRON_SECRET`) or a logged-in session.
3. Simple `track_key` until Phase 2: lowercased, trimmed `artist|title`. Phase 2 cleanup replaces it on all rows.
4. Date-range picker: presets (7 days, 30 days, 3/6/12 months, all time) and a custom range.
5. Top artists, tracks, and albums for the selected range, full ranked list with play counts and pagination (not just top 5).
6. Listening-over-time chart: plays per day, week, or month.
7. Recently played list: shows every play, including blocked and duplicate ones, which appear greyed out with a label. Block and unblock from this list in one click.
8. All times shown in Asia/Jakarta (WIB); stored in UTC.
9. Blocklist: hide an artist or track (or a channel, for Takeout plays) from all charts in one click, for non-music YouTube videos that got scrobbled; hidden plays stay in the database. A blocklist page lists everything blocked, with unblock.
10. Artist page: click any artist to see their top tracks, plays over time, and first and latest play.
11. Fix by hand: a "Fix" link on any track sets its real artist and title (e.g. "Genie Music – Drama" → "aespa – Drama"); "Rename / merge" on an artist renames it or merges it into another (e.g. "방탄소년단 (BTS)" → "BTS"). Fixes are saved in `aliases`, applied by a database trigger to past and future plays, listed on the Hidden & fixed page, and can be undone. Raw fields are never changed. Needed early because label channels (Genie Music, 1theK, Stone Music) upload many K-pop MVs, and the scrobbler then uses the channel name as the artist.
12. Password login: one password in a server env var (`DASHBOARD_PASSWORD`); a correct entry sets a signed, httpOnly cookie for 30 days. Every page and API route except login and the cron-triggered sync requires it.

**Phase 2 — Cleanup and versions**

1. `normalize()` on every play: strip noise words, split "Artist - Title", remove "feat.", drop "- Topic" and "VEVO".
2. `version_type` per play: official audio, official video, lyric/translation, live, cover, remix/edit, unknown. Last.fm plays use title keywords only; Takeout plays also use channel signals.
3. Canonical lookup with cached results, so each unique song is looked up once.
4. Auto-flag plays that neither Last.fm nor MusicBrainz recognizes as "maybe not music"; review them and block or keep.
5. Aliases admin page: search two entries and merge them with one click; re-runs cleanup on history. Builds on the Phase 1 "Fix by hand" feature, adding search and suggested merges.
6. Flag plays whose artist is a known label channel (Genie Music, 1theK, Stone Music, HYBE LABELS, SMTOWN, …) as "artist unknown" so they are easy to fix.
7. Duplicate filter: same canonical track within 60 seconds counts as one play.
8. Estimated listening minutes: look up each track's length once with Last.fm `track.getInfo` (cached in `tracks.duration_s`). Minutes = plays × length; tracks with no known length use a fallback of 210 s (3:30). Shown as "~X hrs (est.)" next to plays, which stay the main metric. Track and artist pages show the share of minutes that came from the fallback.
9. Album fill-in: plays with no album (most MVs, lyric videos, fan uploads) take the album of the same `track_key` from `tracks`, so the top albums chart doesn't undercount. The raw `album_raw` stays empty.
10. Charts merge official audio, video, lyric/translation, and live versions by default. Remixes and edits (sped up, slowed, nightcore) are separate entries by default; a toggle merges them into the original. Covers are always separate. Track detail shows the breakdown by version.

**Phase 2b — Insights**

All computed from data already in `plays`, in WIB, with blocked and duplicate plays excluded. No extra API calls or cost.

1. Listening clock: hour × weekday heatmap of plays for the selected range.
2. Discovery dates: first play of each artist and track. These are "first play in my data", so they move earlier after the Phase 3 Takeout import.
3. New this month: artists and tracks played for the first time in the selected month.
4. Streaks: longest and current run of consecutive days with any play, and the longest daily streak for a single track and artist.
5. On repeat: top tracks of the last 7 days compared with the 7 days before, with rank change (up, down, new).

**Phase 3 — History import**

1. Upload Google Takeout `watch-history.json`; keep YouTube Music entries and YouTube videos in the Music category (checked by video ID with the YouTube Data API); strip the "Watched" prefix.
2. Skip imported plays that overlap with Last.fm data (same track within 2 minutes).

**Phase 4 — YouTube tab (optional)**

1. Import regular YouTube history from scheduled Takeout exports.
2. Enrich each video with channel, duration, and category from the YouTube Data API.
3. Separate tab: top channels, watch counts over time, music vs non-music split (category 10 = Music).
4. Optional later: own Chrome extension that logs youtube.com watches to Supabase in real time (desktop only).

**Later — Spotify**

1. Connect Spotify to Last.fm so its plays flow in automatically.
2. Import Spotify Extended Streaming History; keep plays of 30 s or more to match Last.fm rules.
3. Apply the same overlap rule as Phase 3.

## Cleanup and version detection

Raw scrobbles are never changed; each play gets cleaned fields beside them, so rules can improve and be re-run on old data.

1. **Detect version** from title keywords, plus channel signals when the play has a channel (Takeout only) (table below).
2. **Strip noise**: remove bracketed words like Official, MV, Lyrics, Audio, Visualizer, HD, 4K, and "feat." parts.
3. **Fix artist**: drop "- Topic" and "VEVO"; for non-official channels, take the artist from "Artist - Title" in the title, not the uploader name.
4. **Apply aliases**: if the key is in the aliases table, map it to the merged entry.
5. **Canonical lookup** (if not cached): Last.fm `track.getCorrection`, then MusicBrainz (max 1 request per second, queued).
6. **Save** `artist_clean`, `title_clean`, `track_key`, `version_type`.

| Signal | Version type | Counts as |
| --- | --- | --- |
| "- Topic" channel (Takeout), or Song version in YouTube Music | Official audio | Same song |
| VEVO or official artist channel (Takeout), or "Official MV/Video" in title | Official video | Same song |
| lyrics, lirik, terjemahan, sub indo, eng sub, pinyin, romanized | Lyric / translation | Same song |
| live, concert, akustik/acoustic, performance video, dance practice, music show stage, fancam/직캠, THE FIRST TAKE | Live | Same song, filterable |
| teaser, highlight medley, reaction, behind | Not a full song | Flagged "maybe not music" |
| cover | Cover | Different song (cover artist) |
| remix, sped up, slowed, nightcore | Remix / edit | Separate by default; toggle merges |
| none of the above | Unknown / fan upload | Same song after lookup |

**Example: official audio and official MV merge into one entry.**

| Upload | Arrives in Last.fm as | After cleanup |
| --- | --- | --- |
| Official audio | `NIKI` · `Every Summertime` | `niki\|every summertime` · Official audio |
| Official MV | `NIKIVEVO` · `Every Summertime (Official Music Video)` | `niki\|every summertime` · Official video |

Both count as one song in charts; track detail shows the split. In Phase 1 (before cleanup) they show as two entries; they merge when Phase 2 cleanup re-runs over history.

**Title formats, by priority.** Cleanup rules are written and tested in this order. Every stage is free; later stages only cost effort.

1. **K-pop (first, main genre):**
   - Title inside quotes: `BTS (방탄소년단) 'Danger' Official MV`, `aespa 에스파 'Supernova' MV`, `"Title" M/V`.
   - 1theK / Stone Music format: `[MV] IU(아이유) _ Blueming(블루밍)` (artist and title split by `_`, `[MV]` prefix).
   - Hangul in parentheses or next to the romanized name is dropped from the key (`BTS (방탄소년단)` → `bts`, `Blueming(블루밍)` → `blueming`); the lookup and aliases confirm the match.
   - `(Performance Video)`, `Dance Practice`, `Choreography Video`, `Relay Dance`, music show stages (`Inkigayo`, `M COUNTDOWN`, `Music Bank`, `Show! Music Core`), `fancam` / `직캠` → Live (same song, filterable).
   - `Teaser`, `Highlight Medley`, `Reaction`, `Behind`, `Episode`, `[BANGTAN BOMB]`-style content → flagged "maybe not music".
   - Label channels (HYBE LABELS, SMTOWN, JYP Entertainment, Stone Music Entertainment, 1theK, Genie Music, Starship, YG) treated as non-artist uploaders. Seen in real data: Web Scrobbler sent "Genie Music – Drama" (aespa) and "Genie Music – THUNDER" (SEVENTEEN) with the real artist already stripped from the title, so these can only be fixed by hand or with Web Scrobbler's edit button.
2. **Western and Indonesian (next):**
   - Western: `(Official Video)`, `(Official Music Video)`, `(Official Audio)`, `[Official Lyric Video]`, `(Visualizer)`, `(Explicit)`, `(Clean)`, `| Vevo`, `ft.` / `feat.` / `featuring`, `- Remastered 2011`; label channels (e.g. "Atlantic Records", "Interscope") as non-artist uploaders.
   - Indonesian: `(Official Music Video)`, `(Video Klip)`, `(Video Lirik)`, `Lirik`, `(Lyric Video)`, `Versi Akustik` / `(Live Akustik)` → Live, `OST <film>` stripped from the title; label channels (e.g. "Sony Music Indonesia", "Musica Studio's", "Trinity Optima Production", "Aquarius Musikindo", "Juni Records") as non-artist uploaders.
3. **J-pop (later):** `「Title」` / `『Title』` brackets, `Official Music Video` / `MV` after the brackets, kanji/kana next to the romanized name, `THE FIRST TAKE` → Live.

Phase 2 success is measured on K-pop first, since it makes up most plays. For K-pop and J-pop, the canonical lookup does most of the work: MusicBrainz stores artist aliases in Hangul, kana, and Latin script, so `뉴진스` and `NewJeans` resolve to one artist. Leftovers go to the aliases page.

Habit that reduces cleanup: in YouTube Music, play the Song version instead of the Video version when the toggle is available.

## Architecture and data model

```
Web Scrobbler (laptop) ─┐
                        ├─► Last.fm ──► /api/sync ──► Supabase Postgres ◄── Dashboard (Next.js on Vercel)
Pano Scrobbler (phone) ─┘                  ▲    │                              │
                                           │    └─► cleanup (Phase 2)          └─ Takeout upload (Phase 3)
               GitHub Actions (hourly) ────┤        Last.fm / MusicBrainz lookups
               "Sync now" button ──────────┘
```

Scrobblers feed Last.fm; a sync job copies new plays into Supabase and runs cleanup; the dashboard reads Supabase and handles history uploads.

**Stack**

- Next.js (App Router) + Tailwind on Vercel, charts with Recharts
- Supabase Postgres for storage
- Sync: Next.js API route triggered hourly by GitHub Actions and by the Sync now button
- Auth: single password checked on the server, signed httpOnly cookie, enforced in Next.js middleware
- API keys (Last.fm, YouTube Data), the Supabase service key, `DASHBOARD_PASSWORD`, and `CRON_SECRET` only in server-side environment variables, never in browser code. The browser never talks to Supabase directly.

**Tables**

| Table | Key columns | Notes |
| --- | --- | --- |
| `plays` | id, played\_at (UTC), artist\_raw, title\_raw, album\_raw, channel\_raw, video\_id, source, artist\_clean, title\_clean, artist\_key, track\_key, version\_type, is\_duplicate, maybe\_not\_music | One row per play; raw fields never edited. Clean fields and keys are set by a trigger from the raw fields plus aliases, so they can be recomputed at any time. channel\_raw and video\_id are filled only for Takeout plays. Unique on (source, played\_at, artist\_raw, title\_raw) so re-syncs don't insert twice |
| `tracks` | track\_key, artist\_clean, title\_clean, album, duration\_s, duration\_checked\_at | duration\_s from Last.fm `track.getInfo`; often empty for YouTube uploads, which then use the 210 s fallback |
| `blocklist` | kind (channel, artist, track), value, created\_at | Blocked plays are hidden from charts, kept in `plays` |
| `aliases` | kind (artist, track), from\_key, to\_artist, to\_title, created\_at | Manual fixes. from\_key is built from the raw fields; a track fix wins over an artist fix |
| `lookup_cache` | raw\_key, result, looked\_up\_at | One lookup per unique raw song |
| `sync_state` | last\_played\_at, last\_run\_at, last\_error | Lets each sync fetch only new plays |

`source` values: `lastfm`, `takeout` (later `spotify_export`). Top charts group by `track_key` after aliases are applied and skip blocked plays.

## Constraints, risks, and cost

Everything runs on free tiers; the main risks are missed scrobbles and messy YouTube metadata.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| History starts only when scrobbling starts | No data before setup | Connect Last.fm now; backfill with Takeout in Phase 3 |
| Non-music YouTube videos scrobbled as songs (K-pop teasers, behind-the-scenes, variety clips are often in the Music or Entertainment category) | Junk in charts | Web Scrobbler category filter; Pano limited to YouTube Music; teaser/behind keywords auto-flagged; dashboard blocklist |
| Uploader-set YouTube categories are unreliable (real songs outside Music/Entertainment, e.g. one "Cincin" upload) | Missed laptop plays | Watch how often it happens; if often, turn the category filter off and rely on the blocklist |
| Android kills Pano Scrobbler in the background | Missed phone plays | Battery set to no restrictions; check Last.fm weekly at first; see dontkillmyapp.com for brand-specific settings if plays go missing |
| Phone plays arrive late (Android holds back network while asleep; Pano queues and sends on wake) | Plays appear in Last.fm minutes or hours after they happened | Sync must not rely on "newer than last timestamp" alone: each sync re-fetches the last 24 hours and skips rows already saved (unique key on `plays`) |
| Messy YouTube titles split one song into many | Wrong top charts | Cleanup pipeline, lookups, aliases page |
| Playing on laptop and phone at once | Inflated counts | Pause one scrobbler; 60-second duplicate filter |
| Last.fm rules: track > 30 s, played half or 4 min | Skips not counted | Apply the same rule to imports |
| No duration in scrobbles | Minutes are estimates | Show plays as the main metric; label minutes "est." |
| Last.fm API rate limit | Slow first sync | \~5 requests/s max, resume from `sync_state` |
| Supabase pauses free projects after 7 idle days | Dashboard stops loading | Hourly sync keeps it active |
| GitHub disables scheduled workflows after 60 days with no repo activity | Sync stops, then Supabase pauses | Workflow commits a small heartbeat file monthly; dashboard shows a warning if the last sync is over 3 hours old |
| Dashboard on a public URL | Anyone could view history or trigger actions | Password login on every page; sync route needs `CRON_SECRET` |
| Last.fm profile is public by default | Others see listening | Hide recent listening in Last.fm privacy settings if wanted |
| Times stored in UTC | Days cut at 07:00 WIB | Convert to Asia/Jakarta for every daily chart |

**Cost: Rp0 for personal use.** Last.fm, MusicBrainz, and YouTube Data APIs are free (YouTube has a daily quota far above one person's needs). Vercel Hobby hosts the app, Supabase free tier stores the data, and GitHub Actions runs the hourly sync. Vercel's own cron on the free plan runs about once a day, so it is not used for syncing.

## Milestones and success criteria

Setup happens today so real data piles up while Phase 1 is built.

**Phase 0 — Setup (now)**

- [x] Create a Last.fm account and get an API key
- [x] Install Web Scrobbler; enable music.youtube.com and youtube.com; sign in to Last.fm in its Accounts settings; YouTube category filter on (Music + Entertainment)
- [x] Install Pano Scrobbler; enable the YouTube Music app only; battery set to no restrictions
- [ ] Request a Google Takeout export of YouTube and YouTube Music history

| Phase | Done when |
| --- | --- |
| 1 — Core dashboard | A song played on YouTube Music or YouTube, phone or laptop, shows on the dashboard within \~1 hour (or right after Sync now); full ranked lists work for any date range; a non-music video can be hidden in one click |
| 2 — Cleanup and versions | Official audio, MV, and lyric uploads of the same song appear as one entry; under 5% of top-50 tracks need a manual merge |
| 2b — Insights | Listening clock, discovery dates, new this month, streaks, and on repeat all show correct WIB-based results for any range |
| 3 — History import | Takeout plays appear in charts without double-counting overlap with Last.fm |
| 4 — YouTube tab | Takeout import shows top channels and a music vs non-music split |
| Later — Spotify | Spotify plays appear alongside YouTube in the same charts |

**Decisions (Oct 25, 2026)**

- Remixes and sped-up/slowed versions are separate entries by default; a toggle merges them.
- Phase 4 (YouTube tab) stays as an optional phase, decided after Phase 3.
- Access is a single password, not user accounts.
- Recently played shows blocked and duplicate plays greyed out, with block/unblock right there.
- Official audio and official MV of a song merge into one entry; MV plays borrow the album from the audio version.
- Estimated listening minutes are in (Phase 2), always labeled "est."
- All extra views are in: artist page in Phase 1; listening clock, discovery dates, new this month, streaks, and on repeat in a new Phase 2b.
- Laptop first: layouts are designed for a laptop screen, then made usable on the phone (stacked cards, no horizontal scroll).
- Cleanup rules start with K-pop (main genre, mostly official MVs on youtube.com), then Western and Indonesian; J-pop later (no extra cost, only effort).
- Phone uses YouTube Music only, so Pano Scrobbler listens to the YouTube Music app; the YouTube app is off.

**Open questions**

- Turn Web Scrobbler's YouTube category filter off? On: cleaner charts, but real songs in other categories are missed for good. Off: nothing is missed, but non-music videos watched past halfway get scrobbled and must be blocked. Decide after a week of watching how often real songs are refused.
- Should acoustic versions count as Live (same song, filterable) or as separate entries? Currently Live.
