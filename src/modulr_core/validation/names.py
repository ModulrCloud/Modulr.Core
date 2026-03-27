"""Modulr name shapes for ``resolve_name`` (handles, org domains, scoped identities).

Supported forms (MVP):

- **``@handle``** — user-style handle (e.g. ``@chris``). Used across the network and
  with **Modulr.Web** for pages tied to a user.
- **``user@domain.subdomain``** — scoped identity (like a JID): local part ``@`` domain
  with at least one dot in the domain (so org-style DNS labels). Also intended for
  **Modulr.Web** and routed messages.
- **``domain.subdomain``** — organization / zone style with no ``@`` (at least one
  ``.`` in the name). Does not cover bare single-label org exceptions (e.g. reserved
  ``modulr``); those can be added later.

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
