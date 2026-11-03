import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BlockButton } from "@/components/block-button";
import { FixLink } from "@/components/fix-link";
import { PlaysChart } from "@/components/plays-chart";
import { RangePicker } from "@/components/range-picker";
import { ArtistLink } from "@/components/ranked-list";
import { Card, Cover, EstTimeStat, Stat } from "@/components/ui";
import type { VersionType } from "@/lib/cleanup";
import { getBlockedValues, getPlaysOverTime, getTrackSummary, getTrackVersions, type TrackVersion } from "@/lib/data";
import { parseBucket, parseRange, safeDecode, type SearchParams } from "@/lib/range";
import { formatDate, formatDuration } from "@/lib/time";

const VERSION_LABEL: Record<VersionType, string> = {
  official_audio: "Official audio",
  official_video: "Music video",
  lyric: "Lyric / translation",
  live: "Live / performance",
  cover: "Cover",
  remix: "Remix / edit",
  unknown: "Other uploads",
};

export default function TrackPage({ params, searchParams }: PageProps<"/track/[key]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Track params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// One song with all its versions: official audio, MV, lyric videos, live,
// and its remixes and edits. The key is a base_track_key.
async function Track({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const trackKey = safeDecode(key);
  await connection();
  const now = new Date();
  // Like the artist page: all time by default, the range picker narrows it.
  const range = parseRange(sp.range || sp.from ? sp : { ...sp, range: "all" }, now);
  const bucket = parseBucket(sp, range);
  const basePath = `/track/${encodeURIComponent(trackKey)}`;

  const [summary, versions, series, blocked] = await Promise.all([
    getTrackSummary(trackKey),
    getTrackVersions(trackKey, range),
    getPlaysOverTime(range, bucket, { trackKey }),
    getBlockedValues(),
  ]);
  const isBlocked = blocked.has(`track:${trackKey}`);
  if (!summary && !isBlocked) notFound();
  const name = summary ? `${summary.artist} – ${summary.title}` : trackKey;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-end gap-6">
        <Cover src={summary?.image_url} name={summary?.title ?? trackKey} size={140} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-tight break-words">
            {summary?.title ?? trackKey}
          </h1>
          {summary ? (
            <>
              <p className="mt-2 text-lg text-ink-2">
                <ArtistLink artistKey={summary.artist_key}>{summary.artist}</ArtistLink>
                {summary.album && <span className="text-muted">, from {summary.album}</span>}
                {summary.duration_s !== null && (
                  <span className="tabular text-muted">, {formatDuration(summary.duration_s)}</span>
                )}
              </p>
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
                <Stat label="plays" value={summary.plays} />
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
            </>
          ) : (
            <p className="mt-2 text-ink-2">This track is hidden from all charts.</p>
          )}
        </div>
        <div className="flex gap-1 self-start">
          {summary && <FixLink kind="track" value={trackKey} next={basePath} />}
          <BlockButton kind="track" value={trackKey} label={name} blocked={isBlocked} />
        </div>
      </Card>

      <RangePicker basePath={basePath} range={range} now={now} />

      <Card title={`Plays over time, ${range.label.toLowerCase()}`}>
        <PlaysChart data={series} bucket={bucket} />
      </Card>

      <Card
        title={`Versions, ${range.label.toLowerCase()}`}
        action={<span className="text-muted">Remixes and edits count separately unless merged</span>}
      >
        <VersionList versions={versions} trackKey={trackKey} next={basePath} blocked={blocked} />
      </Card>
    </div>
  );
}

function VersionList({
  versions,
  trackKey,
  next,
  blocked,
}: {
  versions: TrackVersion[];
  trackKey: string;
  next: string;
  blocked: Set<string>;
}) {
  if (versions.length === 0) return <p className="py-6 text-sm text-muted">No plays in this range.</p>;
  const total = versions.reduce((n, v) => n + Number(v.plays), 0);
  return (
    <ul className="divide-y divide-hair">
      {versions.map((v) => {
        const other = v.track_key !== trackKey; // a remix or edit with its own entry
        const share = Math.round((Number(v.plays) / total) * 100);
        return (
          <li key={`${v.track_key}|${v.version_type}`} className="group flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {VERSION_LABEL[v.version_type]}
                {other && <span className="text-ink-2">: {v.title}</span>}
              </div>
              <div className="truncate text-sm text-muted" title="The most common name Last.fm received">
                {v.example}
              </div>
            </div>
            {other && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <FixLink kind="track" value={v.track_key} next={next} />
                <BlockButton
                  kind="track"
                  value={v.track_key}
                  label={v.example}
                  blocked={blocked.has(`track:${v.track_key}`)}
                />
              </div>
            )}
            <span className="tabular w-12 shrink-0 text-right text-sm text-muted">{share}%</span>
            <span className="tabular w-14 shrink-0 text-right font-display text-lg font-bold">{v.plays}</span>
          </li>
        );
      })}
    </ul>
  );
}
