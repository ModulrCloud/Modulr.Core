# Modulr customer UI (stage 1)

Next.js shell: glass layout, **`#ffb700`** accent, dark default background **`#10131A`**, animated background presets (fireflies), **dark/light switch** (dark first), and settings (Core URLs). Optional logo: add **`public/modulr-logo.svg`** (see `public/branding/README.md`). Full roadmap: `plan/customer_web_interface.md`.

With Core running over **HTTPS** (e.g. `modulr-core --config dev.toml --ssl-keyfile … --ssl-certfile …` on port **8000**; see root **`README.md`** → *Local TLS*), the header loads **`GET /version`** for the live `v…` label. **Methods** wires **`get_protocol_version`**, **`get_protocol_methods`**, **`lookup_module`**, **`get_module_methods`**, route helpers, and related ops to the real **`POST /message`** path (canonical JSON + Ed25519, same rules as the dev playground). Core **`dev_mode`** enables CORS for **`http://` and `https://`** on **`localhost:3000`** and **`127.0.0.1:3000`**. If you use Next’s **Network** URL (LAN IP, e.g. `10.0.0.53:3000`), set **`MODULR_CORE_CORS_EXTRA_ORIGINS`** to that origin (see root **`README.md`**). Full override: **`MODULR_CORE_CORS_ORIGINS`**.

## Develop

```bash
cd frontend
npm install
npm run dev
```

**`npm run dev`** uses **`--experimental-https`** and **`--hostname 0.0.0.0`**, so the terminal prints a **Network** URL for other devices on your LAN (HTTPS). Open [https://localhost:3000](https://localhost:3000) locally and accept the certificate prompt once. Default Core URL in Settings is **`https://127.0.0.1:8000`**. Settings persist in `localStorage` under `modulr.customer-ui.settings`.

### Windows: blank page, `layout.css` 404, Fast Refresh loop

The dev server may briefly reference a CSS chunk before webpack finishes writing it, which shows as **`layout.css` … 404** and can leave the page blank while HMR retries. **`npm run dev`** keeps the **`.next`** cache between runs so rebuilds are steadier. If things get stuck: stop the server, run **`npm run dev:clean`** (or delete **`frontend/.next`** manually), then **`npm run dev`** again. If it still happens often, raise polling: **`$env:NEXT_WEBPACK_POLL_MS="5000"`** (PowerShell) before **`npm run dev`**.

## Typography

Fonts load from **Google Fonts** via `next/font/google`:

- **Quantico** (400 / 700) — titles, headlines, key labels (class `font-modulr-display`).
- **Inter** — body, descriptions, form copy (default `body` / Tailwind `font-sans`).

## Development: red “N” badge and error overlay

When you run **`npm run dev`**, Next.js shows a small **N** (Next.js logo) in the corner, e.g. **“1 Issue”**. That is the **built-in development error indicator**: it reopens the runtime error overlay when something throws in the browser. It **does not appear** in production (`npm run build` + `npm start`).

If you see **`Error: [object Event]`**, try a hard refresh; if it persists, stop the dev server, delete the **`frontend/.next`** folder, and run `npm run dev` again. The header logo is an **inline SVG** (`components/brand/ModulrSymbol.tsx`); **`public/modulr-logo.svg`** stays available for reuse elsewhere.

## Production build

```bash
npm run build
npm start
```

This app is intended to move to a dedicated repository later; living under `frontend/` keeps it separate from the Python package.
