import "server-only";
import { requireLogin } from "./auth";
import { db } from "./supabase";
import { getNowPlaying as fetchNowPlaying, type NowPlaying } from "./lastfm";
import type { VersionType } from "./cleanup";
import type { Bucket, DateRange } from "./range";

// Every read checks the session itself (data access layer), not only proxy.ts.

export type TopArtist = { artist_key: string; artist: string; image_url: string | null; plays: number };
export type TopTrack = {
  track_key: string;
  base_track_key: string; // the song with all its versions; links to the track page
  artist_key: string;
  artist: string;
  title: string;
  image_url: string | null;
  plays: number;
};
export type TopAlbum = { artist_key: string; artist: string; album: string; image_url: string | null; plays: number };
export type Paged<T> = { rows: T[]; total: number };

export type RecentPlay = {
  id: number;
  played_at: string;
  artist_raw: string;
  title_raw: string;
  artist_clean: string;
  title_clean: string;
  album_raw: string;
  image_url: string | null;
  artist_key: string;
  track_key: string;
  is_blocked: boolean;
  is_duplicate: boolean;
};

export type Alias = {
  kind: "artist" | "track";
  from_key: string;
  to_artist: string;
  to_title: string | null;
  created_at: string;
};

export type FixTarget = {
  artist: string;
  title: string | null;
  plays: number;
  rawNames: string[]; // distinct "artist – title" (or artist) as received
};

export type ReviewTrack = {
  track_key: string;
  artist_key: string;
  artist: string;
  title: string;
  raw_name: string; // "artist – title" as received
  by_title: boolean; // flagged by title words, else not found by the lookup
  plays: number;
  last_played: string;
};
export type KeptTrack = { track_key: string; label: string; created_at: string };

// Estimated listening time, in seconds. guessed_seconds is the part from plays
// whose track length is unknown (counted as 3:30 each).
export type EstTime = { est_seconds: number; guessed_seconds: number };

export type TrackSummary = EstTime & {
  artist_key: string;
  artist: string;
  title: string;
  album: string | null;
  image_url: string | null;
  duration_s: number | null;
  plays: number;
  first_played: string;
  last_played: string;
};

export type TrackVersion = {
  track_key: string;
  version_type: VersionType;
  title: string;
  example: string; // most common "artist – title" as received
  plays: number;
};

export type MergeKind = "artist" | "track";
export type SearchEntry = { key: string; artist_key: string; artist: string; title: string | null; plays: number };
export type MergeSuggestion = {
  kind: MergeKind;
  from_key: string;
  from_artist: string;
  from_title: string | null;
  from_plays: number;
  to_key: string;
  to_artist: string;
  to_title: string | null;
  to_plays: number;
};

export type BlockKind = "artist" | "track" | "channel";
export type BlockEntry = { kind: BlockKind; value: string; label: string; created_at: string };

export type SyncState = {
  last_played_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
  last_inserted: number | null;
};

function rangeArgs(range: DateRange) {
  return { p_from: range.from?.toISOString() ?? null, p_to: range.to.toISOString() };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  await requireLogin();
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as T[];
}

function paged<T extends { total_count: number }>(rows: T[]): Paged<Omit<T, "total_count">> {
  return {
    total: rows[0] ? Number(rows[0].total_count) : 0,
    rows: rows.map(({ total_count: _, ...rest }) => rest),
  };
}

export async function getSummary(range: DateRange) {
  const [row] = await rpc<{ plays: number; artists: number; tracks: number } & EstTime>(
    "range_summary",
    rangeArgs(range),
  );
  return row ?? { plays: 0, artists: 0, tracks: 0, est_seconds: 0, guessed_seconds: 0 };
}

export async function getTopArtists(range: DateRange, limit: number, offset = 0) {
  return paged(
    await rpc<TopArtist & { total_count: number }>("top_artists", {
      ...rangeArgs(range),
      p_limit: limit,
      p_offset: offset,
    }),
  );
}

// mergeRemixes: count remixes and sped up / slowed edits as the original song.
export async function getTopTracks(
  range: DateRange,
  limit: number,
  offset = 0,
  { artistKey, mergeRemixes = false }: { artistKey?: string; mergeRemixes?: boolean } = {},
) {
  return paged(
    await rpc<TopTrack & { total_count: number }>("top_tracks", {
      ...rangeArgs(range),
      p_limit: limit,
      p_offset: offset,
      p_artist_key: artistKey ?? null,
      p_merge_remixes: mergeRemixes,
    }),
  );
}

export async function getTopAlbums(range: DateRange, limit: number, offset = 0) {
  return paged(
    await rpc<TopAlbum & { total_count: number }>("top_albums", {
      ...rangeArgs(range),
      p_limit: limit,
      p_offset: offset,
    }),
  );
}

