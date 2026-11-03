"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Bucket } from "@/lib/range";

type Point = { bucket: string; plays: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Buckets are plain WIB calendar dates ("YYYY-MM-DD"), so format them by hand
// instead of through Date, which would shift them into the viewer's time zone.
function formatBucket(ymd: string, bucket: Bucket, long = false): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const month = MONTHS[m - 1];
  if (bucket === "month") return long ? `${month} ${y}` : `${month} ’${String(y).slice(2)}`;
  const day = `${d} ${month}`;
  if (bucket === "week") return long ? `Week of ${day} ${y}` : day;
  return long ? `${day} ${y}` : day;
}

export function PlaysChart({ data, bucket }: { data: Point[]; bucket: Bucket }) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-muted">No plays in this range yet.</p>;
  }
  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--hair)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(v: string) => formatBucket(v, bucket)}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--outline)" }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "var(--card-2)" }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as Point | undefined;
                if (!active || !point) return null;
                return (
                  <div className="rounded-lg border-2 border-outline bg-card px-3 py-2 text-sm">
                    <div className="text-ink-2">{formatBucket(point.bucket, bucket, true)}</div>
                    <div className="tabular font-display font-bold text-ink">
                      {point.plays} {point.plays === 1 ? "play" : "plays"}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="plays" fill="var(--bar)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as table</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">{bucket === "week" ? "Week of" : bucket === "month" ? "Month" : "Day"}</th>
              <th className="py-1 text-right font-normal">Plays</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.bucket} className="border-t border-hair">
                <td className="py-1">{formatBucket(p.bucket, bucket, true)}</td>
                <td className="tabular py-1 text-right">{p.plays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
