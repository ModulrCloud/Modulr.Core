# Modulr Protocol Specification — Core Foundation V1 (Refined)

---

## 1. Purpose

This document defines the **foundational Modulr message protocol** required to bring `modulr.core` online.

It establishes:

- a lean, universal message envelope
- identity and signing rules
- bootstrap policy
- routing and module targeting
- first Core operations

This version prioritizes **clarity, simplicity, and future extensibility**.

---

## 2. Core Principles

### 2.1 Modular Architecture

The network is composed of independent modules:

- `modulr.core`
- `modulr.assets`
- `modulr.storage`

Each module:
- exposes operations
- processes its own payloads
- communicates via the shared protocol

### 2.2 Core Responsibilities

`modulr.core` is responsible for:

- identity verification
- module registration
- module lookup and routing
- naming and reverse naming
- organization registration
- protocol discovery
- network status (heartbeats)

`modulr.core` does NOT handle:

- storage logic
- asset balances
- payment systems

---

## 3. Transport

### 3.1 V1 Transport

- HTTP
- JSON

### 3.2 Future Transport

Protocol must remain compatible with:

- custom packet transport
- WebRTC
- other communication layers

---

## 4. Versioning

### 4.1 Protocol Version

Format:

`YYYY.MM.DD.N`

Example:

`2026.03.22.0`

### 4.2 Module Version

Each module declares its own version independently:

- `protocol_version`
- `module_version`

### 4.3 Target Module Version

Rules:

- `null` → use latest active version
- specific version → must match or return error

Errors:

- `MODULE_VERSION_NOT_FOUND`
- `MODULE_VERSION_UNSUPPORTED`

---

## 5. Identity & Signing

Each request must include:

- `sender_id`
- `sender_key_type`
- `sender_public_key`
- `signature_algorithm`
- `signature`

### 5.1 Supported Key Types (V1)

- `ed25519`

### 5.2 Future Support

- secp256k1
- post-quantum
- hybrid

---

## 6. Bootstrap Policy

### 6.1 Bootstrap Authorities

Defined at genesis.

Used to:

- register initial modules
- register organizations
- publish protocol

### 6.2 Constraints

Bootstrap access is:

- capability-based
- time-limited
- optional phase-limited

Bootstrap is **not permanent**.

---

## 7. Universal Message Envelope (Final V1)

```json
{
  "protocol_version": "2026.03.22.0",
  "message_id": "msg-001",
  "target_module": "modulr.core",
  "target_module_version": null,
  "operation": "register_org",

  "sender_id": "user:abc123",
  "sender_key_type": "ed25519",
  "sender_public_key": "PUBKEY_HERE",

  "timestamp": "2026-03-22T23:10:00Z",
  "expires_at": "2026-03-22T23:11:00Z",

  "payload": {},
  "payload_hash": "HASH_HERE",

  "signature_algorithm": "ed25519",
  "signature": "SIG_HERE"
}
```

---

## 8. Field Definitions

### protocol_version
Version of message protocol.

### message_id
Unique identifier for request tracking and replay protection.

### target_module
Logical destination module.

Examples:

- `modulr.core`
- `modulr.storage`

### target_module_version
Optional version constraint.

### operation
Function to execute on the module.

Examples:

- `register_org`
- `register_module`
- `lookup_module`
- `resolve_name`
- `heartbeat_update`

### sender_id
Stable identity reference.

Examples:

- `user:abc123`
- `org:modulr`
- `module:modulr.storage`

### timestamp
Creation time.

### expires_at
Expiration time.

### payload
Operation-specific data.

### payload_hash
Hash of payload for integrity verification.

### signature_algorithm
Signing algorithm.

### signature
Signed message.

---

## 9. Standard Response Envelope

```json
{
  "protocol_version": "2026.03.22.0",
  "message_id": "msg-002",
  "correlation_id": "msg-001",

  "target_module": "modulr.core",
  "target_module_version": "2026.03.22.0",
  "operation": "register_org_response",

  "timestamp": "2026-03-22T23:10:01Z",

  "status": "success",
  "code": "ORG_REGISTERED",
  "detail": "Organization registered successfully.",

  "payload": {},
  "payload_hash": "HASH_HERE",

  "signature_algorithm": "ed25519",
  "signature": "SIG_HERE"
}
```

---

## 10. Core Operations (V1)

### register_module
Registers a module with Core.

### lookup_module
Returns routing information for a module.

### register_org
Registers an organization.

### register_name
Registers a user or org name.

### resolve_name
Resolves name → identity/route.

### reverse_resolve_name
Resolves identity → name.

### heartbeat_update
Module status update.

### get_protocol_version
Returns current protocol version.

### get_module_functions
Returns supported operations for a module.

---

## 11. Routing Behavior

- Requests are sent to a specific module (`target_module`)
- Payload may reference other modules
- Core acts as resolver for routing

Example:

- send request to `modulr.core`
- operation: `lookup_module`
- payload: `{ "module_name": "modulr.storage" }`

---

## 12. Error Handling

Examples:

- `TARGET_MODULE_MISMATCH`
- `UNSUPPORTED_OPERATION`
- `MODULE_NOT_FOUND`
- `SIGNATURE_INVALID`
- `MESSAGE_EXPIRED`

---

## 13. Reserved Namespaces

### Core
- `register_*`
- `lookup_*`
- `resolve_*`

### Assets
- `balance_*`
- `transaction_*`

### Storage
- `store`
- `retrieve`

### Validator (future)
- `validator.sync.*`
- `validator.consensus.*`

---

## 14. Summary

This V1 protocol defines:

- a minimal universal envelope
- module-based routing
- operation-driven execution
- signed identity model
- bootstrap bring-up strategy

It is intentionally lean and ready for implementation.

---

## Next Step

Implement `modulr.core` using:

- HTTP endpoints
- JSON envelope
- operation routing
- signature verification

Then register:

1. `modulr.core`
2. `modulr.assets`
3. `modulr.storage`

and expand from there.

