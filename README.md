# Modulr.Core

## Overview

**Modulr.Core** is the foundational routing and coordination layer of the Modulr network.

It is responsible for connecting users, modules, and services through a unified, signed message protocol. Rather than acting as a traditional centralized server, Modulr.Core serves as a **network entry point and discovery layer**, allowing participants to locate and interact with other modules such as storage, assets, and compute services.

This repository contains the reference implementation of the Core module for the Modulr ecosystem.

---

## What is Modulr?

Modulr is a modular, decentralized system designed to function as a next-generation internet platform.

Instead of relying on monolithic services, Modulr is composed of independent modules such as:

- `modulr.core` — routing, identity, and discovery
- `modulr.assets` — balances, ownership, and asset protection
- `modulr.storage` — distributed storage coordination

Each module operates independently while communicating through a shared protocol.

---

## Responsibilities of Modulr.Core

Modulr.Core acts as the **coordination plane** of the network.

It is responsible for:

- **Identity Verification**
Validating signed requests from users, modules, and services.
- **Module Registration**
Allowing new modules (e.g. `modulr.storage`, `modulr.assets`) to join the network.
- **Module Lookup & Routing**
Resolving where modules live and how to communicate with them.
- **Naming System**
Registering and resolving human-readable names for:
  - users
  - organizations
  - modules
- **Organization Management**
Supporting organization-based ownership and collaboration.
- **Protocol Discovery**
Providing version and capability information for the network.
- **Network Status**
Receiving heartbeat updates from modules and tracking availability.

---

## What Modulr.Core Does NOT Do

To maintain scalability and modularity, Modulr.Core does **not** handle:

- storage logic (`modulr.storage`)
- asset balances or payments (`modulr.assets`)
- provider payouts
- application-specific functionality

Those responsibilities belong to their respective modules.

---

## Architecture

Modulr follows a **modular service architecture**:

```
Client → Modulr.Core → Target Module
```

Example flow:

1. A client sends a request to `modulr.core`
2. Core resolves the route to a target module (e.g. `modulr.storage`)
3. The client communicates directly with that module

Core is not a bottleneck — it is a **router and registry**, not a data processor.

---

## Message Protocol

All communication in Modulr is performed using a signed, versioned message envelope.

### Key Concepts

- **Protocol Versioning**
Format: `YYYY.MM.DD.N`
- **Target Module**
Specifies which module should process the request
- **Operation-Based Execution**
Each request calls a specific operation (function) on a module
- **Signed Requests**
Every request is authenticated using cryptographic signatures

### Example Message

```json
{
  "protocol_version": "2026.03.22.0",
  "message_id": "msg-001",
  "target_module": "modulr.core",
  "target_module_version": null,
  "operation": "lookup_module",

  "sender_id": "user:abc123",
  "sender_key_type": "ed25519",
  "sender_public_key": "PUBKEY_HERE",

  "timestamp": "2026-03-22T23:10:00Z",
  "expires_at": "2026-03-22T23:11:00Z",

  "payload": {
    "module_name": "modulr.storage"
  },
  "payload_hash": "HASH_HERE",

  "signature_algorithm": "ed25519",
  "signature": "SIG_HERE"
}
```

---

## Bootstrap Phase

During initial network bring-up, Modulr.Core uses a **bootstrap authority set**.

Bootstrap authorities are trusted identities that can:

- register initial modules
- register organizations
- publish protocol definitions

> These privileges are time-limited

---

## Operations (V1)

The following operations are part of the initial Core implementation:

- `get_protocol_version`
- `get_protocol_methods`
- `get_module_methods`
- `lookup_module`
- `register_module`
- `register_org`
- `register_name`
- `resolve_name`
- `reverse_resolve_name`
- `heartbeat_update`
- `submit_module_route`
- `remove_module_route`
- `get_module_route`

---

## Development Philosophy

Modulr.Core is designed to be:

- **Minimal** — only handles coordination logic
- **Modular** — everything else is delegated
- **Replaceable** — individual modules can be rewritten in any language
- **Protocol-Driven** — behavior is defined by message structure, not framework choice

---

## Implementation Notes

The initial implementation is expected to:

- use **Python** for rapid iteration
- expose HTTP endpoints (FastAPI recommended)
- validate signed message envelopes
- enforce strict input validation and limits

Future implementations may migrate components to:

- Rust (performance-critical paths)
- Go (network services)
- other languages as needed

### Design notes (`docs/`)

| Document | Topic |
| -------- | ----- |
| [`docs/organizations_and_envelope_encryption.md`](docs/organizations_and_envelope_encryption.md) | Organizations, DEKs, envelope encryption vs Modulr.Storage |
| [`docs/genesis_and_session_roadmap.md`](docs/genesis_and_session_roadmap.md) | Finishing genesis (`/genesis/complete`), Keymaster-style shell sign-in, session tiers |
| [`docs/partner_methods.md`](docs/partner_methods.md) | Partner-visible methods between orgs (idea; not implemented) |
| [`docs/implementation_plan_profile_and_org_images.md`](docs/implementation_plan_profile_and_org_images.md) | Genesis complete, Keymaster sign-in, local vs server avatars |

