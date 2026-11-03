import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BlockButton } from "@/components/block-button";
import { Pagination } from "@/components/pagination";
import { RangePicker } from "@/components/range-picker";
import { ArtistLink, Card, RankedList, TrackLink, type RankedRow } from "@/components/ranked-list";
import { RemixToggle } from "@/components/remix-toggle";
import { getTopAlbums, getTopArtists, getTopTracks } from "@/lib/data";
import { parseMergeRemixes, parsePage, parseRange, remixQuery, withQuery, type SearchParams } from "@/lib/range";
import { FixLink } from "@/components/fix-link";

const PAGE_SIZE = 50;
const KINDS = { artists: "Top artists", tracks: "Top tracks", albums: "Top albums" } as const;
type Kind = keyof typeof KINDS;

export default function TopPage({ params, searchParams }: PageProps<"/top/[kind]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Top params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Top({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ kind }, sp] = await Promise.all([params, searchParams]);
  if (!(kind in KINDS)) notFound();
  const k = kind as Kind;

  await connection();
  const now = new Date();
  const range = parseRange(sp, now);
  const page = parsePage(sp);
  const offset = (page - 1) * PAGE_SIZE;
  const mergeRemixes = k === "tracks" && parseMergeRemixes(sp);
  const query = { ...range.query, ...remixQuery(mergeRemixes) };
  const here = withQuery(`/top/${k}`, query, { page: page > 1 ? String(page) : undefined });

  let rows: RankedRow[];
  let total: number;

  if (k === "artists") {
    const res = await getTopArtists(range, PAGE_SIZE, offset);
    total = res.total;
    rows = res.rows.map((a) => ({
      key: a.artist_key,
      primary: <ArtistLink artistKey={a.artist_key}>{a.artist}</ArtistLink>,
      coverName: a.artist,
      image: a.image_url,
      plays: a.plays,
      action: (
        <>
          <FixLink kind="artist" value={a.artist_key} next={here} />
          <BlockButton kind="artist" value={a.artist_key} label={a.artist} blocked={false} />
        </>
      ),
    }));
  } else if (k === "tracks") {
    const res = await getTopTracks(range, PAGE_SIZE, offset, { mergeRemixes });
    total = res.total;
    rows = res.rows.map((t) => ({
      key: t.track_key,
      primary: <TrackLink trackKey={t.base_track_key}>{t.title}</TrackLink>,
      secondary: <ArtistLink artistKey={t.artist_key}>{t.artist}</ArtistLink>,
      coverName: t.title,
      image: t.image_url,
      plays: t.plays,
      action: (
        <>
          <FixLink kind="track" value={t.track_key} next={here} />
          <BlockButton kind="track" value={t.track_key} label={`${t.artist} – ${t.title}`} blocked={false} />
        </>
      ),
    }));
  } else {
    const res = await getTopAlbums(range, PAGE_SIZE, offset);
    total = res.total;
    rows = res.rows.map((a) => ({
      key: `${a.artist_key}|${a.album}`,
      primary: a.album,
      secondary: <ArtistLink artistKey={a.artist_key}>{a.artist}</ArtistLink>,
      coverName: a.album,
      image: a.image_url,
      plays: a.plays,
    }));
  }

  return (
    <div className="flex flex-col gap-5">
      <RangePicker basePath={`/top/${k}`} range={range} extra={remixQuery(mergeRemixes)} now={now} />
      <Card
        title={`${KINDS[k]}, ${range.label.toLowerCase()}`}
        action={
          <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
            {k === "tracks" && <RemixToggle basePath="/top/tracks" query={range.query} merged={mergeRemixes} />}
            <span className="tabular text-muted">{total.toLocaleString("en-US")} in total</span>
          </div>
        }
      >
        <RankedList rows={rows} startRank={offset + 1} />
        <Pagination basePath={`/top/${k}`} query={query} page={page} pageSize={PAGE_SIZE} total={total} />
      </Card>
    </div>
  );
}
