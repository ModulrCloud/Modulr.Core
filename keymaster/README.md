# Keymaster (local)

Local **Ed25519** identity tool: generate **named** key profiles, **password-protect** the vault, browse via a **loopback web UI**.

**Full plan:** [`plan/keymaster_local_wallet.md`](../plan/keymaster_local_wallet.md)

**Design context:** [`docs/identity_encryption_and_org_policy.md`](../docs/identity_encryption_and_org_policy.md)

## Status

The **web UI shell** is implemented (FastAPI + Jinja + static CSS aligned with the Modulr customer shell). Background matches the Core shell **fireflies** preset (canvas + gradient). With **`prefers-reduced-motion: reduce`**, only the static gradient runs. Vault encryption, key generation, and persistence are **not** wired yet — you will see an “UI preview” banner.

## Run (development)

From the **repository root**, with your Modulr.Core venv activated:

```powershell
pip install -e ./keymaster
modulr-keymaster --reload
```

Or from `keymaster/`:

```powershell
pip install -e .
modulr-keymaster --reload
```

Defaults: **127.0.0.1:8765**. Open [http://127.0.0.1:8765](http://127.0.0.1:8765) (redirects to `/unlock`).

- **`--port`** — listen port  
- **`--host`** — bind address (avoid `0.0.0.0`; this tool is meant for loopback only)  
- **`--reload`** — auto-reload on code changes  

## Layout

| Path | Screen |
|------|--------|
| `/unlock` | Unlock vault |
| `/setup` | First-run / create vault |
| `/identities` | Dashboard (mock profiles) |
| `/identities/{id}` | Profile detail + copy public key |

Static theme files live under `src/modulr_keymaster/static/`; templates under `templates/`.
