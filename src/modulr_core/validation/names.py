"""Modulr name shapes for ``resolve_name`` (handles, org domains, scoped identities).

Supported forms (MVP):

- **``@handle``** — user-style handle (e.g. ``@chris``). Used across the network and
  with **Modulr.Web** for pages tied to a user.
- **``user@domain.subdomain``** — scoped identity (like a JID): local part ``@`` domain
  with at least one dot in the domain (so org-style DNS labels). Also intended for
  **Modulr.Web** and routed messages.
- **``domain.subdomain``** — organization / zone style with no ``@`` (multi-label
  DNS-like form). Used in ``resolve_name`` for lookups (may include more than one dot).

**Core registry (``register_org``, ``register_module``):** apex names only — **at most
one** dot (single label ``acme`` or two labels ``acme.network``). Deeper paths such as
``labs.acme.network`` are **not** registered on Core; they are delegated to the parent
apex (same idea as DNS).

Normalization: strip leading/trailing ASCII whitespace; empty after strip is invalid.
"""

from __future__ import annotations

import re

from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import WireValidationError

# Labels: LDH plus underscore; avoid leading/trailing hyphen for domain parts.
_LABEL = r"(?:[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?)"
_DOMAIN_DOT = rf"{_LABEL}(?:\.{_LABEL})+"  # at least one dot between labels

_HANDLE_BODY = r"[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,254}"
_HANDLE_RE = re.compile(rf"^@(?P<local>{_HANDLE_BODY})$")

# user@domain.tld — domain part must contain a dot (org / subdomain routing).
_SCOPED_RE = re.compile(
    rf"^(?P<local>{_HANDLE_BODY})@(?P<domain>{_DOMAIN_DOT})$",
)

_ORG_DOMAIN_RE = re.compile(rf"^{_DOMAIN_DOT}$")
# register_org / register_module: at most one dot between two labels (or a single label).
_APEX_TWO_LABELS = re.compile(rf"^{_LABEL}\.{_LABEL}$")


_MAX_RESOLVED_ID_LEN = 512


def validate_resolved_id(raw: str) -> str:
    """Return stripped ``resolved_id`` for name bindings (opaque identity string)."""
    s = raw.strip()
    if not s:
        raise WireValidationError(
            "resolved_id must be a non-empty string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if len(s) > _MAX_RESOLVED_ID_LEN:
        raise WireValidationError(
            "resolved_id exceeds maximum length",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return s


def validate_modulr_core_registry_apex_name(
    name: str,
    *,
    field_label: str,
    invalid_code: ErrorCode,
) -> str:
    """Validate an apex name stored on Core (org or module): at most one dot.

    Single-label (``modulr``) or two labels (``modulr.core``, ``acme.network``). More than
    one dot is reserved for delegated names resolved by the parent apex.
    """
    s = name.strip()
    if not s:
        raise WireValidationError(
            f"{field_label} must be a non-empty string",
            code=invalid_code,
        )
    if len(s) > 512:
        raise WireValidationError(
            f"{field_label} exceeds maximum length",
            code=invalid_code,
        )
    if s.count(".") > 1:
        raise WireValidationError(
            f"{field_label} must contain at most one dot (Core registers apex names only; "
            "deeper labels are delegated to the parent).",
            code=invalid_code,
        )
    if "." not in s:
        if not re.fullmatch(_LABEL, s):
            raise WireValidationError(
                f"{field_label} must be a single DNS-style label (letters, digits, underscore; "
                "no leading/trailing hyphen).",
                code=invalid_code,
            )
    elif not _APEX_TWO_LABELS.fullmatch(s):
        raise WireValidationError(
            f"{field_label} must be label.label (e.g. modulr.core or acme.network).",
            code=invalid_code,
        )
    return s


def validate_modulr_org_domain(name: str) -> str:
    """Return stripped org name for ``register_org``: apex only (at most one dot)."""
    return validate_modulr_core_registry_apex_name(
        name,
        field_label="organization_name",
        invalid_code=ErrorCode.INVALID_NAME,
    )


def validate_modulr_resolve_name(name: str) -> str:
    """Return stripped ``name`` if it matches a supported Modulr name form.

    Raises:
        WireValidationError: ``INVALID_NAME`` if the string is not allowed.
    """
    s = name.strip()
    if not s:
        _fail("name must be a non-empty string", ErrorCode.INVALID_NAME)
    if len(s) > 512:
        _fail("name exceeds maximum length", ErrorCode.INVALID_NAME)
    if _HANDLE_RE.match(s) or _SCOPED_RE.match(s) or _ORG_DOMAIN_RE.match(s):
        return s
    _fail(
        "name must be @handle, user@domain.subdomain, or domain.subdomain form",
        ErrorCode.INVALID_NAME,
    )


def _fail(msg: str, code: ErrorCode) -> None:
    raise WireValidationError(msg, code=code)
