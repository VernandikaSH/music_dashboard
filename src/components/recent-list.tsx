import type { RecentPlay } from "@/lib/data";
import { formatDateTime } from "@/lib/time";
import { BlockButton } from "./block-button";
import { FixLink } from "./fix-link";
import { ArtistLink } from "./ranked-list";
import { Cover, Sticker } from "./ui";

// Shows every play, including hidden ones, so junk is easy to spot and fix.
export function RecentList({
  plays,
  blocked,
  next,
}: {
  plays: RecentPlay[];
  blocked: Set<string>;
  next: string;
}) {
  if (plays.length === 0) {
    return <p className="py-6 text-sm text-muted">No plays yet. Play a song, then press Sync now.</p>;
  }
  return (
    <ul className="divide-y divide-hair">
      {plays.map((p) => {
        const artistBlocked = blocked.has(`artist:${p.artist_key}`);
        const trackBlocked = blocked.has(`track:${p.track_key}`);
        const dimmed = p.is_blocked || p.is_duplicate;
        const fixed = p.artist_clean !== p.artist_raw || p.title_clean !== p.title_raw;
        return (
          <li key={p.id} className="group flex items-center gap-3 py-2.5">
            <div className={`flex min-w-0 flex-1 items-center gap-3 ${dimmed ? "opacity-40" : ""}`}>
              <Cover src={p.image_url} name={p.title_clean} size={40} />
              <div className="min-w-0">
                <div className="truncate font-medium">{p.title_clean}</div>
                <div className="truncate text-sm text-muted">
                  <ArtistLink artistKey={p.artist_key}>{p.artist_clean}</ArtistLink>
                  {fixed && (
                    <span title="Fixed by hand. This is what Last.fm received.">
                      {", "}fixed from {p.artist_raw} – {p.title_raw}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {p.is_blocked && <Sticker tone="plain" tilt={-3}>Hidden</Sticker>}
            {p.is_duplicate && <Sticker tone="plain" tilt={3}>Duplicate</Sticker>}
            <div
              className={`flex gap-1 ${
                artistBlocked || trackBlocked ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
              }`}
            >
              {!artistBlocked && !trackBlocked && <FixLink kind="track" value={p.track_key} next={next} />}
              {!artistBlocked && (
                <BlockButton
                  kind="track"
                  value={p.track_key}
                  label={`${p.artist_clean} – ${p.title_clean}`}
                  blocked={trackBlocked}
                />
              )}
              <BlockButton kind="artist" value={p.artist_key} label={p.artist_clean} blocked={artistBlocked} />
            </div>
            <time dateTime={p.played_at} className="tabular w-36 shrink-0 text-right text-sm text-muted">
              {formatDateTime(p.played_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
