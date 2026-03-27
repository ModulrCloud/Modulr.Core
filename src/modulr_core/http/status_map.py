"""Map wire :class:`~modulr_core.errors.codes.ErrorCode` values to HTTP status codes."""

from __future__ import annotations

from modulr_core.errors.codes import ErrorCode

# 413 Payload Too Large (request entity)
_PAYLOAD_TOO_LARGE = 413


def http_status_for_error_code(code: ErrorCode) -> int:
    """Return an HTTP status code for a wire error code (4xx/5xx)."""
    if code is ErrorCode.MESSAGE_TOO_LARGE:
        return _PAYLOAD_TOO_LARGE
    if code is ErrorCode.INTERNAL_ERROR:
        return 500
    if code is ErrorCode.OPERATION_NOT_IMPLEMENTED:
        return 501
    return 400
