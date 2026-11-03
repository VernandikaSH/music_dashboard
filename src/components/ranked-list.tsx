import Link from "next/link";
import type { ReactNode } from "react";
import { Cover } from "./ui";

export { Card } from "./ui";

export type RankedRow = {
  key: string;
  primary: ReactNode;
  secondary?: ReactNode;
  coverName?: string; // set to show a cover (or lettered tile)
  image?: string | null;
  plays: number;
  action?: ReactNode;
};

// A printed-chart list: big rank numbers, hairline rules, plays on the right.
// Only rank 1 gets the accent color.
export function RankedList({
  rows,
  startRank = 1,
  empty = "Nothing here yet.",
}: {
  rows: RankedRow[];
  startRank?: number;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="py-6 text-sm text-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-hair">
      {rows.map((row, i) => {
        const rank = startRank + i;
        return (
          <li key={row.key} className="group flex items-center gap-3 py-2.5">
            <span
              className={`tabular w-9 shrink-0 text-right font-display text-2xl leading-none font-extrabold tracking-tight ${
                rank === 1 ? "text-cobalt" : "text-ink"
              }`}
            >
              {rank}
            </span>
            {row.coverName !== undefined && <Cover src={row.image} name={row.coverName} size={40} />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{row.primary}</div>
              {row.secondary && <div className="truncate text-sm text-muted">{row.secondary}</div>}
            </div>
            {row.action && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">{row.action}</div>
            )}
            <span className="tabular w-14 shrink-0 text-right font-display text-lg font-bold">{row.plays}</span>
          </li>
        );
      })}
    </ol>
  );
}

// trackKey is a base_track_key: the track page shows the song with all its versions.
export function TrackLink({ trackKey, children }: { trackKey: string; children: ReactNode }) {
  return (
    <Link
      href={`/track/${encodeURIComponent(trackKey)}`}
      className="underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

export function ArtistLink({ artistKey, children }: { artistKey: string; children: ReactNode }) {
  return (
    <Link
      href={`/artist/${encodeURIComponent(artistKey)}`}
      className="underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
