import "server-only";

// MusicBrainz: free, no key, but at most 1 request per second and every
// request needs a User-Agent naming the app.
const API_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "listening-tracker/0.1 (personal listening dashboard)";
const REQUEST_GAP_MS = 1100;

// 503 means "slow down", and MusicBrainz also sheds load server-wide at busy
// times, so it can come even when we are under the limit. Wait longer each try.
const RETRY_WAITS_MS = [3000, 6000];

let lastRequestAt = 0;

async function search<T>(entity: "artist" | "recording", query: string): Promise<T> {
  const qs = new URLSearchParams({ query, fmt: "json", limit: "5" });
  for (let attempt = 0; ; attempt++) {
    const waitMs = lastRequestAt + (attempt === 0 ? REQUEST_GAP_MS : RETRY_WAITS_MS[attempt - 1]) - Date.now();
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    lastRequestAt = Date.now();

    const res = await fetch(`${API_URL}/${entity}?${qs}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 503 && attempt < RETRY_WAITS_MS.length) continue;
    if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

// Lucene special characters. Values are not quoted: quoted Hangul finds nothing.
function escape(s: string): string {
  return s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}

// Letters and digits only, so "G‐Dragon" (with U+2010) = "G-DRAGON".
function matchKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const LATIN = /[A-Za-z]/;

type MbAlias = { name: string; locale?: string | null; primary?: boolean | null };
type MbArtist = { id: string; score: number; name: string; "sort-name": string; aliases?: MbAlias[] };

// Recording titles go in quotes; strip characters that would break the query.
function phrase(s: string): string {
  return `"${s.replace(/["\\]/g, "")}"`;
}

async function hasRecording(artistId: string, title: string): Promise<boolean> {
  const { recordings = [] } = await search<{ recordings?: MbRecording[] }>(
    "recording",
    `recording:${phrase(title)} AND arid:${artistId}`,
  );
  return recordings.some((r) => r.score >= 90);
}

// The Latin-script name of an artist given in another script:
// "뉴진스" → "NewJeans", "아이유" → "IU". Only exact name or alias matches count.
// Stage names are often shared ("태양" is both BIGBANG's TAEYANG and SF9's
// Yoo Tae Yang), so with several matches the one with one of my songs wins,
// and with none confirmed the name is left alone.
export async function findLatinArtistName(name: string, titles: string[]): Promise<string | null> {
  const q = escape(name);
  const { artists = [] } = await search<{ artists?: MbArtist[] }>("artist", `alias:${q} OR artist:${q}`);
  const key = matchKey(name);
  const matches = artists.filter(
    (a) => matchKey(a.name) === key || (a.aliases ?? []).some((al) => matchKey(al.name) === key),
  );

  let hit = matches.length === 1 ? matches[0] : undefined;
  for (const candidate of matches.length > 1 ? matches.slice(0, 3) : []) {
    for (const title of titles.slice(0, 2)) {
      if (await hasRecording(candidate.id, title)) {
        hit = candidate;
        break;
      }
    }
    if (hit) break;
  }
  if (!hit) return null;
  if (LATIN.test(hit.name)) return hit.name;
  const english = (hit.aliases ?? []).filter((al) => LATIN.test(al.name) && al.locale === "en");
  return (english.find((al) => al.primary) ?? english[0])?.name ?? null;
}

type MbRecording = {
  score: number;
  title: string;
  length?: number | null;
  "artist-credit"?: { name: string; artist: { name: string; "sort-name": string } }[];
};

export type RecordingMatch = { title: string; durationS: number | null };

// A recording by this artist with this title. The artist must match one of
// the credited names; the title may have extra words ("삐딱하게 (Crooked)").
export async function findRecording(artist: string, title: string): Promise<RecordingMatch | null> {
  const { recordings = [] } = await search<{ recordings?: MbRecording[] }>(
    "recording",
    `recording:${phrase(title)} AND artist:${phrase(artist)}`,
  );
  const a = matchKey(artist);
  const t = matchKey(title);
  const hit = recordings.find((r) => {
    if (r.score < 90) return false;
    const names = (r["artist-credit"] ?? []).flatMap((c) => [c.name, c.artist.name, c.artist["sort-name"]]);
    const rt = matchKey(r.title);
    return names.some((n) => matchKey(n) === a) && (rt === t || rt.startsWith(t));
  });
  if (!hit) return null;
  return { title: hit.title, durationS: hit.length ? Math.round(hit.length / 1000) : null };
}
