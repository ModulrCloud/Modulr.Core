# Modulr viewer (Vite + React)

SPA build of the customer shell: same UI as `../frontend` (Next.js), without the Next dev server. Use this for **Vite-style DX**, **AWS Amplify** static hosting (`npm run build` → `dist/`), or alignment with other React+Vite repos.

## Commands

```bash
npm install
npm run dev
```

Dev server defaults to **port 3000** (see `vite.config.ts`) so Core `dev_mode` CORS entries for `http://localhost:3000` keep working.

```bash
npm run build
npm run preview
```

## Amplify

- Build: `npm run build`
- Output directory: `dist`
- SPA: add a rewrite rule so unknown paths serve `index.html` (standard single-page app routing).

The legacy Next.js app remains in **`../frontend`** until you fully switch over.
