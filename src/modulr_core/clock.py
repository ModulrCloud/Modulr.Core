"""Single place to read “current time” for protocol logic.

All Modulr.Core comparison times are **Unix epoch seconds** (``time.time()``-style
``float``): seconds since 1970-01-01 00:00:00 UTC, independent of the host
**time zone** setting.

Call :func:`now_epoch_seconds` from validation, replay windows, and expiry checks
so the implementation can later be swapped for:

- agreed validator **network time** (median / consensus), or
- any replacement scheme without rewiring the pipeline.

**Note:** A single shared float epoch is one model of simultaneity. Very large
separations (e.g. different planetary frames) may eventually need a richer
time contract on the wire; this module is the hook where that logic would live.
"""

from __future__ import annotations

import time
from typing import Protocol, runtime_checkable


def now_epoch_seconds() -> float:
    """Return the current instant as Unix epoch seconds (see module docstring)."""
    return time.time()


@runtime_checkable
class EpochClock(Protocol):
    """Callable returning the current epoch instant (for tests / future backends)."""

    def __call__(self) -> float: ...
