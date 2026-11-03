import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Covers come straight from Last.fm, iTunes, and Deezer; skipping Vercel's optimizer keeps
  // the free plan's image quota untouched.
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "lastfm.freetls.fastly.net" },
      { protocol: "https", hostname: "*.mzstatic.com" }, // iTunes covers
      { protocol: "https", hostname: "*.dzcdn.net" }, // Deezer artist photos
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
