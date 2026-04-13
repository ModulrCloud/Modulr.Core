# Organizations and envelope encryption

This note situates **Modulr.Core** organizations next to **envelope encryption** and **Modulr.Storage**-style blob storage. It is design context, not a guarantee of current code paths.

## Organizations in Core (today)

- **Name bindings** map a human-facing name to a **resolved identifier** (e.g. an Ed25519 public key for the org root). See `name_bindings` and registration flows in the codebase.
- **Genesis** records a **root organization label** and binds it to the org signing key when the first-boot wizard completes (`POST /genesis/complete`).

Core is intentionally **minimal**: it coordinates identity and routing, not long-term object storage.

## Envelope encryption (concept)

**Envelope encryption** usually means wrapping a **data encryption key (DEK)** so that only the right principals can unwrap it:

- A **DEK** encrypts user or org content (symmetric, e.g. AES-GCM).
- The DEK itself is encrypted with a **key encryption key (KEK)**—for example derived from a user passphrase, wrapped by a KMS, or tied to a device key.

Keymaster’s **vault** (`vault.json`) uses a local Argon2id + AES-GCM **envelope** around JSON payloads; that is **not** the same as org-wide object storage, but it illustrates the same pattern: **encrypt payload, protect keys separately**.

## Modulr.Storage vs Core

- **Modulr.Core**: messages, names, routes, genesis state—**small, structured** records with Ed25519 policy and SQLite persistence.
- **Modulr.Storage** (or similar): **large blobs**, replication, retention, and possibly **per-object DEKs** wrapped for org members or users.

**Rule of thumb:** put **coordination and pointers** in Core; put **encrypted bulk data** in the storage layer, with **keys and envelopes** defined by your product’s threat model.

## References in-repo

- Keymaster vault crypto: `keymaster/src/modulr_keymaster/vault_crypto.py`
- Signed message pipeline: `src/modulr_core/messages/`
