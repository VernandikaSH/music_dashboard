// Phase 2 cleanup: turns a raw scrobble into a clean artist and title and
// guesses which version of the song it is. Pure (no I/O), so it can be tested
// and re-run over history. Raw fields are never changed: the result is saved
// as artist_auto / title_auto, and plays_set_keys applies manual fixes on top.

// Bump when the rules change, so the re-run redoes plays cleaned by older rules.
export const CLEANUP_VERSION = 1;

export type VersionType =
  | "official_audio"
  | "official_video"
  | "lyric"
  | "live"
  | "cover"
  | "remix"
  | "unknown";

export type RawPlay = {
  artist: string;
  title: string;
  album?: string;
  channel?: string | null; // Takeout plays only
};

export type CleanPlay = {
  artist: string;
  title: string;
  versionType: VersionType;
  maybeNotMusic: boolean;
  // The artist is a label or playlist channel and the real one couldn't be
  // read from the title, so it needs a manual fix.
  artistUnknown: boolean;
};

// Uploaders that are labels, music shows, or playlists, never the artist.
// Compared after lowercasing and dropping everything but a-z and 0-9.
const LABEL_CHANNELS = [
  "hybelabels",
  "smtown",
  "jypentertainment",
  "stonemusicentertainment",
  "1thek",
  "geniemusic",
  "starshipentertainment",
  "ygentertainment",
  "atlanticrecords",
  "interscope",
  "sonymusicindonesia",
  "musicastudios",
  "trinityoptimaproduction",
  "aquariusmusikindo",
  "junirecords",
];

const CJK = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

// Words are matched with (^|[^a-z]) ... ([^a-z]|$) instead of \b so that
// "m/v" works; text is lowercased first.
function words(list: string): RegExp {
  return new RegExp(`(^|[^a-z])(${list})([^a-z]|$)`);
}

const REMIX = words("remix|sped ?up|slowed|nightcore|reverb");
const COVER_IN_BRACKETS = words("cover|covered by|original by");
const LIVE_ANYWHERE =
  /performance video|dance practice|choreography|relay dance|inkigayo|m ?countdown|music bank|music core|show champion|fancam|직캠|the first take|live akustik|versi akustik/;
const LIVE_IN_BRACKETS = words("live|concert|akustik|acoustic|stage|special clip");
const LYRIC = words("lyrics?|lirik|terjemahan|sub indo|eng ?sub|pinyin|romani[sz]ed|color coded");
const OFFICIAL_VIDEO = words("m/v|mv|music video|official video|video klip|visuali[sz]er");
const OFFICIAL_AUDIO = words("official audio");
const NOT_MUSIC = words("teaser|trailer|highlight medley|reaction|behind the scenes|episode|ep\\.\\s*\\d+");
const NOT_MUSIC_IN_BRACKETS = words("behind|bomb|vlog|making");

// Bracket groups that only describe the upload, e.g. "(Official MV)", "[4K]",
// "(feat. j-hope)". Remix brackets are kept: remixes are separate entries.
const BRACKET_NOISE = words(
  "official|m/v|mv|music video|video|audio|lyrics?|lirik|visuali[sz]er|hd|hq|4k|explicit|clean|" +
    "performance|dance practice|choreography|live|akustik|acoustic|feat\\.?|ft\\.|featuring|klip|" +
    "eng ?sub|sub indo|color coded|remaster(ed)?|stage|fancam|cover|covered by|original by|special clip",
);

const BRACKETS = /\s*[([【]([^()[\]【】]*)[)\]】]/g;

const SUFFIX_NOISE = new RegExp(
  "(?:^|\\s+|\\s*[|:\\-–—]\\s*)(?:" +
    "(?:official\\s+)?(?:m/v|mv|music video|lyric video|performance video|video klip|video lirik|visuali[sz]er)" +
    "|official\\s+(?:music\\s+)?(?:video|audio)|lyrics|lirik|dance practice|vevo" +
    ")\\s*$",
  "i",
);
const REMASTER_SUFFIX = /\s+[-–—]\s+(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?\s*$/i;
const LIVE_SUFFIX = /\s+[-–—]\s+live\b.*$/i;
const FEAT = /\s+(?:feat\.?|ft\.|featuring)\s+.*$/i;

const DASH_SPLIT = /\s+[-–—]\s+/;
const UNDERSCORE_SPLIT = /\s+_\s+/; // 1theK / Stone Music: "IU(아이유) _ Blueming(블루밍)"
// A title that ends in a quoted name: "BTS (방탄소년단) 'Danger'", "‘PSYCHO’".
const QUOTED_TAIL = /^(?:(.*?)\s+)?['‘"“「『]([^'‘’"“”「」『』]+)['’"”」』]$/;
const WRAPPING_QUOTES = /^['‘"“「『]([^'‘’"“”「」『』]+)['’"”」』]$/;

function bracketContents(s: string): string[] {
  return [...s.matchAll(BRACKETS)].map((m) => m[1].toLowerCase());
}

function detectVersion(title: string, artist: string, album: string, channel: string): VersionType {
  const t = title.toLowerCase();
  const inBrackets = bracketContents(title);
  const bracketed = (re: RegExp) => inBrackets.some((c) => re.test(c));

  if (REMIX.test(t)) return "remix";
  if (bracketed(COVER_IN_BRACKETS) || /(^|\s)cover$/.test(t)) return "cover";
  if (LIVE_ANYWHERE.test(t) || bracketed(LIVE_IN_BRACKETS) || LIVE_SUFFIX.test(title)) return "live";
  if (LYRIC.test(t)) return "lyric";
  if (OFFICIAL_VIDEO.test(t) || /vevo$/i.test(channel || artist)) return "official_video";
  if (OFFICIAL_AUDIO.test(t) || /\s-\s*topic$/i.test(channel || artist)) return "official_audio";
  // A plain title with an album is almost always the Song version in YouTube Music.
  if (album) return "official_audio";
  return "unknown";
}

function isNotMusic(title: string): boolean {
  return NOT_MUSIC.test(title.toLowerCase()) || bracketContents(title).some((c) => NOT_MUSIC_IN_BRACKETS.test(c));
}

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isLabel(artist: string): boolean {
  const key = compact(artist);
  return key !== "" && LABEL_CHANNELS.some((l) => key.startsWith(l));
}

function trimSeparators(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[\s\-–—_|:♬]+|[\s\-–—_|:♬]+$/g, "");
}

