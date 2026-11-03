import "server-only";
import { db } from "./supabase";
import { getTrackInfo } from "./lastfm";
import { findLatinArtistName, findRecording } from "./musicbrainz";

// Canonical lookup. Results are cached in lookup_cache under the names after
// cleanup ("artist:<key>", "track:<key>"), so each one is looked up once. The
// plays_set_keys trigger applies them; manual fixes still win.
//
// Artists are looked up on their own, not per track: the same artist always
// gets the same name, so their songs never split across two spellings.

// Last.fm creates an entry for anything scrobbled, even junk, so "known" means
// enough other people played it too. My own scrobbles count as 1.
const MIN_TRACK_LISTENERS = 10;
const LASTFM_DELAY_MS = 250; // Last.fm allows about 5 requests per second
const BATCH = 50;

const CJK = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯]/;
const LATIN = /[A-Za-z]/;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ArtistLookup = { name: string | null; recognized: boolean };
export type TrackLookup = {
  recognized: boolean; // on Last.fm with enough listeners, or on MusicBrainz
  duration_s: number | null;
  album: string | null;
  source: "lastfm" | "musicbrainz" | null;
};

// Only Hangul/kana-only names are renamed: MusicBrainz knows "뉴진스" is
// NewJeans. Last.fm's artist autocorrect is not used: it mostly just recases
// ("KISS OF LIFE" → "Kiss of Life") and its real corrections can be names
// nobody uses ("TAEYANG" → "Yoo Tae Yang").
export async function lookUpArtist(artist: string, titles: string[]): Promise<ArtistLookup> {
  if (!CJK.test(artist) || LATIN.test(artist)) return { name: null, recognized: true };
  const name = await findLatinArtistName(artist, titles);
  return { name, recognized: name !== null };
}

export async function lookUpTrack(artist: string, title: string): Promise<TrackLookup> {
  const info = await getTrackInfo(artist, title);
  await wait(LASTFM_DELAY_MS);
  const known = info !== null && info.listeners >= MIN_TRACK_LISTENERS;
  const result: TrackLookup = {
    recognized: known,
    duration_s: known ? info.durationS : null,
    album: known ? info.album : null,
    source: known ? "lastfm" : null,
  };
  // Last.fm often has no length for K-pop; MusicBrainz usually does.
  if (!result.recognized || result.duration_s === null) {
    const rec = await findRecording(artist, title);
    if (rec) {
      result.recognized = true;
      result.source ??= "musicbrainz";
      result.duration_s ??= rec.durationS;
    }
  }
  return result;
}

async function save(rows: { raw_key: string; result: unknown }[]) {
  if (rows.length === 0) return;
  const { error } = await db().rpc("save_lookups", { p_rows: rows });
  if (error) throw new Error(`Saving lookups: ${error.message}`);
}

export type LookupResult = { artists: number; tracks: number };

// Looks up as much as fits in `budgetMs`, most-played first; the rest waits
// for the next sync. A failed lookup is skipped and retried next time.
export async function runLookups(budgetMs: number): Promise<LookupResult> {
  const supabase = db();
  const deadline = Date.now() + budgetMs;
  const done = { artists: 0, tracks: 0 };

  // Artists first: a corrected artist name changes the track lookup keys.
  const { data: artists, error: artistsError } = await supabase.rpc("artists_needing_lookup", { p_limit: BATCH });
  if (artistsError) throw new Error(`artists_needing_lookup: ${artistsError.message}`);
  const artistRows = [];
  for (const a of (artists ?? []) as { lookup_key: string; artist: string; titles: string[] | null }[]) {
    if (Date.now() > deadline) break;
    try {
      artistRows.push({ raw_key: `artist:${a.lookup_key}`, result: await lookUpArtist(a.artist, a.titles ?? []) });
    } catch {
      continue;
    }
  }
  await save(artistRows);
  done.artists = artistRows.length;

  const { data: tracks, error: tracksError } = await supabase.rpc("tracks_needing_lookup", { p_limit: BATCH });
  if (tracksError) throw new Error(`tracks_needing_lookup: ${tracksError.message}`);
  const trackRows = [];
  for (const t of (tracks ?? []) as { lookup_key: string; artist: string; title: string }[]) {
    if (Date.now() > deadline) break;
    try {
      trackRows.push({ raw_key: `track:${t.lookup_key}`, result: await lookUpTrack(t.artist, t.title) });
    } catch {
      continue;
    }
  }
  await save(trackRows);
  done.tracks = trackRows.length;

  return done;
}
