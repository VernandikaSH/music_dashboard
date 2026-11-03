import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BlockButton } from "@/components/block-button";
import { FixLink } from "@/components/fix-link";
import { PlaysChart } from "@/components/plays-chart";
import { RangePicker } from "@/components/range-picker";
import { RankedList, TrackLink } from "@/components/ranked-list";
import { Card, Cover, EstTimeStat, Stat } from "@/components/ui";
import { getArtistSummary, getBlockedValues, getPlaysOverTime, getTopTracks } from "@/lib/data";
import { parseBucket, parseRange, safeDecode, type SearchParams } from "@/lib/range";
import { formatDate } from "@/lib/time";

export default function ArtistPage({ params, searchParams }: PageProps<"/artist/[key]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Artist params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Artist({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const artistKey = safeDecode(key);
  await connection();
  const now = new Date();
  // The artist page defaults to all time; the range picker narrows it.
  const range = parseRange(sp.range || sp.from ? sp : { ...sp, range: "all" }, now);
  const bucket = parseBucket(sp, range);
  const basePath = `/artist/${encodeURIComponent(artistKey)}`;

  const [summary, tracks, series, blocked] = await Promise.all([
    getArtistSummary(artistKey),
    getTopTracks(range, 100, 0, { artistKey }),
    getPlaysOverTime(range, bucket, { artistKey }),
    getBlockedValues(),
  ]);
  const isBlocked = blocked.has(`artist:${artistKey}`);
  if (!summary && !isBlocked) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-end gap-6">
        <Cover src={tracks.rows[0]?.image_url} name={summary?.artist ?? artistKey} size={140} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-tight break-words">
            {summary?.artist ?? artistKey}
          </h1>
          {summary ? (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
              <Stat label="plays" value={summary.plays} />
              <Stat label="tracks" value={summary.tracks} />
              <EstTimeStat seconds={summary.est_seconds} guessedSeconds={summary.guessed_seconds} showGuessed />
              <div>
                <dd className="font-display text-xl font-bold">{formatDate(summary.first_played)}</dd>
                <dt className="text-sm text-muted">first played</dt>
              </div>
              <div>
                <dd className="font-display text-xl font-bold">{formatDate(summary.last_played)}</dd>
                <dt className="text-sm text-muted">last played</dt>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-ink-2">This artist is hidden from all charts.</p>
          )}
        </div>
        <div className="flex gap-1 self-start">
          {summary && (
            <FixLink kind="artist" value={artistKey} next="/">
              Rename or merge
            </FixLink>
          )}
          <BlockButton kind="artist" value={artistKey} label={summary?.artist ?? artistKey} blocked={isBlocked} />
        </div>
      </Card>

      <RangePicker basePath={basePath} range={range} now={now} />

      <Card title={`Plays over time, ${range.label.toLowerCase()}`}>
        <PlaysChart data={series} bucket={bucket} />
      </Card>

      <Card title={`Top tracks, ${range.label.toLowerCase()}`}>
        <RankedList
          rows={tracks.rows.map((t) => ({
            key: t.track_key,
            primary: <TrackLink trackKey={t.base_track_key}>{t.title}</TrackLink>,
            coverName: t.title,
            image: t.image_url,
            plays: t.plays,
            action: (
              <>
                <FixLink kind="track" value={t.track_key} next={basePath} />
                <BlockButton kind="track" value={t.track_key} label={`${t.artist} – ${t.title}`} blocked={false} />
              </>
            ),
          }))}
        />
      </Card>
    </div>
  );
}
