# Identity, encryption, org policy, and mail (design reference)

**Status:** design capture from product discussion — not a normative wire spec. When behavior ships, link implementations and tests here.

This document records **how we intend to handle** common scenarios: genesis, DMs, org file access, group chat, offboarding, and custody. It avoids repeating full protocol math; it states **decisions and resolution patterns**.

**Related:** `docs/modulr_protocol_core_v_1_draft.md`, `docs/platform_ui_and_protocol.md`, planned **resolve** / name → pubkey flows on Core.

---

## 1. Genesis & first boot (wizard)

**Scenario:** A fresh Core (or first network operator) must establish **trust** in an initial key before the system is “live.”

**Decision (normative for genesis):** Proof of possession is **only** via **Ed25519 signature** over a **canonical challenge message**. The operator **signs** the exact bytes Core specifies; Core **verifies** with the **public key the operator already submitted**. There is **no** genesis step that asks the operator to **decrypt** a ciphertext to prove key ownership, and **no** short numeric code (e.g. six digits) as the cryptographic proof — those were early brainstorm ideas and are **not** the chosen direction.

**Flow:**

1. Operator submits **signing public key** (hex).
2. Core returns a **challenge** (structured, versioned string or bytes; includes nonce, instance id, expiry).
3. Operator **signs** the challenge with the **private key** matching that public key.
4. Operator submits **signature** (hex/base64); Core **verifies**. On success, genesis advances.

If the wrong public key was submitted, verification **fails** — you cannot pass genesis without the private key that matches the pubkey you offered (submitting someone else’s pubkey only locks you out unless you also have their secret).

**Optional UX:** Encode the challenge in a **QR**; sign on a phone or air‑gapped tool; paste the **signature** back into CLI or web wizard.

**Keymaster (interim, track for Core alignment):** The **Keymaster** loopback UI **“sign challenge”** treats pasted content as **Unicode text** and signs **`UTF-8(body)`** (exact bytes matter). Core **genesis challenge v1** is the multiline text in **section 1.1** below; operators must sign that string’s UTF-8 bytes with the Ed25519 key matching the pubkey they submitted. A later Keymaster option may add **hex (raw bytes)** mode for opaque machine challenges.

### 1.1 Genesis challenge v1 (canonical body)

**Format id:** first line is exactly `modulr-genesis-challenge-v1`.

**Line endings:** Unix newlines (`\n`) between lines. **No** trailing newline after the last line.

**Signing:** Ed25519 over **`body.encode("utf-8")`**. Signature wire form: **128 lowercase hex** characters (64 bytes).

**TTL:** Challenges expire **300 seconds** after issue (`expires_at_unix` on the last line is `issued_at_unix + 300`). Core stores each challenge in SQLite and marks it **consumed** after one successful verify (**anti-replay**).

**Fields** (each on its own line, in this order):

1. `modulr-genesis-challenge-v1` (format/version line)
2. `instance_id: <uuid>` — stable id for this Core deployment (allocated once, stored in `core_genesis.instance_id`)
3. `nonce: <64 lowercase hex>` — equals Core’s `challenge_id` (one-shot row key)
4. `issued_at_unix: <int>` — Unix seconds when Core issued the challenge
5. `expires_at_unix: <int>` — Unix seconds when the challenge expires
6. `subject_signing_pubkey_hex: <64 lowercase hex>` — Ed25519 public key the operator submitted (must match signing key)
7. `purpose: prove_bootstrap_operator` (literal)

**Example** (illustrative; `nonce` and times vary per issue):

```text
modulr-genesis-challenge-v1
instance_id: 550e8400-e29b-41d4-a716-446655440000
nonce: abcd…64 hex chars…
issued_at_unix: 1700000000
expires_at_unix: 1700000300
subject_signing_pubkey_hex: …64 hex chars…
purpose: prove_bootstrap_operator
```

### 1.2 Modulr.Core implementation (reference)

**Implementation plan (stages, CLI, reset guards):** [`plan/genesis_wizard_core.md`](../plan/genesis_wizard_core.md) in this repository.

