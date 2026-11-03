import Link from "next/link";
import { PRESETS, withQuery, type DateRange } from "@/lib/range";
import { wibDateString } from "@/lib/time";

// Presets are plain links; the custom range is a GET form, so the URL is the
// only state and every view can be bookmarked.
export function RangePicker({
  basePath,
  range,
  extra = {},
  now,
}: {
  basePath: string;
  range: DateRange;
  extra?: Record<string, string | undefined>;
  now: Date;
}) {
  const today = wibDateString(now);
  const defaultFrom = range.from ? wibDateString(range.from) : today;
  const defaultTo = wibDateString(new Date(range.to.getTime() - 1));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl border-2 border-outline bg-card p-1 text-sm">
        {PRESETS.map((p) => {
          const active = range.preset === p.key;
          return (
            <Link
              key={p.key}
              href={withQuery(basePath, extra, { range: p.key })}
              aria-current={active ? "true" : undefined}
              className={`rounded-lg px-3 py-1 font-medium ${
                active ? "bg-ink text-page" : "text-ink-2 hover:bg-card-2 hover:text-ink"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      <form
        method="get"
        action={basePath}
        className={`flex items-center gap-1.5 rounded-xl border-2 bg-card px-2 py-1 text-sm ${
          range.preset === "custom" ? "border-cobalt" : "border-outline"
        }`}
      >
        {Object.entries(extra).map(
          ([k, v]) => v !== undefined && <input key={k} type="hidden" name={k} value={v} />,
        )}
        <input
          type="date"
          name="from"
          defaultValue={defaultFrom}
          max={today}
          aria-label="From"
          className="bg-transparent text-ink-2"
        />
        <span className="text-muted">–</span>
        <input
          type="date"
          name="to"
          defaultValue={defaultTo}
          max={today}
          aria-label="To"
          className="bg-transparent text-ink-2"
        />
        <button type="submit" className="rounded-lg px-2 py-1 font-medium text-ink-2 hover:bg-card-2 hover:text-ink">
          Apply
        </button>
      </form>
    </div>
  );
}
