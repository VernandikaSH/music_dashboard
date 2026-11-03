import "server-only";
import { env } from "./env";

const API_URL = "https://ws.audioscrobbler.com/2.0/";
export const PAGE_SIZE = 200;

// Last.fm's grey star image, sent when it has no real cover.
const PLACEHOLDER_IMAGE = "2a96cbd8b46e442fc41c2b86b821562f";

export type Scrobble = {
  playedAt: Date;
  artist: string;
  title: string;
  album: string;
  imageUrl: string | null;
};

export type NowPlaying = {
  artist: string;
  title: string;
  album: string;
  imageUrl: string | null;
};

type RawTrack = {
  artist: { "#text": string };
  name: string;
  album?: { "#text": string };
  image?: { "#text": string; size: string }[];
  date?: { uts: string };
  "@attr"?: { nowplaying?: string };
};

type RecentTracksResponse = {
  recenttracks: {
    // Last.fm returns a bare object instead of an array when there is one track.
    track: RawTrack[] | RawTrack;
    "@attr": { page: string; totalPages: string; total: string };
  };
};

type ErrorResponse = { error: number; message: string };

function imageOf(t: RawTrack): string | null {
  const images = t.image ?? [];
  const url =
    images.find((i) => i.size === "extralarge")?.["#text"] || images.at(-1)?.["#text"] || "";
  return url && !url.includes(PLACEHOLDER_IMAGE) ? url : null;
}

async function fetchRecentTracks(params: Record<string, string>) {
  const qs = new URLSearchParams({
    method: "user.getrecenttracks",
    user: env.lastfmUsername,
    api_key: env.lastfmApiKey,
    format: "json",
    ...params,
  });
  const res = await fetch(`${API_URL}?${qs}`, { cache: "no-store" });
  const body = (await res.json()) as RecentTracksResponse | ErrorResponse;

  if ("error" in body) {
    if (body.error === 17) {
      throw new Error(
        "Last.fm refused to share recent tracks (error 17). Turn off \"Hide recent listening\" in Last.fm Settings -> Privacy.",
      );
    }
    throw new Error(`Last.fm error ${body.error}: ${body.message}`);
  }
  if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}`);

  const raw = body.recenttracks.track;
  return {
    tracks: Array.isArray(raw) ? raw : raw ? [raw] : [],
    totalPages: Number(body.recenttracks["@attr"].totalPages) || 0,
  };
}

export async function getRecentTracksPage(
  page: number,
  fromUnixSeconds?: number,
): Promise<{ scrobbles: Scrobble[]; totalPages: number }> {
  const params: Record<string, string> = { limit: String(PAGE_SIZE), page: String(page) };
  if (fromUnixSeconds !== undefined) params.from = String(fromUnixSeconds);
  const { tracks, totalPages } = await fetchRecentTracks(params);

  const scrobbles = tracks
    // The "now playing" entry has no timestamp yet; it gets scrobbled later.
    .filter((t) => t["@attr"]?.nowplaying !== "true" && t.date?.uts)
    .map((t) => ({
      playedAt: new Date(Number(t.date!.uts) * 1000),
      artist: t.artist["#text"].trim(),
      title: t.name.trim(),
      album: (t.album?.["#text"] ?? "").trim(),
      imageUrl: imageOf(t),
    }));

  return { scrobbles, totalPages };
}

// ---------------------------------------------------------------------------
// Lookups (autocorrect on). Returns null when Last.fm has no such entry.
// ---------------------------------------------------------------------------

const NOT_FOUND = 6;

async function getInfo<T>(params: Record<string, string>): Promise<T | null> {
  const qs = new URLSearchParams({ api_key: env.lastfmApiKey, format: "json", autocorrect: "1", ...params });
  const res = await fetch(`${API_URL}?${qs}`, { cache: "no-store" });
  const body = (await res.json()) as T | ErrorResponse;
  if (body && typeof body === "object" && "error" in body) {
    if (body.error === NOT_FOUND) return null;
    throw new Error(`Last.fm error ${body.error}: ${body.message}`);
  }
  if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}`);
  return body;
}

export type TrackInfo = { title: string; listeners: number; durationS: number | null; album: string | null };

export async function getTrackInfo(artist: string, title: string): Promise<TrackInfo | null> {
  const body = await getInfo<{
    track: { name: string; listeners?: string; duration?: string; album?: { title?: string } };
  }>({ method: "track.getinfo", artist, track: title });
  if (!body?.track) return null;
  const ms = Number(body.track.duration) || 0; // "0" when Last.fm doesn't know
  return {
    title: body.track.name,
    listeners: Number(body.track.listeners) || 0,
    durationS: ms > 0 ? Math.round(ms / 1000) : null,
    album: body.track.album?.title || null,
  };
}

// The song playing right now, as the scrobbler reports it, or null.
export async function getNowPlaying(): Promise<NowPlaying | null> {
  const { tracks } = await fetchRecentTracks({ limit: "1" });
  const t = tracks.find((x) => x["@attr"]?.nowplaying === "true");
  if (!t) return null;
  return {
    artist: t.artist["#text"].trim(),
    title: t.name.trim(),
    album: (t.album?.["#text"] ?? "").trim(),
    imageUrl: imageOf(t),
  };
}
