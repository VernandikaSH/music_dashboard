import Link from "next/link";
import { withQuery } from "@/lib/range";

export function Pagination({
  basePath,
  query,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const link = (p: number) => withQuery(basePath, query, { page: p > 1 ? String(p) : undefined });
  const cls = "rounded-lg border-2 border-outline bg-card px-3 py-1.5 font-medium hover:bg-card-2";
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? <Link href={link(page - 1)} className={cls}>Previous</Link> : <span />}
      <span className="tabular text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? <Link href={link(page + 1)} className={cls}>Next</Link> : <span />}
    </nav>
  );
}
