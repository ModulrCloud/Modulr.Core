"""Dispatch validated envelopes to operation handlers."""

from __future__ import annotations

import sqlite3
from typing import Any

from modulr_core.clock import EpochClock
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import WireValidationError
from modulr_core.messages.types import ValidatedInbound
from modulr_core.operations.handlers import (
    handle_get_module_functions,
    handle_get_protocol_version,
    handle_heartbeat_update,
    handle_lookup_module,
    handle_register_module,
    handle_register_name,
    handle_register_org,
    handle_resolve_name,
    handle_reverse_resolve_name,
    handle_submit_module_route,
)

_HANDLERS = {
    "get_protocol_version": handle_get_protocol_version,
    "get_module_functions": handle_get_module_functions,
    "submit_module_route": handle_submit_module_route,
    "register_module": handle_register_module,
    "lookup_module": handle_lookup_module,
    "register_name": handle_register_name,
    "register_org": handle_register_org,
    "resolve_name": handle_resolve_name,
    "reverse_resolve_name": handle_reverse_resolve_name,
    "heartbeat_update": handle_heartbeat_update,
}


def dispatch_operation(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """Run the handler for ``validated.envelope["operation"]``.

    Returns:
        Response envelope dict (HTTP 200 body).

    Raises:
        WireValidationError: Business / payload errors after envelope verification.
    """
    op = validated.envelope["operation"]
    fn = _HANDLERS.get(op)
    if fn is None:
        raise WireValidationError(
            f"unsupported operation {op!r}",
            code=ErrorCode.UNSUPPORTED_OPERATION,
        )
    return fn(validated, settings=settings, conn=conn, clock=clock)
