"""Map wire :class:`~modulr_core.errors.codes.ErrorCode` values to HTTP status codes."""

from __future__ import annotations

from modulr_core.errors.codes import ErrorCode

# 413 Payload Too Large (request entity)
_PAYLOAD_TOO_LARGE = 413


_NOT_FOUND = frozenset({
    ErrorCode.MODULE_NOT_FOUND,
    ErrorCode.NAME_NOT_FOUND,
})
_CONFLICT = frozenset({
    ErrorCode.MODULE_ALREADY_REGISTERED,
    ErrorCode.NAME_ALREADY_BOUND,
    ErrorCode.MESSAGE_ID_CONFLICT,
})


def http_status_for_error_code(code: ErrorCode) -> int:
    """Return an HTTP status code for a wire error code (4xx/5xx)."""
    if code is ErrorCode.MESSAGE_TOO_LARGE:
        return _PAYLOAD_TOO_LARGE
    if code is ErrorCode.INTERNAL_ERROR:
        return 500
    if code is ErrorCode.OPERATION_NOT_IMPLEMENTED:
        return 501
    if code is ErrorCode.UNAUTHORIZED:
        return 403
    if code in _NOT_FOUND:
        return 404
    if code in _CONFLICT:
        return 409
    return 400