// trackKey is a base_track_key: the song with all its versions.
export async function getPlaysOverTime(
  range: DateRange,
  bucket: Bucket,
  { artistKey, trackKey }: { artistKey?: string; trackKey?: string } = {},
) {
  return rpc<{ bucket: string; plays: number }>("plays_over_time", {
    ...rangeArgs(range),
    p_bucket: bucket,
    p_artist_key: artistKey ?? null,
    p_track_key: trackKey ?? null,
  });
}

export async function getArtistSummary(artistKey: string) {
  const [row] = await rpc<
    EstTime & {
      artist: string;
      plays: number;
      tracks: number;
      first_played: string;
      last_played: string;
    }
  >("artist_summary", { p_artist_key: artistKey });
  return row ?? null;
}

export async function getTrackSummary(trackKey: string) {
  const [row] = await rpc<TrackSummary>("track_summary", { p_track_key: trackKey });
  return row ?? null;
}

export async function getTrackVersions(trackKey: string, range: DateRange) {
  return rpc<TrackVersion>("track_versions", { p_track_key: trackKey, ...rangeArgs(range) });
}

export async function searchEntries(kind: MergeKind, query: string, limit: number) {
  return rpc<SearchEntry>("search_entries", { p_kind: kind, p_query: query, p_limit: limit });
}

export async function getMergeSuggestions(limit: number) {
  return rpc<MergeSuggestion>("merge_suggestions", { p_limit: limit });
}

export async function getRecentPlays(limit: number, offset = 0): Promise<Paged<RecentPlay>> {
  await requireLogin();
  const { data, error, count } = await db()
    .from("plays_with_status")
    .select(
      "id, played_at, artist_raw, title_raw, artist_clean, title_clean, album_raw, image_url:cover_url, artist_key, track_key, is_blocked, is_duplicate",
      { count: "exact" },
    )
    .order("played_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`recent plays: ${error.message}`);
  return { rows: (data ?? []) as RecentPlay[], total: count ?? 0 };
}

export async function getBlocklist(): Promise<BlockEntry[]> {
  await requireLogin();
  const { data, error } = await db()
    .from("blocklist")
    .select("kind, value, label, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`blocklist: ${error.message}`);
  return (data ?? []) as BlockEntry[];
}

export async function getBlockedValues(): Promise<Set<string>> {
  const entries = await getBlocklist();
  return new Set(entries.map((e) => `${e.kind}:${e.value}`));
}

export async function getAliases(): Promise<Alias[]> {
  await requireLogin();
  const { data, error } = await db()
    .from("aliases")
    .select("kind, from_key, to_artist, to_title, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`aliases: ${error.message}`);
  return (data ?? []) as Alias[];
}

export async function getReviewQueue(limit: number, offset = 0) {
  return paged(
    await rpc<ReviewTrack & { total_count: number }>("tracks_to_review", { p_limit: limit, p_offset: offset }),
  );
}

export async function getKeptTracks(): Promise<KeptTrack[]> {
  await requireLogin();
  const { data, error } = await db()
    .from("kept_tracks")
    .select("track_key, label, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`kept tracks: ${error.message}`);
  return (data ?? []) as KeptTrack[];
}

// What the fix page shows: the current name and every raw spelling behind it.
export async function getFixTarget(kind: "artist" | "track", key: string): Promise<FixTarget | null> {
  await requireLogin();
  const { data, error } = await db()
    .from("plays")
    .select("artist_raw, title_raw, artist_clean, title_clean")
    .eq(kind === "artist" ? "artist_key" : "track_key", key)
    .limit(5000);
  if (error) throw new Error(`fix target: ${error.message}`);
  if (!data || data.length === 0) return null;

  const counts = new Map<string, number>();
  const raw = new Set<string>();
  for (const p of data) {
    const name = kind === "artist" ? p.artist_clean : `${p.artist_clean}\u0000${p.title_clean}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    raw.add(kind === "artist" ? p.artist_raw : `${p.artist_raw} – ${p.title_raw}`);
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const [artist, title] = top.split("\u0000");
  return { artist, title: kind === "track" ? title : null, plays: data.length, rawNames: [...raw].sort() };
}

export async function getArtistNames(): Promise<string[]> {
  const rows = await rpc<{ artist: string }>("top_artists", {
    p_from: null,
    p_to: "infinity",
    p_limit: 1000,
    p_offset: 0,
  });
  return rows.map((r) => r.artist);
}

export async function getSyncState(): Promise<SyncState> {
  await requireLogin();
  const { data, error } = await db()
    .from("sync_state")
    .select("last_played_at, last_run_at, last_error, last_inserted")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`sync_state: ${error.message}`);
  return data as SyncState;
}

// Live from Last.fm on each page load. A failure here should never break the
// page, so it reports "nothing playing" instead.
export async function getNowPlaying(): Promise<NowPlaying | null> {
  await requireLogin();
  try {
    return await fetchNowPlaying();
  } catch {
    return null;
  }
}
