"""Parse cached HTTP response bodies stored in ``message_dedup.result_summary``."""

from __future__ import annotations

import json
from typing import Any


def parse_stored_response_envelope(result_summary: str | None) -> dict[str, Any] | None:
    """Return a response dict if ``result_summary`` holds JSON from a prior success."""
    if not result_summary or not result_summary.strip():
        return None
    s = result_summary.strip()
    if not s.startswith("{"):
        return None
    try:
        parsed: Any = json.loads(s)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict) and "status" in parsed:
        return parsed
    return None
