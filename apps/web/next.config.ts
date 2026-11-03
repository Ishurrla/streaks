import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The shared server logic is a workspace package shipped as TypeScript source.
  transpilePackages: ["@streaks/core"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Turbopack's on-disk cache (on by default) kept serving an old globals.css after it
    // changed, both in `pnpm dev` across restarts and in Vercel builds, so new styles never
    // appeared. Without it every run compiles the CSS from source.
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
