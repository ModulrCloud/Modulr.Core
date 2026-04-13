# Platform UI vision & protocol inheritance (brainstorm)

Living notes for **customer-facing Modulr UI** (separate repo later) and **how future Modulr modules** (Assets, Storage, …) stay aligned on wire format and client ergonomics.

---

## A. Making later modules “inherit” the communication protocol

Goal: every Modulr service speaks a **family-compatible** wire model so one mental model, shared tooling, and fewer one-off clients.

### A.1 Single source of truth for the envelope

- Treat **`docs/modulr_protocol_core_v_1_draft.md`** (and successors) as the normative story; Core is the **reference implementation**.
- For each product, publish a **machine-readable contract** as it stabilizes:
  - **OpenAPI** (or AsyncAPI if you add streaming) for HTTP boundaries.
  - Optional: JSON Schema for envelope / payload fragments if you want codegen without full HTTP spec.

### A.2 Shared client libraries (recommended path)

- **`@modulr/protocol`** (TypeScript) and **`modulr-protocol`** (Python): minimal layer that only knows:
  - canonical JSON rules (already mirrored in playground + tests),
  - envelope shape, signing preimage, Ed25519 helpers,
  - `protocol_version`, `target_module`, `operation` conventions,
  - typed errors / status codes.
- **Per-service SDKs** (`@modulr/core-client`, `@modulr/assets-client`, …) depend on `@modulr/protocol` and add **operation names + payload types** for that module only.

This avoids copy-pasting signing logic into every repo while keeping **module-specific** operations in module-specific packages.

### A.3 Versioning and capability negotiation

- **Protocol version** on every request (as today); servers respond with what they accept.
- Document a **compatibility policy** (e.g. same major = wire compatible; deprecations announced N releases ahead).
- Longer term: optional **`capabilities`** or **`supported_operations`** on a cheap **read-only** endpoint so UIs and clients degrade gracefully (e.g. “Assets disconnected”).

### A.4 Internal conventions for new modules

When spinning up **Modulr.Assets**, **Modulr.Storage**, etc.:

1. Reuse the **same envelope + signing** rules as Core.
2. Register a distinct **`target_module`** and **operation** namespace (no collisions with `CORE_OPERATIONS`).
3. Ship a **small conformance checklist** (canonical JSON vectors, signature fixture tests) copied or imported from Core’s test patterns.
4. Prefer **one shared CI pattern**: Node + Python parity only where both clients exist; at minimum **fixture-based** golden vectors for canonical bytes.

### A.5 What “inherit” does *not* mean

- It does **not** require every module to be in one monorepo—only that **specs + thin SDKs** stay coherent.
- **Balances, payments, validator consensus** stay in their owning services (see Architecture); the **protocol layer** is shared, not the business logic.

---

## B. Customer site / dashboard (product shape)

### B.1 Dashboard metrics (target experience)

| Idea | Notes |
|------|--------|
| Active validators | Needs **network/ops** data; Core MVP does **not** expose multi-validator sync yet—UI can show **configured** validators + **last seen** when you add health/heartbeat aggregation. |
| Previous transactions | **Modulr.Assets** (or a ledger module); until attached, show **disconnected / stale** with explanation. |
| Modules on the network | **`lookup_module`** / listing strategy (today may need **prefix scan or index** if you want “all modules”—confirm with persistence/API design). |
| Uptime / status | **Per-validator ping** or **Core health** endpoint; combine into one “network status” tile. |
| Other useful metrics | Error rate from Core logs (ops), registration rate, name resolution QPS—mostly **later** once metrics pipeline exists. |

### B.2 Settings: core validators (routing)

- Store **validator base URLs** (or connection profiles) in **local settings** (v1) → later **user/org-backed** config if product requires it.
- For **local dev**, show internal IPs/hostnames; allow **add / remove / reorder** and a **“test connection”** action (HTTP + optional signed ping).
- Clearly separate **UI config** from **bootstrap keys** (signing material should stay out of casual settings where possible).

### B.3 Theme

- **Dark / light** with a **slider** (continuous or stepped) is a strong brand fit with glassmorphism; respect **`prefers-reduced-motion`** for background effects.

### B.4 Below the fold

- **Curated / popular modules** (network content): needs **ranking signal** (usage, hearts, downloads)—product + backend decision; can start with **static** or **editorial** list.
- **Create module** → flow backed by **`register_module`** (signed envelope from browser or via server proxy—**security review** if private keys live in the UI).
- **Search / list modules** → pagination + query; depends on **Core (or indexer) APIs** beyond single `lookup_module` by id.

### B.5 Registry & naming flows (Core-aligned)

These map well to **Modulr.Core MVP** operations (see `docs/MVP scope.md`):

- **Name registration** → `register_name`
- **Org registration** → `register_org` (org **domain** shape; **“org seats”** / billing may be a **separate** concern unless you model seats in Core explicitly)
- **Forward resolution** → `resolve_name`
- **Reverse resolution** → `reverse_resolve_name`
- **Module register / lookup** → `register_module`, `lookup_module`
- **Heartbeat** (module liveness) → `heartbeat_update`

**Account balance** is **not** a Core responsibility per `docs/Architecture.md`; plan **`Modulr.Assets`** (or similar) and keep the UI tile **pluggable**.

---

## C. Staged delivery (agreed direction)

**Stage 1 — UI shell only**

- Visual foundation: **background** (e.g. fireflies / gradient), **glass** panels, **primary `#ffb700`** accents, typography aligned with marketing site.
- **Settings entry** (gear or similar) opening a **modal or drawer**: validator list editor + persistence (e.g. `localStorage`) + optional “Test”.
- **Theme control** (dark/light slider) wired to CSS variables.
- **No requirement** yet for live metrics beyond static placeholders or a single **“Core URL”** health ping if you want a cheap green/red dot.

**Later stages** (order flexible)

- Dashboard tiles wired to **real** Core + Assets endpoints.
- Module list / search / create flows with **pagination**.
- Name/org flows and **balance** when Assets is attached.

---

## D. Possible gaps to track

- **Read-only HTTP** helpers: public **health**, **version**, and maybe **`supported_operations`** reduce guesswork for the UI (some may not exist yet).
- **Auth model for the dashboard**: browser-held keys vs backend proxy; affects **CORS**, **CSP**, and **key storage**.
- **Pagination / list APIs** for modules and names if the product needs directory views.
- **“Org seats”**: clarify whether that is **Core metadata**, **Assets**, or **billing**—avoid overloading `register_org` without a spec.
- **Accessibility**: glass + motion + contrast; test keyboard and reduced motion early.

---

## E. Quick reference — Core operations today

From `modulr_core.messages.constants.CORE_OPERATIONS`:

`register_module`, `lookup_module`, `register_name`, `register_org`, `resolve_name`, `reverse_resolve_name`, `heartbeat_update`.

Anything like **validator quorum**, **global tx history**, or **balances** belongs in **other modules** or **ops infrastructure**, with the UI **composing** multiple backends.
