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

- `register_module`
- `lookup_module`
- `register_org`
- `register_name`
- `resolve_name`
- `reverse_resolve_name`
- `heartbeat_update`
- `get_protocol_version`
- `get_module_functions`

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

---

## License

BSL - Business Specific License

---

## Final Notes

Modulr.Core is the foundation of the Modulr network and is needed to communicate and connect to other modules on the network