// Drops the Hangul/kanji half of a two-script name, keeping the Latin one:
// "BTS (방탄소년단)" → "BTS", "방탄소년단 (BTS)" → "BTS", "반드시 웃는다 I Smile" → "I Smile".
// Names in one script only are left alone. The canonical lookup confirms the match.
export function cleanName(input: string): string {
  let s = trimSeparators(input);
  s = s.replace(WRAPPING_QUOTES, "$1");

  // "Hangul (Latin)": keep the Latin part.
  const whole = s.match(/^([^()]+?)\s*\(([^()]+)\)$/);
  if (whole && CJK.test(whole[1]) && !CJK.test(whole[2]) && LATIN.test(whole[2])) {
    return trimSeparators(whole[2]);
  }

  // Parentheses holding only Hangul/kanji, when the rest has Latin letters.
  const withoutCjkParens = s.replace(/\s*\(([^()]*)\)/g, (m, inner: string) =>
    CJK.test(inner) && !LATIN.test(inner) ? "" : m,
  );
  if (LATIN.test(withoutCjkParens.replace(/\([^()]*\)/g, ""))) s = withoutCjkParens;

  // "Hangul words Latin words" or "Latin words Hangul words".
  const tokens = s.split(/\s+/).filter(Boolean);
  const cjk = tokens.map((t) => CJK.test(t));
  const firstLatin = cjk.indexOf(false);
  const firstCjk = cjk.indexOf(true);
  if (firstLatin > 0 && cjk.slice(firstLatin).every((c) => !c)) {
    const tail = tokens.slice(firstLatin).join(" ");
    if (LATIN.test(tail)) s = tail;
  } else if (firstCjk > 0 && cjk.slice(firstCjk).every((c) => c)) {
    const head = tokens.slice(0, firstCjk).join(" ");
    if (LATIN.test(head)) s = head;
  }

  return trimSeparators(s);
}

function cleanArtist(artist: string): string {
  return cleanName(artist.replace(/\s*-\s*topic$/i, "").replace(/\s*VEVO$/, ""));
}

function stripNoise(title: string): string {
  let s = title.replace(/♬/g, " ");
  s = s.replace(BRACKETS, (m, inner: string) => {
    const c = inner.toLowerCase();
    return !REMIX.test(c) && BRACKET_NOISE.test(c) ? "" : m;
  });
  s = s.replace(FEAT, "");
  // Suffixes can stack: "Title - Live Official Video".
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(SUFFIX_NOISE, "").replace(REMASTER_SUFFIX, "").replace(LIVE_SUFFIX, "").trim();
  }
  return trimSeparators(s);
}

export function normalize(play: RawPlay): CleanPlay {
  const rawArtist = play.artist.trim();
  const rawTitle = play.title.trim();
  const channel = play.channel?.trim() ?? "";

  const versionType = detectVersion(rawTitle, rawArtist, play.album?.trim() ?? "", channel);
  const maybeNotMusic = isNotMusic(rawTitle);
  const label = isLabel(rawArtist);

  const stripped = stripNoise(rawTitle);
  // Uploads with video markers are YouTube video titles, where "X - Y" means
  // artist X, song Y. Plain track names can contain " - " themselves.
  const videoTitle = stripped !== trimSeparators(rawTitle.replace(/♬/g, " "));

  let artist = cleanArtist(rawArtist);
  let title = stripped;

  // Splits the title into [artist part, song part] when the artist part is
  // either the uploader itself or can be trusted to be the real artist.
  const take = (left: string, right: string, trusted: boolean) => {
    const leftName = cleanName(left);
    if (!leftName) {
      title = right;
    } else if (compact(leftName) === compact(artist)) {
      title = right;
    } else if (trusted) {
      artist = leftName;
      title = right;
    }
  };

  const underscore = stripped.split(UNDERSCORE_SPLIT);
  const dash = stripped.split(DASH_SPLIT);
  const quoted = stripped.match(QUOTED_TAIL);
  if (underscore.length === 2) {
    take(underscore[0], underscore[1], true);
  } else if (dash.length >= 2) {
    take(dash[0], dash.slice(1).join(" - "), videoTitle || label);
  } else if (quoted) {
    take(quoted[1] ?? "", quoted[2], videoTitle || label);
  }

  title = cleanName(title) || rawTitle;
  artist = artist || rawArtist;
  const artistUnknown = label && compact(artist) === compact(cleanArtist(rawArtist));

  return { artist, title, versionType, maybeNotMusic, artistUnknown };
}
