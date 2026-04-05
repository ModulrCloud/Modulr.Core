import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Windows dev: native file watchers can fire before CSS chunks are fully written,
   * so the browser sometimes requests a stale `/_next/static/css/app/layout.css?…`
   * and gets 404 → blank / broken UI until a manual restart.
   * Polling + aggregateTimeout reduces that race (webpack dev only; ignored by Turbopack).
   */
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer && process.platform === "win32") {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 400,
      };
    }
    return config;
  },
};

export default nextConfig;
