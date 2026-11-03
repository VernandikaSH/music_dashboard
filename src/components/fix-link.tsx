import Link from "next/link";
import { withQuery } from "@/lib/range";

// Opens the fix page for a track or an artist, then returns to `next`.
export function FixLink({
  kind,
  value,
  next,
  children = "Fix",
}: {
  kind: "artist" | "track";
  value: string;
  next: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={withQuery("/fix", { [kind]: value, next })}
      title={kind === "track" ? "Fix this track's artist or title" : "Rename this artist or merge it into another"}
      className="rounded-md border-2 border-hair px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted hover:border-outline hover:text-ink"
    >
      {children}
    </Link>
  );
}
