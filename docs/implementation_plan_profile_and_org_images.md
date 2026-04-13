# Profile and org images: implementation notes

## What shipped

- **SQLite migration `011`**: `core_genesis` columns for  
  `genesis_root_org_logo_svg`, `bootstrap_operator_profile_image` (BLOB), `bootstrap_operator_profile_image_mime`.
- **Genesis complete** (`POST /genesis/complete`): optional JSON fields  
  `root_organization_logo_svg`,  
  `bootstrap_operator_profile_image_base64`,  
  `bootstrap_operator_profile_image_mime`  
  with server-side size and MIME allowlist (PNG, JPEG, WebP, GIF; SVG max size for logo text).
- **Read API**: `GET /genesis/branding` returns labels, SVG text, and base64 + MIME for the profile image.
- **Frontend**: shell logo (`ShellOrgLogo`), `useGenesisBranding`, genesis wizard sends assets on complete; Settings can prefer Core profile when available.

## Local vs server

- **Genesis wizard** uses **wizard-local state** for the operator avatar (not the shared Settings `profileAvatarDataUrl`) so first-boot does not silently reuse or overwrite the Settings profile.
- **Settings** may still use **localStorage** for a draft avatar until a **signed profile-update** operation exists.

## Future work

- **Signed** `POST /message` (or dedicated route) to **update** branding after genesis, with proof of operator identity.
- **Stricter** SVG sanitization if logos ever render as raw HTML (today served as image `src` data URL / img).
