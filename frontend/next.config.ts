import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Windows dev: `npm run dev` defaults to **Turbopack** (`--turbo`) to avoid a webpack
   * race where `/_next/static/css/app/layout.css` 404s and Fast Refresh retries in a loop.
   *
   * Use `npm run dev:webpack` only if you need the webpack dev server; then these apply:
   * - Poll + `aggregateTimeout` batch rapid saves so fewer half-written CSS chunk swaps.
   * - Ignore `.next` in the watcher so compiler output does not re-trigger builds.
   * - Optional: `$env:NEXT_WEBPACK_POLL_MS="5000"` (PowerShell) if 404s persist (AV / slow disk).
   */
  webpack: (config, { dev }) => {
    if (dev && process.platform === "win32") {
      const pollMs = Number.parseInt(process.env.NEXT_WEBPACK_POLL_MS ?? "4000", 10);
      const wo = { ...(config.watchOptions ?? {}) };
      const dotNext = "**/.next/**";
      if (wo.ignored === undefined) {
        wo.ignored = [dotNext];
      } else if (Array.isArray(wo.ignored)) {
        wo.ignored = wo.ignored.includes(dotNext) ? wo.ignored : [...wo.ignored, dotNext];
      } else {
        wo.ignored = [wo.ignored, dotNext];
      }
      config.watchOptions = {
        ...wo,
        poll: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 4000,
        aggregateTimeout: 3000,
      };
    }
    return config;
  },
};

export default nextConfig;
