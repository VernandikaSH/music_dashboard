import { wibDateString, wibDayStart } from "./time";

export const PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "3m", label: "3 months", months: 3 },
  { key: "6m", label: "6 months", months: 6 },
  { key: "12m", label: "12 months", months: 12 },
  { key: "all", label: "All time" },
] as const;

export type PresetKey = (typeof PRESETS)[number]["key"];
export type Bucket = "day" | "week" | "month";
export const BUCKETS: Bucket[] = ["day", "week", "month"];

export type DateRange = {
  from: Date | null; // null = all time
  to: Date; // exclusive
  preset: PresetKey | "custom";
  label: string;
  // Query-string fields that reproduce this range, for links.
  query: Record<string, string>;
};

export type SearchParams = Record<string, string | string[] | undefined>;

function param(sp: SearchParams, name: string): string | undefined {
  const v = sp[name];
  return Array.isArray(v) ? v[0] : v;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseRange(sp: SearchParams, now: Date): DateRange {
  const fromParam = param(sp, "from");
  const toParam = param(sp, "to");

  if (fromParam && toParam && YMD.test(fromParam) && YMD.test(toParam) && fromParam <= toParam) {
    const to = wibDayStart(toParam);
    to.setUTCDate(to.getUTCDate() + 1); // include the whole "to" day
    return {
      from: wibDayStart(fromParam),
      to,
      preset: "custom",
      label: `${fromParam} – ${toParam}`,
      query: { from: fromParam, to: toParam },
    };
  }

  const preset = PRESETS.find((p) => p.key === param(sp, "range")) ?? PRESETS[1];
  // Presets end now and start at the beginning of a WIB day, so "7 days"
  // means today plus the six days before it.
  const today = wibDayStart(wibDateString(now));
  let from: Date | null = null;
  if ("days" in preset) {
    from = new Date(today);
    from.setUTCDate(from.getUTCDate() - (preset.days - 1));
  } else if ("months" in preset) {
    from = new Date(today);
    from.setUTCMonth(from.getUTCMonth() - preset.months);
  }
  return {
    from,
    to: new Date(now.getTime() + 60_000),
    preset: preset.key,
    label: preset.label,
    query: { range: preset.key },
  };
}

export function parseBucket(sp: SearchParams, range: DateRange): Bucket {
  const b = param(sp, "bucket");
  if (b === "day" || b === "week" || b === "month") return b;
  if (!range.from) return "month";
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  if (days <= 92) return "day";
  if (days <= 370) return "week";
  return "month";
}

export function parsePage(sp: SearchParams): number {
  const n = Number(param(sp, "page"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function withQuery(path: string, ...parts: Record<string, string | undefined>[]): string {
  const qs = new URLSearchParams();
  for (const part of parts) {
    for (const [k, v] of Object.entries(part)) if (v !== undefined) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

// "?remixes=merge" counts remixes and sped up / slowed edits as the original.
export function parseMergeRemixes(sp: SearchParams): boolean {
  return param(sp, "remixes") === "merge";
}

export function remixQuery(merge: boolean): Record<string, string | undefined> {
  return { remixes: merge ? "merge" : undefined };
}

// Hangul and other non-ASCII keys may arrive still percent-encoded; a raw "%"
// in a name must not crash the page.
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
