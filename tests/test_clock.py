"""modulr_core.clock — epoch time source for pipeline logic."""

import time

from modulr_core.clock import now_epoch_seconds


def test_now_epoch_seconds_matches_process_clock() -> None:
    before = time.time()
    n = now_epoch_seconds()
    after = time.time()
    assert before <= n <= after
    assert isinstance(n, float)
