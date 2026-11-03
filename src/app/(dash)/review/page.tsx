import { connection } from "next/server";
import { Suspense } from "react";
import { keepTrack, unkeepTrack } from "@/app/actions";
import { BlockButton } from "@/components/block-button";
import { Pagination } from "@/components/pagination";
import { ArtistLink } from "@/components/ranked-list";
import { Card } from "@/components/ui";
import { getKeptTracks, getReviewQueue } from "@/lib/data";
import { parsePage, type SearchParams } from "@/lib/range";
import { formatDate } from "@/lib/time";

const PAGE_SIZE = 50;

export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Review searchParams={searchParams} />
    </Suspense>
  );
}

const smallBtn = "rounded-md border-2 border-cobalt px-2 py-0.5 text-xs font-medium text-cobalt hover:bg-cobalt-soft";

async function Review({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await connection();
  const page = parsePage(sp);
  const [queue, kept] = await Promise.all([getReviewQueue(PAGE_SIZE, (page - 1) * PAGE_SIZE), getKeptTracks()]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Maybe not music"
        action={<span className="text-muted">Still counted in charts until you hide them</span>}
      >
        {queue.total === 0 ? (
          <p className="py-6 text-sm text-muted">
            Nothing to review. Teasers, reactions, and songs that neither Last.fm nor MusicBrainz knows show up here.
          </p>
        ) : (
          <ul className="divide-y divide-hair">
            {queue.rows.map((t) => {
              const label = `${t.artist} – ${t.title}`;
              return (
                <li key={t.track_key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium">{t.title}</span>
                      <span className="text-ink-2">
                        {" "}
                        by <ArtistLink artistKey={t.artist_key}>{t.artist}</ArtistLink>
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {t.by_title ? "Title looks like a teaser, reaction, or behind-the-scenes" : "Not found on Last.fm or MusicBrainz"}
                      {" · "}
                      {t.raw_name}
                    </p>
                  </div>
                  <span className="tabular text-xs text-muted">
                    {t.plays} {t.plays === 1 ? "play" : "plays"}, last {formatDate(t.last_played)}
                  </span>
                  <form action={keepTrack}>
                    <input type="hidden" name="key" value={t.track_key} />
                    <input type="hidden" name="label" value={label} />
                    <button type="submit" className={smallBtn} title="It's music: keep it and stop flagging it">
                      Keep
                    </button>
                  </form>
                  <BlockButton kind="track" value={t.track_key} label={label} blocked={false} />
                </li>
              );
            })}
          </ul>
        )}
        <Pagination basePath="/review" query={{}} page={page} pageSize={PAGE_SIZE} total={queue.total} />
      </Card>

      {kept.length > 0 && (
        <Card title="Kept as music">
          <ul className="divide-y divide-hair">
            {kept.map((k) => (
              <li key={k.track_key} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{k.label}</span>
                <span className="text-xs text-muted">{formatDate(k.created_at)}</span>
                <form action={unkeepTrack}>
                  <input type="hidden" name="key" value={k.track_key} />
                  <button type="submit" className={smallBtn} title="Put it back in the review list">
                    Undo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