---

## Status

This project is currently in early development.

The focus is on:

- protocol stability
- message validation
- module registration and routing
- foundational network behavior

---

## Development

Python **3.11+** required. Runtime dependencies (including **cryptography** for Ed25519) are listed in **`pyproject.toml`**; `pip install -e ".[dev]"` installs them into your venv.

**Use a virtual environment** so dependencies stay isolated from your system Python. Create it once per clone (the `.venv` folder is gitignored and is not part of the repo).

**Windows (PowerShell or cmd):**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

If PowerShell refuses to run `Activate.ps1`, use **cmd** and run `.venv\Scripts\activate.bat`, or allow scripts for your user once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

**macOS / Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Then run checks from the repo root (with the venv still activated):

```bash
ruff check src tests
ruff format --check src tests
pytest
```

The importable package is **`modulr_core`**; the protocol module name on the wire remains **`modulr.core`**.

### Quick start: Core, Keymaster, and frontend (after a reboot)

Use **three terminals**. In each Python terminal, **activate the same venv** first (Windows: `.\.venv\Scripts\Activate.ps1` from the repo root). Install **once** per clone; after an overnight reboot you only need to activate the venv and run the commands.

| What | Where | One-time setup | Run (typical dev) | URL |
| ---- | ----- | ---------------- | ------------------- | --- |
| **Core** (TLS recommended) | Repository root | `pip install -e ".[dev]"` + TLS PEMs (see **Local TLS** below) | `modulr-core --reload -v --config dev.toml --ssl-keyfile … --ssl-certfile …` | [https://127.0.0.1:8000](https://127.0.0.1:8000) — try `GET /version`; LAN: `https://<host-ip>:8000` |
| **Keymaster** (signing UI) | `keymaster/` | `cd keymaster` then `pip install -e ".[dev]"` | `modulr-keymaster --reload` | [http://127.0.0.1:8765](http://127.0.0.1:8765) |
| **Frontend** or **viewer** | `frontend/` or `viewer/` | `npm install` | `npm run dev` | [https://localhost:3000](https://localhost:3000) (self-signed; browser may prompt once) |

If **`modulr-core`** or **`modulr-keymaster`** is not recognized, the venv is inactive or the editable install was done in a different environment — run `pip install -e ".[dev]"` again from **this repo root** (Core) or from **`keymaster/`** (Keymaster). **`--reload`** restarts the server when Python files change (dev only).

#### Local TLS (default)

**Why:** Customer UIs run **`npm run dev`** over **HTTPS** so sign-in and API traffic stay on TLS in development. Browsers block **`http://`** APIs from **`https://`** pages (mixed content), so Core should use HTTPS too. Default Core URL in **Settings** is **`https://127.0.0.1:8000`** (existing saved `http://127.0.0.1:8000` entries migrate automatically).

1. **TLS for Core** — Create a **localhost** cert and key (PEM). **[mkcert](https://github.com/FiloSottile/mkcert)** is typical: install the local CA, then e.g. `mkcert localhost 127.0.0.1`.
2. Start Core with **`--ssl-keyfile`** and **`--ssl-certfile`** (both required together):

```powershell
modulr-core --reload -v --config dev.toml --ssl-keyfile .\localhost+2-key.pem --ssl-certfile .\localhost+2.pem
```

3. **Optional HTTP-only Core** — Run Core **without** `--ssl-*` and set the Core endpoint in app settings to **`http://127.0.0.1:8000`**. You must then run the web UI over **HTTP** as well (not the default); for Next.js use `next dev --turbo` without `--experimental-https`, and for Vite remove `@vitejs/plugin-basic-ssl` from `viewer/vite.config.ts` or use a plain HTTP profile.

**UIs:** Next.js uses **`--experimental-https`**; Vite uses **`@vitejs/plugin-basic-ssl`** (self-signed dev cert).

With **`dev_mode = true`**, CORS defaults include **`http://` and `https://`** for `localhost:3000` and `127.0.0.1:3000`. If you open the dev UI via a **LAN IP** (e.g. **Network: `http://10.0.0.53:3000`**), the browser **Origin** is that URL and Core will block **`fetch`** until you allow it. Append origins without replacing the defaults:

```powershell
$env:MODULR_CORE_CORS_EXTRA_ORIGINS="http://10.0.0.53:3000"
modulr-core --reload -v --config dev.toml
```

Use **`MODULR_CORE_CORS_ORIGINS`** only when you want to **replace** the full allowlist (comma-separated). Restart Core after changing env vars.

You can also set **`cors_extra_origins`** in **`dev.toml`** (array of full origin strings) so LAN URLs are checked in without setting env vars each time.

#### LAN / internal network (other PCs on your subnet)

1. **Bind address** — by default Core listens on **`0.0.0.0`** (all interfaces), so other PCs on the same network can reach **`http://<core-host-LAN-IP>:8000`** without extra flags. To restrict Core to **this machine only** (no LAN exposure), use **`--host 127.0.0.1`**.

2. **CORS** — allow every **Origin** your browsers use (e.g. Next **Network** URL `http://10.0.0.53:3000`). Use **`cors_extra_origins`** in **`[modulr_core]`** (see **`dev.toml`** commented example), **`MODULR_CORE_CORS_EXTRA_ORIGINS`**, or **`MODULR_CORE_CORS_ORIGINS`** to replace the list entirely.

3. **Customer UI settings** — from another PC, set the Core base URL to **`http://<core-host-LAN-IP>:8000`**. **`127.0.0.1`** always means “this machine,” not the server.

4. **Firewall** — on the machine running Core, allow inbound TCP on the chosen port (e.g. **8000**).

5. **Scope** — **`dev_mode`** with the default bind is reachable on your LAN; use **`--host 127.0.0.1`** on untrusted networks or when you do not want the service discoverable from other hosts.

### Run the HTTP server (local)

The **`modulr-core`** command only works after the package is installed into your venv. From the **repository root** (with `.venv` activated):

```powershell
pip install -e ".[dev]"
modulr-core --config dev.toml
```

Use **`modulr-core -v --config dev.toml`** when you want each request logged (method, path, `Origin`, status) plus a startup list of routes. **`GET /version` returning 404** almost always means the server process is still on **old code** — stop it and start again (and run **`pip install -e ".[dev]"`** if you pulled changes).

Defaults: **`0.0.0.0:8000`** (listen on all interfaces; other PCs use the host’s LAN IP). Use **`--host 127.0.0.1`** for loopback only. Override port with **`--port`**. On startup, the process prints **`127.0.0.1`** and any detected **LAN IPv4** addresses so you can paste the right URL on another device. If you see **`ModuleNotFoundError: No module named 'modulr_core'`**, the editable install is missing or the venv is wrong — run **`pip install -e ".[dev]"`** again from this repo’s root.

A **config file is required**: use **`--config dev.toml`** or set **`MODULR_CORE_CONFIG`** to a TOML path. If the port is already taken, the CLI exits with a short error before starting uvicorn.

**Read-only:** **`GET /version`** returns JSON `target_module`, `version`, **`network_environment`** (`local` | `testnet` | `production`, default `production` if omitted in config), **`network_name`** (operator display string — set `network_name` in TOML or get a default like `Modulr (local)`), and **`genesis_operations_allowed`** (boolean; `true` only on `local` / `testnet`). In **`dev_mode`**, CORS allows **`http://` and `https://`** for **`localhost:3000`** and **`127.0.0.1:3000`**, plus **`cors_extra_origins`** from TOML and **`MODULR_CORE_CORS_EXTRA_ORIGINS`** (append). Set **`MODULR_CORE_CORS_ORIGINS`** to replace the entire list (comma-separated). **`network_environment = "production"`** cannot be combined with **`dev_mode = true`** (configuration is rejected at startup).

**Genesis wizard (local/testnet only):** use **`POST /genesis/...`** or **`modulr-core genesis challenge|verify|complete`** (put **`-c` / `--config`** before the step name). To wipe wizard state and run the flow again: **`modulr-core genesis reset --yes`** (warnings on stderr). That path requires **`dev_mode = true`** *or* **`MODULR_ALLOW_GENESIS_RESET=1`** when **`dev_mode`** is false (e.g. shared testnet). Details: **`plan/genesis_wizard_core.md`**.

### Customer web UI (stage 1)

A **Next.js** app in **`frontend/`** is the original customer-facing shell (theme blend, glass layout, firefly/gradient backgrounds, settings for Modulr.Core URLs). It is kept beside Core for convenience and is expected to move to its own repository later.

A **Vite + React** copy lives in **`viewer/`** — same routes and components, **no Next.js** — intended for simpler local dev, parity with other Vite-based Modulr apps, and **static hosting** (e.g. AWS Amplify). The Next app remains a known-good reference until you standardize on one.

```bash
cd frontend
npm install
npm run dev
```

```bash
cd viewer
npm install
npm run dev
```

Details: **`frontend/README.md`**, **`viewer/README.md`**. Phased product plan: **`plan/customer_web_interface.md`**.

### Planned: module branding (tracking)

Module publishers should be able to register a **logo** (or icon) for their module so explorers and the customer shell can show it next to the module name. **Format policy is not fixed yet** — **SVG** is a strong default (scales cleanly at any size); allowing PNG/WebP with size limits is an alternative. This will need a wire contract, validation, and storage or URL policy on Core or the module registry when implemented.

### Planned: Modulr ID — `get_modulr_id` (tracking)

Optional **identity / trust** layer: a protocol-category wire read (**`get_modulr_id`**) to resolve an opaque **Modulr ID** and related trust signals (e.g. centralized onboarding, tier) for use alongside org/name identity. **Issuance / mutation stays private** — only trusted operators (e.g. module owners, bootstrap/service keys), not arbitrary callers setting their own IDs on the open wire. Details: payload shape, storage, and whether attestations are minimal hashes vs richer records TBD when implemented.

---

## License

BSL - Business Specific License

---

## Final Notes

Modulr.Core is the foundation of the Modulr network and is needed to communicate and connect to other modules on the network