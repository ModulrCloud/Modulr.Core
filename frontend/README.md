# Modulr customer UI (stage 1)

Next.js shell: glass layout, **`#ffb700`** accent, dark default background **`#10131A`**, animated background presets (fireflies), **dark/light switch** (dark first), and settings (Core URLs). Optional logo: add **`public/modulr-logo.svg`** (see `public/branding/README.md`). Full roadmap: `plan/customer_web_interface.md`.

With Core running (e.g. `modulr-core --config dev.toml` on port **8000**), the header loads **`GET /version`** for the live `v…` label. **Methods** wires **`get_protocol_version`**, **`get_protocol_methods`**, **`lookup_module`**, **`get_module_methods`**, route helpers, and related ops to the real **`POST /message`** path (canonical JSON + Ed25519, same rules as the dev playground). Core **`dev_mode`** enables CORS for **`http://localhost:3000`** and **`http://127.0.0.1:3000`**; override with env **`MODULR_CORE_CORS_ORIGINS`** (comma-separated).

## Develop

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Settings persist in `localStorage` under `modulr.customer-ui.settings`.

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
