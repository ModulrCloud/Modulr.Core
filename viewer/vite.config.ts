import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  /** Dev-only self-signed TLS (browser may prompt once). Aligns with Core `https://` + mixed-content rules. */
  plugins: [basicSsl(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    /** Listen on all interfaces so the terminal prints `Network: https://<LAN-ip>:3000` for other devices. */
    host: true,
    port: 3000,
    strictPort: false,
  },
});