**HTTP** (unsigned JSON; local or testnet only — `network_environment` must allow genesis operations):

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/version` | Connectivity + `network_environment`, `genesis_operations_allowed`, display `network_name` |
| `POST` | `/genesis/challenge` | Issue challenge bound to operator pubkey |
| `POST` | `/genesis/challenge/verify` | Verify signature, consume challenge |
| `POST` | `/genesis/complete` | Bind root org label, operator/org keys, `genesis_complete` |

**CLI (same rules as HTTP; not for production tier):** `modulr-core genesis challenge|verify|complete|reset` — see root [`README.md`](../README.md).

On server start, Core logs one **INFO** line with `network_environment`, `genesis_complete`, and `instance_id` (from `core_genesis`) for support and ops.

**Wizard steps (conceptual):** prove key (sign challenge) → mint **first user** (bootstrap handle) → create **root org** and bind domain / apex policy → mark genesis complete (one-time flags in Core state).

**Later (PQ):** The same **pattern** stays: **sign the challenge** with whatever `signing_algorithm_id` is active (e.g. hybrid ML-DSA + classic), not decrypt-a-blob.

---

## 2. Signing vs encryption (Ed25519 vs X25519)

**Scenario:** We use Ed25519 for `report_module_state` and similar; we also want **confidential** DMs and files.

**Resolution:**

- **Ed25519:** signatures (identity, authorization, genesis proof). Not used as “encrypt with public key.”
- **Confidentiality:** **X25519 (ECDH) + AEAD** (or library “sealed box” / HPKE-style envelopes): random content key → encrypt body → wrap content key to recipient’s **encryption** public key.
- **Same seed, two roles:** document whether one secret derives **both** signing and encryption pubkeys, or users publish **two** keys. Do not claim one Ed25519 pubkey “encrypts” without specifying derivation.

---

## 3. Key discovery (“CryptoDNS”)

**Scenario:** Alice messages Bob **cold** — no prior session.

**Resolution:**

- **No pre-shared secret** required. Alice needs **Bob’s current encryption public key** (or key bundle) from a **directory**.
- **Core `resolve` (and successors):** map **username / org-scoped name** → **public key material** (+ optional pre-key bundle for advanced protocols).
- Sender: resolve → encrypt → upload **ciphertext**; server stores opaque bytes. Bob decrypts later offline.

---

## 4. Where crypto runs (Core vs client vs module)

**Scenario:** Should Core “encrypt this plaintext for Alice”?

**Resolution:**

- **No** for end-user confidential payloads — Core would see plaintext.
- **Client / wallet / SDK:** perform encrypt/decrypt; Core (or storage) holds **ciphertext + metadata + ACL / wraps**.
- **Optional module:** key **registry**, rotation policy, **wrapped key** distribution — still not bulk decrypt-as-a-service for arbitrary user mail.
- **Shared library:** one canonical **envelope format** (`version`, `kem_id`, `aead_id`, …) used by CLI, web wallet, and storage adapters.

---

## 5. Dev wallet / client v1 (repo placement)

**Scenario:** Operators need a small tool: keygen, secure storage, **sign arbitrary challenges** (genesis, later admin ops).

**Resolution:**

- **Wallet-shaped:** generate/import keys, store secret locally, sign presented messages, export pubkey.
- **Prototype in this monorepo** — see **`plan/keymaster_local_wallet.md`** and the **`keymaster/`** package (local Ed25519 vault + loopback UI); **will move to own repo** when mature.
- **Stack (example):** Python + FastAPI + Jinja/static CSS matching shell tokens; **CLI first** is an optional alternate entrypoint.

---

## 6. Async encrypted mail (decentralized mail product)

**Scenario:** Message sits on a server until the recipient reads it; only the recipient should read plaintext.

**Resolution:**

- **Hybrid envelope:** one **symmetric** key for the body (AEAD); that key **wrapped** to recipient’s pubkey (asymmetric).
- **Server:** stores ciphertext + metadata; **never** requires plaintext from the client for storage.
- **Forward secrecy / pre-keys:** optional later (e.g. Signal-style bundles); v1 may accept long-term keys with documented tradeoffs.

**Economic / spam layer (product):** postage / fee-to-recipient is **orthogonal** to crypto — it binds **cost + identity**, not who can decrypt.

---

## 7. Multi-recipient (Cc-style)

**Scenario:** One logical email to several people.

**Resolution:**

- **One** body ciphertext (single content key).
- **N wraps** of that content key — one per recipient pubkey — in one stored object or N envelopes.
- Avoid N full duplicate bodies unless simplicity outweighs storage.

---

## 8. Group chat

**Scenario:** Many participants; membership changes over time.

**Resolution:**

- **Room / group key** `K_room`: distribute to members via wraps; **rotate** when someone **leaves** (otherwise ex-members read forever).
- **Scale / efficiency:** protocols like **MLS (TreeKEM)** for large groups and frequent adds/removes — “round the table” DH is the right intuition; MLS is the modern engineered form.
- **Pairwise-only** between all members does not scale for large rooms.

---

## 9. Org shared storage & internal “sectors”

**Scenario:** Org-wide files; **some** members must **not** see **some** trees (e.g. finance vs engineering).

**Resolution:**

- **Per bucket / folder / project symmetric key** `K_bucket` — not one org-wide key for everything sensitive.
- **Access** = who receives **wraps** of `K_bucket` (or wraps of a **subgroup key** that unlocks a sector).
- **Revoke / leave sector:** stop issuing new wraps; **rotate** `K_bucket` if you need to invalidate old copies quickly.

---

## 10. Offboarding (“kick Bill”), email slots, succession

**Scenario:** Bill leaves; org must **cut access**, **keep data**, **hand work to Pat**, **reuse** a name slot without “being Bill.”

**Resolution:**

- **Names under org control** (org CryptoDNS): **rebind** `bill@org` / role mailbox / employee slot to **Pat’s new pubkey** — the **name is org property**; Bill’s **personal** key is not seized.
- **Cryptographic offboarding:** **revoke** Bill’s wraps; **rotate** sensitive `K_bucket`s where policy requires; **issue** wraps to Pat for the same ciphertext blobs (if org always had custodial wrap) or re-wrap after rotation.
- **“Act as Bill”:** avoid silent impersonation; prefer **disable identity**, **forward / archive mailbox**, **audit trail**.
- **Limits:** cannot delete Bill’s offline copies or printed exfil; protocol enforces **future** access and **org continuity**, not perfect recall.

---

## 11. Company assets created by an employee

**Scenario:** Bill committed work under a “company account”; assets must remain **org-owned** when Bill leaves.

**Resolution:**

- **Policy rule:** company work products are encrypted under keys where **org custodian / policy key** (or **M-of-N**) **always** has a wrap — Bill has a **member** wrap, not sole custody.
- **Handoff:** Pat receives new wraps to the **same** project keys; same stored ciphertext where design allows.
- If something was encrypted **only** to Bill with **no** org wrap, that is a **custody failure** to fix by rotation and policy, not something decentralization “fixes” after the fact.

---

## 12. Algorithm agility & post-quantum (future)

**Scenario:** Stay **encryption- and signing-algorithm agnostic** in product design so we can migrate (e.g. toward **quantum-resistant** primitives) without rewriting every module.

**Design principles:**

1. **Wire and disk formats carry an explicit algorithm id**  
   Every signed object and every encrypted envelope includes something like `signing_algorithm_id`, `kem_id`, `aead_id` (exact names TBD when we freeze v1 envelopes). Parsers **dispatch** on id; unknown ids are a **clean error**, not undefined behavior.

2. **Single crypto provider boundary**  
   Application code depends on a small interface, e.g.:
   - `sign(message: bytes, key_handle) -> Signature`
   - `verify(message, signature, pubkey) -> bool`
   - `seal(plaintext, recipient_pubkey) -> CiphertextEnvelope` / `open(...)`  
   Implementations live in one package per language (`modulr_crypto` / `@modulr/crypto`): **Ed25519 + X25519 + AEAD today**; **ML-KEM + ML-DSA (or hybrid)** tomorrow. No `cryptography.hazmat` calls scattered through HTTP handlers or UI.

3. **Hybrid transition**  
   During migration, envelopes may include **both** classic and PQ components (e.g. sign with Ed25519 **and** ML-DSA) until clients catch up. Document a **sunset policy** for classic-only artifacts.

4. **PQ direction (indicative, not a commitment)**  
   NIST **ML-KEM** (based on **Kyber**) is the standardized **KEM** family for key encapsulation; **ML-DSA** covers **signatures** (Dilithium family). We should **not** hard-code the string “Kyber” in wire formats — use **versioned algorithm ids** that map to spec tables (e.g. `mlkem-768`, `mldsa-65`) as libraries stabilize.

5. **Testing**  
   Golden vectors per `algorithm_id` and property tests on the provider boundary so swapping implementations is regression-tested.

**Anti-patterns:** implicit “the whole stack is Ed25519”; magic constants in business logic; encrypting user mail inside Core because “it’s easier.”

---

## 13. Centralized blobs (e.g. S3) + optional SQL compute

**Scenario:** Ciphertext lives on S3; org wants query/compute later.

**Resolution:**

- **Storage:** ciphertext + ACL metadata; access via **wraps** and policy engine.
- **SQL over secret data:** separate hard problem (TEE, client-side query, limited structured encryption, etc.) — do not collapse into the same doc as file ACLs without a dedicated design.

---

## 14. Trust & forks

**Scenario:** Someone runs a local fork and calls their org “Modulr.”

**Resolution:**

- **Trust** comes from **published roots**, **apex domain**, **key transparency**, and **user education** — not global uniqueness of a string name. Protocol can still define **canonical** org apex for the real network.

---

## Changelog

- **2026-04-01:** §1 Keymaster interim note: UTF-8 signing rule for pasted challenges; Core challenge format still TBD — document byte convention when genesis wire format is fixed.
- **2026-03-31:** §1 clarified: genesis proof is **signature-only**; explicitly rejects decrypt challenges and six-digit codes as the proof.
- **2026-03-31:** Expanded §12 (algorithm-agnostic design, ML-KEM / PQ note).
- **2026-03-31:** Initial capture from design discussion (genesis, mail, org keys, offboarding, wallet scope).
