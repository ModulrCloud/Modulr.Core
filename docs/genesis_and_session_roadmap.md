# Genesis and session roadmap

How **first-boot genesis** fits with **shell sign-in** and **sessions** in Modulr.Core.

## Implemented today

- **Unsigned genesis HTTP** (local/testnet only when `genesis_operations_allowed`):  
  `POST /genesis/challenge` → `POST /genesis/challenge/verify` → `POST /genesis/complete`.
- **Persistence** in SQLite (`core_genesis`, `genesis_challenge`, `name_bindings`), including optional **root org SVG logo** and **bootstrap operator profile image** on complete.
- **Read** branding: `GET /genesis/branding` (unsigned JSON, like `GET /version`).
- **Customer UI** wizard (`GenesisNoticeModal`) and shell header use Core when `genesis_complete` is true.

## Near-term

- **Keymaster-style shell sign-in**: operator proves control of a key by signing a **challenge** (already the model for genesis). The same pattern is intended for **session bootstrap** (e.g. establish a session after verify, not only for genesis).
- **Session tiers** (conceptual):  
  - **Anonymous / read-only**: public metadata (`GET /version`, `GET /genesis/branding`).  
  - **Authenticated**: signed `POST /message` with replay and policy checks.  
  - **Bootstrap / admin**: genesis routes gated by environment and one-time challenges.

## Not yet specified in code

- Long-lived **cookie or bearer sessions** for the shell.
- **Rotation** of bootstrap operator identity or org keys after genesis.
- **Production** genesis policy (disabled by default; production uses pre-provisioned trust).

See also: [`implementation_plan_profile_and_org_images.md`](implementation_plan_profile_and_org_images.md).
