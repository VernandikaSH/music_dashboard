import "server-only";
import { db } from "./supabase";
import { CLEANUP_VERSION, normalize, type RawPlay } from "./cleanup";

const BATCH_SIZE = 1000;
// Keeps one sync well inside the route's time limit; the rest waits for the next run.
const MAX_BATCHES = 20;

// The plays columns set by cleanup. The plays_set_keys trigger builds the
// keys from them and applies manual fixes on top.
export function cleanupColumns(play: RawPlay) {
  const c = normalize(play);
  return {
    artist_auto: c.artist,
    title_auto: c.title,
    version_type: c.versionType,
    maybe_not_music: c.maybeNotMusic,
    artist_unknown: c.artistUnknown,
    cleanup_version: CLEANUP_VERSION,
  };
}

// Cleans plays saved before cleanup existed, or by older rules
// (CLEANUP_VERSION bumped), then refreshes duplicate flags and per-track
// albums and lengths.
export async function cleanHistory(): Promise<number> {
  const supabase = db();
  let cleaned = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await supabase
      .from("plays")
      .select("id, artist_raw, title_raw, album_raw, channel_raw")
      .lt("cleanup_version", CLEANUP_VERSION)
      .order("id")
      .limit(BATCH_SIZE);
    if (error) throw new Error(`Reading plays to clean: ${error.message}`);
    if (data.length === 0) break;

    const rows = data.map((p) => ({
      id: p.id,
      ...cleanupColumns({ artist: p.artist_raw, title: p.title_raw, album: p.album_raw, channel: p.channel_raw }),
    }));
    const { error: saveError } = await supabase.rpc("apply_cleanup", { p_rows: rows });
    if (saveError) throw new Error(`Saving cleanup: ${saveError.message}`);
    cleaned += rows.length;
    if (data.length < BATCH_SIZE) break;
  }

  const { error } = await supabase.rpc("mark_duplicates");
  if (error) throw new Error(`Marking duplicates: ${error.message}`);
  // New and re-cleaned plays can change a track's borrowed album and length.
  const { error: tracksError } = await supabase.rpc("refresh_tracks");
  if (tracksError) throw new Error(`Refreshing tracks: ${tracksError.message}`);
  return cleaned;
}
