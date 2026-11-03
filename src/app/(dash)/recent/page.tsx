import { Suspense } from "react";
import { Pagination } from "@/components/pagination";
import { Card } from "@/components/ui";
import { RecentList } from "@/components/recent-list";
import { getBlockedValues, getRecentPlays } from "@/lib/data";
import { parsePage, type SearchParams } from "@/lib/range";

const PAGE_SIZE = 50;

export default function RecentPage({ searchParams }: PageProps<"/recent">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Recent searchParams={searchParams} />
    </Suspense>
  );
}

async function Recent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const page = parsePage(await searchParams);
  const [recent, blocked] = await Promise.all([
    getRecentPlays(PAGE_SIZE, (page - 1) * PAGE_SIZE),
    getBlockedValues(),
  ]);
  return (
    <Card
      title="Recently played"
      action={<span className="text-muted">Hidden and duplicate plays are shown greyed out</span>}
    >
      <RecentList plays={recent.rows} blocked={blocked} next={page > 1 ? `/recent?page=${page}` : "/recent"} />
      <Pagination basePath="/recent" query={{}} page={page} pageSize={PAGE_SIZE} total={recent.total} />
    </Card>
  );
}
