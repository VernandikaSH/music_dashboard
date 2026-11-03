import { describe, expect, it } from "vitest";
import { cleanName, normalize, type CleanPlay, type RawPlay } from "./cleanup";

function check(play: RawPlay, expected: Partial<CleanPlay>) {
  expect(normalize(play)).toMatchObject(expected);
}

describe("normalize: K-pop video titles", () => {
  it("strips quotes and M/V", () => {
    check({ artist: "BABYMONSTER", title: "‘PSYCHO’ M/V" }, { artist: "BABYMONSTER", title: "PSYCHO", versionType: "official_video" });
    check({ artist: "BABYMONSTER", title: "'DRIP' M/V" }, { title: "DRIP", versionType: "official_video" });
    check({ artist: "Bigbang", title: "LOSER M/V" }, { artist: "Bigbang", title: "LOSER", versionType: "official_video" });
  });

  it("drops the artist when the title repeats it", () => {
    check({ artist: "Bigbang", title: "BIGBANG - ‘LAST DANCE’ M/V" }, { artist: "Bigbang", title: "LAST DANCE" });
    check({ artist: "Perunggu", title: "Perunggu - Pikiran Yang Matang" }, { artist: "Perunggu", title: "Pikiran Yang Matang" });
  });

  it("takes a different artist from a video title", () => {
    check({ artist: "Bigbang", title: "GD X TAEYANG - GOOD BOY M/V" }, { artist: "GD X TAEYANG", title: "GOOD BOY" });
  });

  it("reads the quoted-title format", () => {
    check({ artist: "HYBE LABELS", title: "BTS (방탄소년단) 'Danger' Official MV" }, { artist: "BTS", title: "Danger", artistUnknown: false });
    check({ artist: "aespa", title: "aespa 에스파 'Supernova' MV" }, { artist: "aespa", title: "Supernova", versionType: "official_video" });
    check({ artist: "ITZY", title: '"WANNABE" M/V' }, { title: "WANNABE" });
  });

  it("reads the 1theK format", () => {
    check({ artist: "1theK (원더케이)", title: "[MV] IU(아이유) _ Blueming(블루밍)" }, {
      artist: "IU",
      title: "Blueming",
      versionType: "official_video",
      artistUnknown: false,
    });
  });

  it("treats performance videos as live", () => {
    check({ artist: "ITZY", title: "WANNABE (Performance Video)" }, { title: "WANNABE", versionType: "live" });
    check({ artist: "ITZY", title: "Not Shy (Performance Video)" }, { title: "Not Shy", versionType: "live" });
    check({ artist: "NewJeans", title: "Supernatural Dance Practice" }, { title: "Supernatural", versionType: "live" });
    check({ artist: "aespa", title: "[직캠] aespa - Whiplash @인기가요" }, { versionType: "live" });
  });
});

describe("normalize: covers, remixes, feat.", () => {
  it("marks ♬ (Original by …) as a cover by the uploader", () => {
    check({ artist: "CORTIS", title: "“Haru Haru” ♬ (Original by BIGBANG)" }, { artist: "CORTIS", title: "Haru Haru", versionType: "cover" });
    check({ artist: "BABYMONSTER", title: "Off My Face ♬ (Original by Justin Bieber)" }, { title: "Off My Face", versionType: "cover" });
  });

  it("keeps remix and sped-up markers in the title", () => {
    check({ artist: "NewJeans", title: "Ditto (Sped Up)" }, { title: "Ditto (Sped Up)", versionType: "remix" });
    check({ artist: "NewJeans", title: "Ditto (250 Remix)" }, { title: "Ditto (250 Remix)", versionType: "remix" });
  });

  it("removes feat.", () => {
    check({ artist: "LE SSERAFIM", title: "SPAGHETTI (feat. j-hope)", album: "SPAGHETTI" }, { title: "SPAGHETTI", versionType: "official_audio" });
    check({ artist: "Someone", title: "Song feat. Other Person" }, { title: "Song" });
  });
});

