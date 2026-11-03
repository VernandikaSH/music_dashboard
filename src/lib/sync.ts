import "server-only";
import { db } from "./supabase";
import { fillMissingCovers } from "./covers";
import { getRecentTracksPage } from "./lastfm";
import { cleanHistory, cleanupColumns } from "./clean-history";
import { runLookups } from "./lookups";

// Phone scrobbles can reach Last.fm hours late with their original play time,
// so every sync looks back this far before the newest saved play.
const LOOKBACK_S = 24 * 60 * 60;
// Last.fm allows about 5 requests per second.
const PAGE_DELAY_MS = 250;

// Time for Last.fm / MusicBrainz lookups per sync, leaving room in the 60 s
// route limit for saving plays and covers. Backlogs catch up over a few runs.
const LOOKUP_BUDGET_MS = 20_000;

export type SyncResult = { inserted: number; pages: number; covers: number; cleaned: number; lookups: number };

export async function runSync(): Promise<SyncResult> {
  const supabase = db();
  const { data: state, error: stateError } = await supabase
    .from("sync_state")
    .select("last_played_at, artwork_backfilled")
    .eq("id", 1)
    .single();
  if (stateError) throw new Error(`Reading sync_state: ${stateError.message}`);

  const lastPlayedAt = state.last_played_at ? new Date(state.last_played_at) : null;
  // Until covers have been fetched once for older plays, re-read the whole
  // history; existing plays are skipped and only get their cover filled in.
  const from =
    lastPlayedAt && state.artwork_backfilled
      ? Math.floor(lastPlayedAt.getTime() / 1000) - LOOKBACK_S
      : undefined;

  let inserted = 0;
  let newest = lastPlayedAt;
  let page = 1;
  let totalPages = 1;

  try {
    do {
      if (page > 1) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      const result = await getRecentTracksPage(page, from);
      totalPages = result.totalPages;

      if (result.scrobbles.length > 0) {
        // Keys and cleaned names are filled in by the plays_set_keys trigger
        // from the cleanup columns, with manual fixes (aliases) on top.
        const rows = result.scrobbles.map((s) => ({
          played_at: s.playedAt.toISOString(),
          artist_raw: s.artist,
          title_raw: s.title,
          album_raw: s.album,
          image_url: s.imageUrl,
          source: "lastfm",
          ...cleanupColumns({ artist: s.artist, title: s.title, album: s.album }),
        }));
        const { data, error } = await supabase
          .from("plays")
          .upsert(rows, {
            onConflict: "source,played_at,artist_raw,title_raw",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error) throw new Error(`Saving plays: ${error.message}`);
        inserted += data.length;

        if (data.length < rows.length) {
          const { error: imageError } = await supabase.rpc("fill_images", { p_rows: rows });
          if (imageError) throw new Error(`Saving covers: ${imageError.message}`);
        }

        for (const s of result.scrobbles) {
          if (!newest || s.playedAt > newest) newest = s.playedAt;
        }
      }
      page++;
    } while (page <= totalPages);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // last_played_at is left alone so the next run retries the same window.
    await supabase
      .from("sync_state")
      .update({ last_run_at: new Date().toISOString(), last_error: message })
      .eq("id", 1);
    throw err;
  }

  // Only advance last_played_at once every page is saved. Pages come newest
  // first, so a run that stopped halfway would otherwise skip older plays.
  const { error: updateError } = await supabase
    .from("sync_state")
    .update({
      last_played_at: newest?.toISOString() ?? null,
      last_run_at: new Date().toISOString(),
      last_error: null,
      last_inserted: inserted,
      artwork_backfilled: true,
    })
    .eq("id", 1);
  if (updateError) throw new Error(`Updating sync_state: ${updateError.message}`);

  // Old plays (or ones cleaned by older rules) are redone here; new plays
  // were cleaned on insert. Also refreshes duplicate flags for the new plays.
  const cleaned = await cleanHistory();

  // Like covers, lookups must not fail the sync; what's left is retried next run.
  let lookups = 0;
  try {
    const found = await runLookups(LOOKUP_BUDGET_MS);
    lookups = found.artists + found.tracks;
  } catch {
    // retried on the next sync
  }

  // Covers are a nice-to-have: a failed lookup must not fail the sync.
  let covers = 0;
  try {
    const found = await fillMissingCovers();
    covers = found.tracks + found.artists;
  } catch {
    // retried on the next sync
  }

  return { inserted, pages: totalPages, covers, cleaned, lookups };
}
