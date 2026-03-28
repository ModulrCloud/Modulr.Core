"""Parity: Python ``canonical_json_str`` vs playground ``canonical_json.mjs`` (Node)."""

from __future__ import annotations

import json
import random
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from modulr_core.validation.canonical import canonical_json_str

REPO_ROOT = Path(__file__).resolve().parent.parent
NODE_SCRIPT = REPO_ROOT / "tests" / "canonical_parity_node.mjs"
VECTORS_PATH = REPO_ROOT / "tests" / "canonical_vectors.json"

NODE = shutil.which("node")
requires_node = pytest.mark.skipif(not NODE, reason="node not on PATH (required in CI)")


def _run_node(*args: str, stdin: str | None = None) -> str:
    assert NODE
    proc = subprocess.run(
        [NODE, str(NODE_SCRIPT), *args],
        input=stdin.encode("utf-8") if stdin is not None else None,
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(
            f"node failed ({proc.returncode}): {proc.stderr.decode()!r}"
        )
    return proc.stdout.decode("utf-8")


@requires_node
def test_vectors_match_node() -> None:
    rel = VECTORS_PATH.relative_to(REPO_ROOT)
    raw = _run_node("vectors-file", str(rel))
    node_rows = json.loads(raw)
    vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    assert len(node_rows) == len(vectors)
    for row, v in zip(node_rows, vectors, strict=True):
        assert row["id"] == v["id"]
        py = canonical_json_str(v["value"])
        assert row["canonical"] == py, (v["id"], py, row["canonical"])


@requires_node
def test_negzero_matches_node() -> None:
    node_out = _run_node("negzero").strip()
    py_out = canonical_json_str({"x": -0.0})
    assert node_out == py_out


# JSON numbers are untyped in JS: ``0.0`` round-trips as int ``0``, so Python ``0.0``
# vs ``0`` cannot be preserved. Use only non-integer floats; ``-0.0`` is covered by
# ``test_negzero_matches_node``.
_SAFE_FLOATS_FUZZ = (
    0.1,
    0.5,
    9e-5,
    1e-5,
    1e20,
    1732752000.456,
)


def _random_json_value(rng: random.Random, depth: int) -> Any:
    if depth <= 0:
        kind = rng.randrange(6)
        if kind == 0:
            return None
        if kind == 1:
            return rng.choice((True, False))
        if kind == 2:
            return rng.randint(-10_000_000, 10_000_000)
        if kind == 3:
            return rng.choice(_SAFE_FLOATS_FUZZ)
        if kind == 4:
            alphabet = "abcXYZ_é\u0100"
            n = rng.randint(0, 12)
            return "".join(rng.choice(alphabet) for _ in range(n))
        return ""

    kind = rng.randrange(5)
    if kind == 0:
        return _random_json_value(rng, 0)
    if kind == 1:
        n = rng.randint(0, 6)
        return [_random_json_value(rng, depth - 1) for _ in range(n)]
    n = rng.randint(0, 8)
    keys = []
    for _ in range(n):
        alphabet = "kmnopqrstuvwxyzAB\u00e9\u0101"
        key_len = rng.randint(1, 6)
        keys.append("".join(rng.choice(alphabet) for _ in range(key_len)))
    out: dict[str, Any] = {}
    for k in keys:
        out[k] = _random_json_value(rng, depth - 1)
    return out


@requires_node
def test_seeded_fuzz_recanonical_matches_python_wire() -> None:
    """Node must preserve Python canonical wire (parse + serialize = identity)."""
    rng = random.Random(42)
    cases = [_random_json_value(rng, 5) for _ in range(80)]
    wires = [canonical_json_str(c) for c in cases]
    stdin = json.dumps(wires, separators=(",", ":"), ensure_ascii=False)
    raw = _run_node("batch-canonical", stdin=stdin)
    assert json.loads(raw) == wires