describe("normalize: names in two scripts", () => {
  it.each([
    ["KISS OF LIFE (키스오브라이프)", "KISS OF LIFE"],
    ["Wanna One (워너원)", "Wanna One"],
    ["TXT (투바투)", "TXT"],
    ["방탄소년단 (BTS)", "BTS"],
    ["BTS", "BTS"],
  ])("artist %s → %s", (raw, expected) => {
    expect(normalize({ artist: raw, title: "x" }).artist).toBe(expected);
  });

  it.each([
    ["춤 (CHOOM)", "CHOOM"],
    ["Not Fine (나빠)", "Not Fine"],
    ["반드시 웃는다 I Smile", "I Smile"],
    ["전야 前夜 The Eve", "The Eve"],
    ["Free하게 Freely", "Freely"],
    ["그게 너의 사랑인지 몰랐어 didn’t know", "didn’t know"],
    ["삐딱하게", "삐딱하게"],
    ["Pray (I'll Be Your Man)", "Pray (I'll Be Your Man)"],
    ["Zombie (English Ver.)", "Zombie (English Ver.)"],
  ])("title %s → %s", (raw, expected) => {
    expect(cleanName(raw)).toBe(expected);
  });
});

describe("normalize: leaves plain track names alone", () => {
  it.each([
    "CLIK CLAK",
    "Dan...",
    "Congratulations (Final)",
    "so let's love",
    "Don't Wanna Cry",
    "1-1=0",
    "Pray (I'll Be Your Man)",
  ])("%s", (title) => {
    expect(normalize({ artist: "DAY6", title }).title).toBe(title);
  });

  it("does not take an artist from a plain ' - ' title", () => {
    check({ artist: "Someone", title: "Song - From the Movie" }, { artist: "Someone", title: "Song - From the Movie" });
  });

  it("does not take an artist from quotes in a plain title", () => {
    check({ artist: "Someone", title: "I'm 'Fine'" }, { artist: "Someone" });
  });

  it("strips remaster suffixes", () => {
    check({ artist: "Queen", title: "Bohemian Rhapsody - Remastered 2011" }, { title: "Bohemian Rhapsody" });
  });
});

describe("normalize: uploader names", () => {
  it("drops - Topic and VEVO", () => {
    check({ artist: "NIKI - Topic", title: "Every Summertime" }, { artist: "NIKI", versionType: "official_audio" });
    check({ artist: "NIKIVEVO", title: "Every Summertime (Official Music Video)" }, {
      artist: "NIKI",
      title: "Every Summertime",
      versionType: "official_video",
    });
  });

  it("flags label channels when the title has no artist", () => {
    check({ artist: "Genie Music", title: "THUNDER" }, { artist: "Genie Music", title: "THUNDER", artistUnknown: true });
    check({ artist: "SMTOWN LIVE 2025 [THE CULTURE, THE FUTURE] in SEOUL Playlist", title: "Whiplash" }, { artistUnknown: true });
    check({ artist: "Starship", title: "We Built This City" }, { artistUnknown: false });
  });
});

describe("normalize: version from album and lyrics", () => {
  it("a plain title with an album is the audio version", () => {
    check({ artist: "BABYMONSTER", title: "CLIK CLAK", album: "DRIP" }, { versionType: "official_audio" });
    check({ artist: "KISS OF LIFE (키스오브라이프)", title: "Igloo", album: "" }, { versionType: "unknown" });
  });

  it("detects lyric and translation uploads", () => {
    check({ artist: "fan", title: "Hindia - Cincin (Lirik)" }, { artist: "Hindia", title: "Cincin", versionType: "lyric" });
    check({ artist: "fan", title: "NewJeans - Ditto [Color Coded Lyrics Han/Rom/Eng]" }, { artist: "NewJeans", title: "Ditto", versionType: "lyric" });
  });
});

describe("normalize: maybe not music", () => {
  it.each([
    "aespa 'Whiplash' MV Teaser",
    "[BANGTAN BOMB] Jin's birthday",
    "BABYMONSTER - 'DRIP' Highlight Medley",
    "Run BTS! Episode 1",
  ])("%s", (title) => {
    expect(normalize({ artist: "x", title }).maybeNotMusic).toBe(true);
  });

  it("not for songs", () => {
    expect(normalize({ artist: "BABYMONSTER", title: "‘PSYCHO’ M/V" }).maybeNotMusic).toBe(false);
  });
});
