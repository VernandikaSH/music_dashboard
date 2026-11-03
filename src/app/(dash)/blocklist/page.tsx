import { connection } from "next/server";
import { Suspense } from "react";
import { removeAlias } from "@/app/actions";
import { BlockButton } from "@/components/block-button";
import { Card } from "@/components/ui";
import { getAliases, getBlocklist } from "@/lib/data";
import { formatDate } from "@/lib/time";

export default function BlocklistPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Blocklist />
    </Suspense>
  );
}

const KIND_LABEL = { artist: "Artist", track: "Track", channel: "Channel" } as const;

async function Blocklist() {
  await connection();
  const [entries, aliases] = await Promise.all([getBlocklist(), getAliases()]);
  return (
    <div className="flex flex-col gap-5">
      <Card title="Hidden" action={<span className="text-muted">Hidden from all charts; plays stay saved</span>}>
        {entries.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            Nothing hidden. Use “Hide” on a play or a chart row to hide non-music videos.
          </p>
        ) : (
          <ul className="divide-y divide-hair">
            {entries.map((e) => (
              <li key={`${e.kind}:${e.value}`} className="flex items-center gap-3 py-2">
                <span className="w-16 shrink-0 text-xs text-muted">{KIND_LABEL[e.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{e.label}</span>
                <span className="text-xs text-muted">{formatDate(e.created_at)}</span>
                <BlockButton kind={e.kind} value={e.value} label={e.label} blocked />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Fixed by hand" action={<span className="text-muted">Applied to past and future plays</span>}>
        {aliases.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            No fixes yet. Use “Fix” on a track or artist when the name is wrong, e.g. a label channel like Genie Music.
          </p>
        ) : (
          <ul className="divide-y divide-hair">
            {aliases.map((a) => (
              <li key={`${a.kind}:${a.from_key}`} className="flex items-center gap-3 py-2">
                <span className="w-16 shrink-0 text-xs text-muted">{KIND_LABEL[a.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-ink-2">{a.from_key.replace("|", " – ")}</span>
                  <span className="text-muted"> → </span>
                  {a.kind === "track" ? `${a.to_artist} – ${a.to_title}` : a.to_artist}
                </span>
                <span className="text-xs text-muted">{formatDate(a.created_at)}</span>
                <form action={removeAlias}>
                  <input type="hidden" name="kind" value={a.kind} />
                  <input type="hidden" name="from_key" value={a.from_key} />
                  <button
                    type="submit"
                    className="rounded-md border-2 border-cobalt px-2 py-0.5 text-xs font-medium text-cobalt hover:bg-cobalt-soft"
                    title="Remove this fix and go back to the name Last.fm sent"
                  >
                    Undo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
