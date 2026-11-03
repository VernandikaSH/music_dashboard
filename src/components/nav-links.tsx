"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const NAV = [
  { href: "/", label: "Overview", match: (p: string) => p === "/" || p.startsWith("/top") || p.startsWith("/artist") || p.startsWith("/track") },
  { href: "/recent", label: "Recently played", match: (p: string) => p.startsWith("/recent") },
  { href: "/review", label: "Review", match: (p: string) => p.startsWith("/review") },
  { href: "/merge", label: "Merge", match: (p: string) => p.startsWith("/merge") },
  { href: "/blocklist", label: "Hidden & fixed", match: (p: string) => p.startsWith("/blocklist") || p.startsWith("/fix") },
];

// The pathname is URL data, which on dynamic routes is only known at request
// time, so the highlighted version streams in behind Suspense. The fallback is
// the same links without a highlight.
export function NavLinks() {
  return (
    <Suspense fallback={<Links pathname={null} />}>
      <ActiveLinks />
    </Suspense>
  );
}

function ActiveLinks() {
  return <Links pathname={usePathname()} />;
}

function Links({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {NAV.map((item) => {
        const active = pathname !== null && item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border-2 px-3 py-1 font-medium ${
              active ? "border-outline bg-card text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
