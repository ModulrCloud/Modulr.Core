---
name: pre-commit-checks
description: >-
  Runs local checks before git commit or push so they match CI: Python tests
  (pytest), Ruff lint, and frontend build. Use when the user is about to
  commit, push, open a PR, or asks if the repo is ready to ship; also when
  finishing a feature branch. Instructs to run commands from the repo root and
  report failures before suggesting commit.
---

# Pre-commit checks (Modulr.Core)

## Goal

Do not suggest or assume a commit is safe until **local checks pass** the same
bar **GitHub Actions** uses (see `.github/workflows/ci.yml`).

## From repository root

1. **Python unit tests (required)**  
   ```bash
   pytest
   ```  
   Uses `tests/` and `src/` per `pyproject.toml`. Requires dev deps:
   `pip install -e ".[dev]"` (or an equivalent venv).

2. **Python linter (required for CI)**  
   ```bash
   ruff check src tests
   ```

3. **Customer UI / Next.js (required for CI)**  
   ```bash
   cd frontend && npm ci && npm run build
   ```  
   If dependencies are already installed, `npm run build` alone is often
   enough for a quick check; CI uses `npm ci` for a clean install.

## Frontend “unit tests”

This repo’s **frontend `package.json` does not define a `test` script** (no
Jest/Vitest loop yet). **`npm run build`** is the automated gate**—it runs the
Next.js compile, lint, and type checks. Treat a green build as the JS/TS
equivalent of “tests passed” until a dedicated runner is added.

## Optional quick pass

- **`npm run lint`** under `frontend/` is lighter than a full build when
  iterating, but **CI still runs `build`**, so run **`build` before push**.

## If something fails

- Fix or explain before commit; do not silence failures to “get it in.”
- Re-run the failed command after changes.

## Related

- **`google-python-docstrings`** — update docs when code changes in the same
  change set.
- **`verify-package-before-install`** — before adding dependencies that tests
  might rely on.

## Reuse elsewhere

Copy this folder to **`~/.cursor/skills/`** and edit the body to match another
repo’s CI commands.
