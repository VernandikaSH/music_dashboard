import "server-only";
import { db } from "./supabase";

// Fills in covers Last.fm didn't send: artist photos (and covers of their
// songs) from Deezer, other track covers from the iTunes Search API. Both are
// free and need no key. A result is only used when the artist and title
// actually match, so a cover version never gets the original's artwork.

const ITUNES_DELAY_MS = 350; // iTunes allows roughly 20 requests per minute per IP
const DEEZER_DELAY_MS = 120; // Deezer allows 50 requests per 5 seconds
// An exact-name match not confirmed by a song is only trusted for an artist
// this popular; Deezer has many tiny namesakes (a "Seventeen" with 4 fans).
const MIN_FANS_UNCONFIRMED = 20_000;
// Raise when the matching rules change: the next run clears old results
// (including any wrong photos) and looks everything up again.
const LOOKUP_VERSION = 2;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "KISS OF LIFE (키스오브라이프)" -> "KISS OF LIFE"
function searchArtist(artist: string): string {
  return artist.replace(/\s*\([^)]*[가-힯][^)]*\)/g, "").trim();
}

// "BIGBANG - ‘LAST DANCE’ M/V" -> "LAST DANCE"; "Off My Face ♬ (Original by …)" -> "Off My Face"
function searchTitle(title: string, artist: string): string {
  let s = title.replace(/♬.*$/, "").replace(/\((?:original by|prod\.?)[^)]*\)/gi, "");
  s = s.replace(/\b(official\s+)?(m\/v|mv|music video|video|audio|lyrics?)\b/gi, "");
  const dash = s.indexOf(" - ");
  if (dash > 0 && matchKey(s.slice(0, dash)).includes(matchKey(artist))) s = s.slice(dash + 3);
  return s.replace(/[‘’'“”"「」『』]/g, "").replace(/[[\]()]/g, " ").replace(/\s+/g, " ").trim();
}

// Letters and digits only: "Big Bang" = "BIGBANG", ".Feast" = "Feast".
function matchKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function sameArtist(a: string, b: string): boolean {
  const x = matchKey(a);
  const y = matchKey(b);
  return x.length > 0 && (x === y || x.includes(y) || y.includes(x));
}

function sameTitle(a: string, b: string): boolean {
  const x = matchKey(a);
  const y = matchKey(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

// ---------------------------------------------------------------------------
// iTunes: track covers
// ---------------------------------------------------------------------------

type ItunesSong = { artistName: string; trackName: string; artworkUrl100?: string };

async function findTrackCover(artist: string, title: string, matchedName: string | null): Promise<string | null> {
  const a = searchArtist(artist);
  const t = searchTitle(title, a);
  if (!t) return null;
  // US store first, then Indonesia for local releases.
  for (const country of ["US", "ID"]) {
    const qs = new URLSearchParams({ term: `${matchedName ?? a} ${t}`, entity: "song", limit: "10", country });
    const res = await fetch(`https://itunes.apple.com/search?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
    const body = (await res.json()) as { results?: ItunesSong[] };
    const hit = body.results?.find(
      (r) =>
        r.artworkUrl100 &&
        (sameArtist(r.artistName, a) || (matchedName !== null && sameArtist(r.artistName, matchedName))) &&
        sameTitle(r.trackName, t),
    );
    if (hit) return hit.artworkUrl100!.replace(/\/\d+x\d+bb\./, "/600x600bb.");
    await wait(ITUNES_DELAY_MS);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deezer: artist photos, confirmed by the artist's songs
// ---------------------------------------------------------------------------

type DeezerArtist = { id: number; name: string; nb_fan: number; picture_xl?: string };
type DeezerTrack = { title: string; album?: { cover_xl?: string } };

async function deezer<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.deezer.com${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
  await wait(DEEZER_DELAY_MS);
  return (await res.json()) as T;
}

function realPicture(a: DeezerArtist): string | null {
  // Deezer's "no photo" URL has an empty image id: ".../images/artist//1000x1000..."
  return a.picture_xl && !a.picture_xl.includes("/artist//") ? a.picture_xl : null;
}

type ArtistMatch = {
  image: string | null;
  name: string;
  // Covers of my tracks found among the artist's Deezer top songs, by track_key.
  trackCovers: Map<string, string>;
};

// Finds the Deezer artist that actually performs my songs. "TXT" finds
// TOMORROW X TOGETHER because its top songs include "Deja Vu", not the
// unrelated Deezer artist literally named "TXT".
async function findArtist(
  artist: string,
  tracks: { track_key: string; title: string }[],
): Promise<ArtistMatch | null> {
  const a = searchArtist(artist);
  const titles = tracks.map((t) => ({ ...t, search: searchTitle(t.title, a) })).filter((t) => t.search);
  const { data = [] } = await deezer<{ data?: DeezerArtist[] }>(
    `/search/artist?limit=10&q=${encodeURIComponent(a)}`,
  );

  // Skip throwaway namesakes; a candidate must still have one of my songs.
  for (const candidate of data.filter((c) => c.nb_fan >= 100).slice(0, 5)) {
    const { data: top = [] } = await deezer<{ data?: DeezerTrack[] }>(`/artist/${candidate.id}/top?limit=100`);
    const trackCovers = new Map<string, string>();
    let confirmed = false;
    for (const t of titles) {
      const song = top.find((s) => sameTitle(s.title, t.search));
      if (!song) continue;
      confirmed = true;
      if (song.album?.cover_xl) trackCovers.set(t.track_key, song.album.cover_xl);
    }
    if (confirmed) return { image: realPicture(candidate), name: candidate.name, trackCovers };
  }

  const exact = data
    .filter((c) => matchKey(c.name) === matchKey(a))
    .sort((x, y) => y.nb_fan - x.nb_fan)[0];
  if (exact && exact.nb_fan >= MIN_FANS_UNCONFIRMED) {
    return { image: realPicture(exact), name: exact.name, trackCovers: new Map() };
  }
  return null;
}

// ---------------------------------------------------------------------------

export type CoverResult = { tracks: number; artists: number };

async function resetIfRulesChanged() {
  const supabase = db();
  const { data } = await supabase.from("sync_state").select("cover_lookup_version").eq("id", 1).single();
  if (!data || data.cover_lookup_version >= LOOKUP_VERSION) return;
  await supabase.from("artists").delete().neq("artist_key", "");
  await supabase.from("tracks").update({ image_url: null, image_checked_at: null }).neq("track_key", "");
  await supabase.from("sync_state").update({ cover_lookup_version: LOOKUP_VERSION }).eq("id", 1);
}

function saveTrack(track_key: string, artist: string, title: string, image: string | null) {
  return db().from("tracks").upsert({
    track_key,
    artist_clean: artist,
    title_clean: title,
    image_url: image,
    image_checked_at: new Date().toISOString(),
  });
}

// Looks up at most `limit` artists and `limit` tracks, most-played first.
// Errors on one item are skipped so a flaky lookup never fails a sync.
export async function fillMissingCovers(limit = 15): Promise<CoverResult> {
  const supabase = db();
  const result = { tracks: 0, artists: 0 };
  await resetIfRulesChanged();

  // Artists first: a confirmed artist also brings covers for my songs and the
  // name iTunes knows them by.
  const { data: artists, error: artistsError } = await supabase.rpc("artists_needing_image", { p_limit: limit });
  if (artistsError) throw new Error(`artists_needing_image: ${artistsError.message}`);
  for (const a of (artists ?? []) as {
    artist_key: string;
    artist: string;
    tracks: { track_key: string; title: string }[] | null;
  }[]) {
    let match: ArtistMatch | null;
    try {
      match = await findArtist(a.artist, a.tracks ?? []);
    } catch {
      continue; // try again next sync
    }
    await supabase.from("artists").upsert({
      artist_key: a.artist_key,
      name: a.artist,
      matched_name: match?.name ?? null,
      image_url: match?.image ?? null,
      image_checked_at: new Date().toISOString(),
    });
    if (match?.image) result.artists++;
    for (const [trackKey, cover] of match?.trackCovers ?? []) {
      const title = a.tracks?.find((t) => t.track_key === trackKey)?.title ?? trackKey;
      await saveTrack(trackKey, a.artist, title, cover);
      result.tracks++;
    }
  }

  const { data: tracks, error: tracksError } = await supabase.rpc("tracks_needing_cover", { p_limit: limit });
  if (tracksError) throw new Error(`tracks_needing_cover: ${tracksError.message}`);
  const list = (tracks ?? []) as { track_key: string; artist: string; title: string }[];
  // track_key starts with the artist_key ("artist|title").
  const artistKeyOf = (trackKey: string) => trackKey.split("|")[0];
  const { data: names } = await supabase
    .from("artists")
    .select("artist_key, matched_name")
    .in("artist_key", [...new Set(list.map((t) => artistKeyOf(t.track_key)))]);
  const matchedName = new Map((names ?? []).map((n) => [n.artist_key as string, n.matched_name as string | null]));

  for (const t of list) {
    let image: string | null;
    try {
      image = await findTrackCover(t.artist, t.title, matchedName.get(artistKeyOf(t.track_key)) ?? null);
    } catch {
      continue;
    }
    await saveTrack(t.track_key, t.artist, t.title, image);
    if (image) result.tracks++;
    await wait(ITUNES_DELAY_MS);
  }

  return result;
}
