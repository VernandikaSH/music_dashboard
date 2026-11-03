import Link from "next/link";
import { Suspense } from "react";
import { fixArtist, fixTrack } from "@/app/actions";
import { Card } from "@/components/ui";
import { getArtistNames, getFixTarget } from "@/lib/data";
import type { SearchParams } from "@/lib/range";

export default function FixPage({ searchParams }: PageProps<"/fix">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Fix searchParams={searchParams} />
    </Suspense>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const inputCls = "rounded-lg border-2 border-outline bg-page px-3 py-2 text-sm outline-none focus:border-cobalt";

async function Fix({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const trackKey = first(sp.track);
  const artistKey = first(sp.artist);
  const nextParam = first(sp.next) ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const kind = trackKey ? "track" : artistKey ? "artist" : null;
  const key = trackKey ?? artistKey;
  if (!kind || !key) return <p className="text-sm text-muted">Nothing to fix.</p>;

  const [target, artistNames] = await Promise.all([getFixTarget(kind, key), getArtistNames()]);
  if (!target) return <p className="text-sm text-muted">No plays found for this {kind}.</p>;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Card title={kind === "track" ? "Fix track" : "Rename or merge artist"}>
        <p className="text-sm">
          {kind === "track" ? (
            <>
              <span className="font-medium">{target.title}</span>
              <span className="text-ink-2"> by {target.artist}</span>
            </>
          ) : (
            <span className="font-medium">{target.artist}</span>
          )}
          <span className="tabular text-muted">, {target.plays} plays</span>
        </p>
        <div className="mt-2 text-xs text-ink-2">
          Received from Last.fm as:
          <ul className="mt-1 list-disc pl-5 text-muted">
            {target.rawNames.slice(0, 8).map((n) => (
              <li key={n}>{n}</li>
            ))}
            {target.rawNames.length > 8 && <li>and {target.rawNames.length - 8} more</li>}
          </ul>
        </div>

        <form action={kind === "track" ? fixTrack : fixArtist} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="next" value={next} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-2">Artist</span>
            <input
              name="artist"
              required
              defaultValue={target.artist}
              list="artist-names"
              autoComplete="off"
              className={inputCls}
            />
          </label>
          {kind === "track" && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink-2">Title</span>
              <input name="title" required defaultValue={target.title ?? ""} autoComplete="off" className={inputCls} />
            </label>
          )}
          <datalist id="artist-names">
            {artistNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <p className="text-xs text-muted">
            {kind === "artist"
              ? "Type another artist's exact name to merge into them. Applies to past and future plays."
              : "Applies to past and future plays of this track. Pick an existing artist name to merge."}{" "}
            The original data is kept, and you can undo this on the Hidden & fixed page.
          </p>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg border-2 border-outline bg-cobalt px-4 py-2 font-display font-bold text-on-cobalt">
              Save
            </button>
            <Link href={next} className="text-sm text-ink-2 hover:text-ink">
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
