import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BlockButton } from "@/components/block-button";
import { FixLink } from "@/components/fix-link";
import { PlaysChart } from "@/components/plays-chart";
import { RangePicker } from "@/components/range-picker";
import { ArtistLink, RankedList, TrackLink } from "@/components/ranked-list";
import { RecentList } from "@/components/recent-list";
import { RemixToggle } from "@/components/remix-toggle";
import { SyncButton } from "@/components/sync-button";
import { Card, Cover, EstTimeStat, Stat, Sticker } from "@/components/ui";
import {
  getBlockedValues,
  getNowPlaying,
  getPlaysOverTime,
  getRecentPlays,
  getSummary,
  getSyncState,
  getTopAlbums,
  getTopArtists,
  getTopTracks,
  type SyncState,
  type TopAlbum,
  type TopArtist,
} from "@/lib/data";
import {
  BUCKETS,
  parseBucket,
  parseMergeRemixes,
  parseRange,
  remixQuery,
  withQuery,
  type DateRange,
  type SearchParams,
} from "@/lib/range";
import { formatRelative } from "@/lib/time";

const TOP_N = 10;
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<Card className="h-[120px]"><span className="text-sm text-muted">Checking what’s playing…</span></Card>}>
        <NowPlayingCard />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted">Loading your charts…</p>}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NowPlayingCard() {
  const [now, last] = await Promise.all([getNowPlaying(), getRecentPlays(1)]);
  const lastPlay = last.rows[0];
  const track = now ?? (lastPlay && {
    title: lastPlay.title_clean,
    artist: lastPlay.artist_clean,
    imageUrl: lastPlay.image_url,
  });
  if (!track) return null;
  return (
    <Card className="relative">
      <Sticker tone={now ? "lemon" : "plain"} className="absolute -top-3 left-5" tilt={-5}>
        {now ? "Now playing" : "Last played"}
      </Sticker>
      <div className="flex items-center gap-4 pt-1">
        <Cover src={track.imageUrl} name={track.title} size={72} />
        <div className="min-w-0">
          <div className="truncate font-display text-2xl font-extrabold tracking-tight">{track.title}</div>
          <div className="truncate text-ink-2">{track.artist}</div>
          {!now && lastPlay && (
            <div className="text-sm text-muted">{formatRelative(lastPlay.played_at, new Date())}</div>
          )}
        </div>
      </div>
    </Card>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Partial Prefetching can render from the URL alone, so wait for a real
  // request before reading the clock.
  await connection();
  const sp = await searchParams;
  const now = new Date();
  const range = parseRange(sp, now);
  const bucket = parseBucket(sp, range);
  const mergeRemixes = parseMergeRemixes(sp);
  const remixes = remixQuery(mergeRemixes);
  const here = withQuery("/", range.query, remixes, { bucket: sp.bucket ? bucket : undefined });

  const [sync, summary, series, artists, tracks, albums, recent, blocked] = await Promise.all([
    getSyncState(),
    getSummary(range),
    getPlaysOverTime(range, bucket),
    getTopArtists(range, TOP_N),
    getTopTracks(range, TOP_N, 0, { mergeRemixes }),
    getTopAlbums(range, 12),
    getRecentPlays(15),
    getBlockedValues(),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <dl className="flex gap-8">
          <Stat label="plays" value={summary.plays} />
          <Stat label="artists" value={summary.artists} />
          <Stat label="tracks" value={summary.tracks} />
          <EstTimeStat seconds={summary.est_seconds} guessedSeconds={summary.guessed_seconds} />
        </dl>
        <SyncBar sync={sync} now={now} />
      </div>

      <RangePicker basePath="/" range={range} extra={remixes} now={now} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <NumberOne artist={artists.rows[0]} range={range} />
        <Card
          title="Top tracks"
          action={
            <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
              <RemixToggle basePath="/" query={{ ...range.query, bucket: sp.bucket ? bucket : undefined }} merged={mergeRemixes} />
              <SeeAll kind="tracks" query={{ ...range.query, ...remixes }} total={tracks.total} />
            </div>
          }
        >
          <RankedList
            rows={tracks.rows.map((t) => ({
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
            }))}
          />
        </Card>
      </div>

      <Card
        title="Plays over time"
        action={
          <div className="flex gap-1">
            {BUCKETS.map((b) => (
              <Link
                key={b}
                href={withQuery("/", range.query, remixes, { bucket: b })}
                aria-current={b === bucket ? "true" : undefined}
                className={`rounded-lg border-2 px-2 py-0.5 font-medium capitalize ${
                  b === bucket ? "border-outline bg-card-2 text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {b}
              </Link>
            ))}
          </div>
        }
      >
        <PlaysChart data={series} bucket={bucket} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Top artists" action={<SeeAll kind="artists" query={range.query} total={artists.total} />}>
          <RankedList
            rows={artists.rows.map((a) => ({
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
            }))}
          />
        </Card>
        <Card title="Top albums" action={<SeeAll kind="albums" query={range.query} total={albums.total} limit={12} />}>
          <AlbumGrid albums={albums.rows} />
        </Card>
      </div>

      <Card
        title="Recently played"
        action={
          <Link href="/recent" className="font-medium text-ink-2 hover:text-ink">
            See all
          </Link>
        }
      >
        <RecentList plays={recent.rows} blocked={blocked} next={here} />
      </Card>
    </>
  );
}

function NumberOne({ artist, range }: { artist: TopArtist | undefined; range: DateRange }) {
  const when = range.preset === "all" ? "of all time" : range.preset === "custom" ? "in this range" : `in the last ${range.label}`;
  return (
    <Card tone="cobalt" className="relative flex flex-col">
      <Sticker tone="coral" className="absolute -top-3 right-5" tilt={5}>
        Your #1
      </Sticker>
      {artist ? (
        <>
          <Cover src={artist.image_url} name={artist.artist} size={132} className="border-[#141414]" />
          <Link
            href={`/artist/${encodeURIComponent(artist.artist_key)}`}
            className="mt-5 font-display text-5xl leading-[0.95] font-extrabold tracking-tight break-words hover:underline"
          >
            {artist.artist}
          </Link>
          <p className="mt-3 text-lg">
            <span className="tabular font-display font-bold">{artist.plays}</span> plays {when}
          </p>
        </>
      ) : (
        <p className="py-10">Play some music and your top artist shows up here.</p>
      )}
    </Card>
  );
}

function AlbumGrid({ albums }: { albums: TopAlbum[] }) {
  if (albums.length === 0) {
    return <p className="py-6 text-sm text-muted">No album info yet. YouTube videos usually have none.</p>;
  }
  return (
    <ol className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4">
      {albums.map((a, i) => (
        <li key={`${a.artist_key}|${a.album}`} className="min-w-0">
          <div className="relative">
            <Cover src={a.image_url} name={a.album} size={120} className="aspect-square h-auto! w-full!" />
            <span
              className={`absolute -top-2 -left-2 rounded-md border-2 border-[#141414] px-1.5 font-display text-sm font-extrabold ${
                i === 0 ? "bg-coral text-on-coral" : "bg-card text-ink"
              }`}
            >
              {i + 1}
            </span>
          </div>
          <div className="mt-1.5 truncate text-sm font-medium">{a.album}</div>
          <div className="truncate text-xs text-muted">
            <ArtistLink artistKey={a.artist_key}>{a.artist}</ArtistLink>, {a.plays} plays
          </div>
        </li>
      ))}
    </ol>
  );
}

function SyncBar({ sync, now }: { sync: SyncState; now: Date }) {
  const lastRun = sync.last_run_at ? new Date(sync.last_run_at) : null;
  const stale = !lastRun || now.getTime() - lastRun.getTime() > STALE_AFTER_MS;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-sm">
        {sync.last_error ? (
          <span className="text-danger" title={sync.last_error}>
            Last sync failed: {sync.last_error}
          </span>
        ) : lastRun ? (
          <span className={stale ? "text-danger" : "text-muted"}>
            Synced {formatRelative(lastRun, now)}
            {stale && ". The hourly sync may have stopped."}
          </span>
        ) : (
          <span className="text-muted">Never synced. Press Sync now to fetch your Last.fm history.</span>
        )}
      </div>
      <SyncButton />
    </div>
  );
}

function SeeAll({
  kind,
  query,
  total,
  limit = TOP_N,
}: {
  kind: string;
  query: Record<string, string | undefined>;
  total: number;
  limit?: number;
}) {
  if (total <= limit) return null;
  return (
    <Link href={withQuery(`/top/${kind}`, query)} className="font-medium text-ink-2 hover:text-ink">
      All {total.toLocaleString("en-US")}
    </Link>
  );
}
