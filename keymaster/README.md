# Keymaster (local)

Local **Ed25519** identity tool: **encrypted** `vault.json`, **password-protect** the vault, browse via a **loopback web UI**.

**Full plan:** [`plan/keymaster_local_wallet.md`](../plan/keymaster_local_wallet.md)

**Design context:** [`docs/identity_encryption_and_org_policy.md`](../docs/identity_encryption_and_org_policy.md)

## Status

- **Vault file:** `vault.json` under **`%USERPROFILE%\.modulr\keymaster\`** (Windows) or **`~/.modulr/keymaster/`** (macOS/Linux). Override with env **`KEYMASTER_VAULT_PATH`** (full file path) or **`KEYMASTER_VAULT_DIR`** (directory; filename remains `vault.json`).
- **Crypto:** Argon2id key derivation + AES-GCM envelope. Inner JSON holds a `profiles` array (empty after first create until add-identity work lands).
- **Session:** After unlock or create, an **httpOnly** cookie holds an opaque session id; **private keys stay in server RAM** only until **Lock vault** or process exit.
- **UI:** FastAPI + Jinja + static CSS aligned with the Modulr customer shell; **fireflies** background (static gradient only if `prefers-reduced-motion: reduce`).

## Run (development)

From the **repository root**, with your Modulr.Core venv activated:

```powershell
pip install -e ./keymaster
modulr-keymaster --reload
```

Install dev deps for tests: `pip install -e "./keymaster[dev]"`.

Defaults: **127.0.0.1:8765**. Open [http://127.0.0.1:8765](http://127.0.0.1:8765): no vault → **Create vault**; vault present → **Unlock**.

- **`--port`** — listen port  
- **`--host`** — bind address (avoid `0.0.0.0`; this tool is meant for loopback only)  
- **`--reload`** — auto-reload on code changes  

## Tests

From `keymaster/`:

```powershell
pytest
```

## Routes

| Path | Method | Behavior |
|------|--------|----------|
| `/` | GET | Redirect: no vault → `/setup`, else `/unlock` |
| `/setup` | GET/POST | Create `vault.json` (passphrase ≥ 12 chars, confirm match); then session + redirect `/identities` |
| `/unlock` | GET/POST | Decrypt vault; POST sets session → `/identities` |
| `/lock` | POST | Clear session → `/unlock` |
| `/identities` | GET | Dashboard (requires session) |
| `/identities/{id}` | GET | Profile + public key (requires session) |

Static assets: `src/modulr_keymaster/static/`; templates: `templates/`.
