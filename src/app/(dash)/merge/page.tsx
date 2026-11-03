import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { dismissMerge, fixArtist, fixTrack } from "@/app/actions";
import { Card } from "@/components/ui";
import {
  getFixTarget,
  getMergeSuggestions,
  searchEntries,
  type MergeKind,
  type MergeSuggestion,
  type SearchEntry,
} from "@/lib/data";
import { withQuery, type SearchParams } from "@/lib/range";

// A merge is a manual fix (fix_track / fix_artist): the first entry's plays
// take the second one's name, for past and future plays. Undo is on the
// Hidden & fixed page.

export default function MergePage({ searchParams }: PageProps<"/merge">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Merge searchParams={searchParams} />
    </Suspense>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const inputCls = "rounded-lg border-2 border-outline bg-page px-3 py-2 text-sm outline-none focus:border-cobalt";
const mergeBtn =
  "rounded-md border-2 border-cobalt px-2 py-0.5 text-xs font-medium whitespace-nowrap text-cobalt hover:bg-cobalt-soft";
const quietBtn =
  "rounded-md border-2 border-hair px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted hover:border-outline hover:text-ink";

function entryName(artist: string, title: string | null): string {
  return title === null ? artist : `${artist} – ${title}`;
}

async function Merge({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const kind: MergeKind = first(sp.kind) === "artist" ? "artist" : "track";
  const q = first(sp.q)?.trim() ?? "";
  const from = first(sp.from) || undefined;
  const kindQuery = { kind: kind === "artist" ? "artist" : undefined };
  const here = withQuery("/merge", kindQuery);

  const [suggestions, results, fromTarget] = await Promise.all([
    getMergeSuggestions(30),
    q ? searchEntries(kind, q, 30) : Promise.resolve([]),
    from ? getFixTarget(kind, from) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Suggested merges"
        action={<span className="text-muted">Same name apart from spacing, or a label channel’s upload</span>}
      >
        {suggestions.length === 0 ? (
          <p className="py-6 text-sm text-muted">No suggestions right now.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {suggestions.map((s) => (
              <SuggestionRow key={`${s.kind}:${s.from_key}:${s.to_key}`} s={s} />
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Merge two entries"
        action={
          <div className="flex gap-1">
            {(["track", "artist"] as const).map((k) => (
              <Link
                key={k}
                href={withQuery("/merge", { kind: k === "artist" ? "artist" : undefined })}
                aria-current={k === kind ? "true" : undefined}
                className={`rounded-lg border-2 px-2 py-0.5 font-medium ${
                  k === kind ? "border-outline bg-card-2 text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {k === "track" ? "Tracks" : "Artists"}
              </Link>
            ))}
          </div>
        }
      >
        {from && fromTarget ? (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 border-cobalt bg-cobalt-soft px-3 py-2 text-sm">
            <span>
              Merging <span className="font-medium">{entryName(fromTarget.artist, fromTarget.title)}</span>
              <span className="tabular text-muted"> ({fromTarget.plays} plays)</span>. Now pick what it should
              become.
            </span>
            <Link href={withQuery("/merge", kindQuery, { q: q || undefined })} className="text-ink-2 hover:text-ink">
              Cancel
            </Link>
          </div>
        ) : (
          <p className="mb-4 text-sm text-ink-2">
            Search for the wrong entry, pick it, then pick the one it should become. Searches names as shown and as
            received from Last.fm.
          </p>
        )}

        <form method="get" action="/merge" className="flex gap-2">
          {kind === "artist" && <input type="hidden" name="kind" value="artist" />}
          {from && fromTarget && <input type="hidden" name="from" value={from} />}
          <input
            name="q"
            defaultValue={q}
            placeholder={kind === "track" ? "Artist or title" : "Artist name"}
            aria-label="Search"
            autoComplete="off"
            className={`${inputCls} min-w-0 flex-1`}
          />
          <button type="submit" className="rounded-lg border-2 border-outline bg-card px-4 py-2 text-sm font-medium hover:bg-card-2">
            Search
          </button>
        </form>

        {q && (
          <ResultList
            results={results.filter((r) => r.key !== from)}
            kind={kind}
            from={fromTarget ? from : undefined}
            q={q}
            next={here}
          />
        )}
      </Card>
    </div>
  );
}

function SuggestionRow({ s }: { s: MergeSuggestion }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <span className="w-12 shrink-0 text-xs text-muted">{s.kind === "artist" ? "Artist" : "Track"}</span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="text-ink-2">{entryName(s.from_artist, s.from_title)}</span>
        <span className="tabular text-muted"> ({s.from_plays})</span>
        <span className="text-muted"> → </span>
        <span className="font-medium">{entryName(s.to_artist, s.to_title)}</span>
        <span className="tabular text-muted"> ({s.to_plays})</span>
      </span>
      <div className="flex gap-1">
        <MergeForm kind={s.kind} fromKey={s.from_key} artist={s.to_artist} title={s.to_title} next="/merge" />
        <form action={dismissMerge}>
          <input type="hidden" name="kind" value={s.kind} />
          <input type="hidden" name="from_key" value={s.from_key} />
          <input type="hidden" name="to_key" value={s.to_key} />
          <button type="submit" className={quietBtn} title="Stop suggesting this merge">
            Not the same
          </button>
        </form>
      </div>
    </li>
  );
}

// One click: saves the fix that gives fromKey's plays this name.
function MergeForm({
  kind,
  fromKey,
  artist,
  title,
  next,
  label = "Merge",
}: {
  kind: MergeKind;
  fromKey: string;
  artist: string;
  title: string | null;
  next: string;
  label?: string;
}) {
  return (
    <form action={kind === "track" ? fixTrack : fixArtist}>
      <input type="hidden" name="key" value={fromKey} />
      <input type="hidden" name="artist" value={artist} />
      {kind === "track" && <input type="hidden" name="title" value={title ?? ""} />}
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={mergeBtn}>
        {label}
      </button>
    </form>
  );
}

function ResultList({
  results,
  kind,
  from,
  q,
  next,
}: {
  results: SearchEntry[];
  kind: MergeKind;
  from: string | undefined;
  q: string;
  next: string;
}) {
  if (results.length === 0) return <p className="pt-4 text-sm text-muted">Nothing matches “{q}”.</p>;
  return (
    <ul className="mt-3 divide-y divide-hair">
      {results.map((r) => (
        <li key={r.key} className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm">{entryName(r.artist, r.title)}</span>
          <span className="tabular text-sm text-muted">{r.plays} plays</span>
          {from ? (
            <MergeForm kind={kind} fromKey={from} artist={r.artist} title={r.title} next={next} label="Merge into this" />
          ) : (
            <Link
              href={withQuery("/merge", { kind: kind === "artist" ? "artist" : undefined, q, from: r.key })}
              className={quietBtn}
            >
              Merge this…
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
