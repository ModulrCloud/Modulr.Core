# Partner-visible methods (idea)

**Status:** design sketch only — **not implemented** in Modulr.Core as a separate feature.

## Intent

Some operations may need to be **visible or invocable across organizational boundaries** (“partner” methods), for example:

- Federated discovery of modules or routes.
- Shared audit or attestation payloads.
- Delegated actions where both orgs have pre-authorized a contract.

## Constraints

- **Wire format** remains the signed `POST /message` envelope; there is no second protocol.
- **Authorization** is policy: which operations which keys may call, possibly with namespaced operation strings or explicit allowlists.
- **Privacy**: anything “partner-visible” must be explicit in the protocol and schema; **default is org-private**.

## Next steps (when implemented)

- Enumerate candidate operations and map them to existing handlers.
- Define **which metadata** is safe to expose cross-org vs kept in `name_bindings` / internal tables only.

This document exists so README can point at a stable place for the idea without implying it ships today.
