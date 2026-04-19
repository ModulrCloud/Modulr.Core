# Modulr viewer (Vite + React)

SPA build of the customer shell: same UI as `../frontend` (Next.js), without the Next dev server. Use this for **Vite-style DX**, **AWS Amplify** static hosting (`npm run build` → `dist/`), or alignment with other React+Vite repos.

## Commands

```bash
npm install
npm run dev
```

Dev server uses **HTTPS** on **port 3000** ([`@vitejs/plugin-basic-ssl`](https://github.com/vitejs/vite-plugin-basic-ssl)) and listens on **all interfaces** (`host: true`), so the terminal shows both **Local** and **Network** URLs (e.g. `https://192.168.x.x:3000`). Open [https://localhost:3000](https://localhost:3000) on this machine, or the Network URL from another device on the same Wi‑Fi/LAN (you may need to accept a self-signed certificate warning when using an IP).

This matches the default Core URL (**`https://127.0.0.1:8000`**) so the browser does not block API calls (mixed content). See the **root `README.md`** → *Local TLS* for running Core with `--ssl-keyfile` / `--ssl-certfile`.

**LAN + Core:** From a phone or another PC, the browser **Origin** is `https://<your-LAN-ip>:3000`, not localhost. Add that exact origin to Core CORS (e.g. **`MODULR_CORE_CORS_EXTRA_ORIGINS`** or **`cors_extra_origins`** in `dev.toml`); see root **`README.md`**. Point Core URL in Settings at `https://<this-machine-LAN-ip>:8000` when calling Core from another host (not `127.0.0.1`, which always means “this device”).

```bash
npm run build
npm run preview
```

## Amplify

- Build: `npm run build`
- Output directory: `dist`
- SPA: add a rewrite rule so unknown paths serve `index.html` (standard single-page app routing).

The legacy Next.js app remains in **`../frontend`** until you fully switch over.
