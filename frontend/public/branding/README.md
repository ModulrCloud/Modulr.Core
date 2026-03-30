# Brand assets

Place the Modulr logo in the parent **`public/`** folder (not inside `branding/`) so the app can serve it from the site root:

| File | Purpose |
|------|---------|
| **`../modulr-logo.svg`** | Preferred: vector wordmark or icon. |
| **`../modulr-logo.png`** | Fallback if SVG is missing or fails to load. |

The shell tries **SVG first**, then **PNG**, then falls back to the text wordmark **Modulr.Core**.

Example paths on disk:

- `frontend/public/modulr-logo.svg`
- `frontend/public/modulr-logo.png`

After adding a file, refresh the app; no code changes are required.
