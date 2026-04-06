import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Windows dev: native file watchers can fire before CSS chunks are fully written,
   * so the browser sometimes requests a stale `/_next/static/css/app/layout.css?…`
   * and gets 404 → blank / broken UI until a manual restart.
   *
   * Mitigations (webpack dev only; Turbopack ignores `webpack`):
   * - Poll both client and server compilers (CSS extraction can touch either path).
   * - Higher `aggregateTimeout` batches rapid saves so fewer half-written chunk swaps.
   * - Optional: `set NEXT_WEBPACK_POLL_MS=2000` if AV still wins the race.
   */
  webpack: (config, { dev }) => {
    if (dev && process.platform === "win32") {
      const pollMs = Number.parseInt(process.env.NEXT_WEBPACK_POLL_MS ?? "1000", 10);
      config.watchOptions = {
        ...config.watchOptions,
        poll: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 1000,
        aggregateTimeout: 900,
      };
    }
    return config;
  },
};

export default nextConfig;
