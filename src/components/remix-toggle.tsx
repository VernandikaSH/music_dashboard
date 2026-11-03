import Link from "next/link";
import { remixQuery, withQuery } from "@/lib/range";

// Remixes and sped up / slowed edits are separate entries by default; this
// switches the URL to count them as the original song.
export function RemixToggle({
  basePath,
  query,
  merged,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  merged: boolean;
}) {
  const options = [
    { merge: false, label: "Remixes separate" },
    { merge: true, label: "Merged" },
  ];
  return (
    <div className="flex gap-1" title="Count remixes and sped up / slowed edits as the original song">
      {options.map((o) => (
        <Link
          key={o.label}
          href={withQuery(basePath, query, remixQuery(o.merge))}
          aria-current={o.merge === merged ? "true" : undefined}
          className={`rounded-lg border-2 px-2 py-0.5 font-medium whitespace-nowrap ${
            o.merge === merged ? "border-outline bg-card-2 text-ink" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
