---
name: google-python-docstrings
description: >-
  Writes and updates Python docstrings using Google style (Args, Returns,
  Raises), wrapped within Ruff line-length (88). Use when adding or editing
  Python documentation, docstrings, API comments, handler descriptions, or
  when the user asks for Google-style or consistent module/function docs.
  Requires updating docstrings in the same edit whenever implementation,
  behavior, signatures, or wire contracts change.
---

# Google-style Python docstrings

## Docstrings must track the code (non-optional)

- **Any change** to what the code **does**, **accepts**, **returns**, or **raises**
  must include an **updated docstring in the same change** (same PR / same
  commit series). Treat a stale docstring as a bug.
- Applies to **refactors**, **bug fixes**, **new parameters**, **payload keys**,
  **HTTP/wire shapes**, and **removed behavior** (delete or rewrite sections).
- If the agent edits a function, method, or class body, it **must** re-read the
  docstring and align it before finishing—do not leave documentation describing
  old behavior.

## Defaults

- Use **`"""`** (double quotes) for all docstrings.
- For anything beyond a one-line summary, put a **newline immediately after** the opening `"""`, then paragraphs (matches Modulr.Core / PEP 257 readability).
- Prefer **Google-style** sections: **`Args:`**, **`Returns:`**, **`Raises:`**; add **`Yields:`**, **`Attributes:`** (classes), or **`Note:`** only when useful.
- Inline code in docstrings: wrap identifiers with **doubled** grave accents in the `.py` source (Sphinx-friendly), matching `handle_get_protocol_methods` in `handlers.py`.

## Line length (Ruff E501)

- **Each physical line** of the source file must stay within the project **`line-length`** (Modulr.Core: **88**), including indentation.
- Wrap prose and **Args**/**Returns** continuations onto new lines with extra indent under the parameter name (Google convention).
- Do **not** rely on a global “ignore docstrings” rule; wrap instead.

## Section templates

**Function / method (typical):**

```python
def example(a: str, b: int) -> bool:
    """
    One-line summary; optional extra sentences on following lines.

    Longer context: purpose, wire contract, or how this differs from siblings.

    Args:
        a: Meaning and constraints.
        b: Meaning; mention defaults only if not obvious from signature.

    Returns:
        What is returned and any important shape or semantics.

    Raises:
        SomeError: When and why.
    """
```

**Raises:** omit the section if nothing is raised, or write `Raises: None.` only if the project already uses that pattern (otherwise omit).

**Class:**

```python
class Example:
    """
    Short summary of the class role.

    Attributes:
        name: Public attribute meaning.
    """
```

## Keep docs honest

- Same rule as above: **implementation and docstring stay in lockstep**; update
  tests when public contract changes.
- Remove or rewrite sections that no longer apply; do not append contradictory
  paragraphs—replace outdated text.

## Related

- Before **committing**, follow **`pre-commit-checks`** (pytest, Ruff, frontend
  build) so local results match CI.
- Before adding **dependencies**, follow **`verify-package-before-install`** so
  registry and security checks run and the user approves installs.

## Reuse outside this repo

- Copy the folder `.cursor/skills/google-python-docstrings/` into **`~/.cursor/skills/`** on any machine to use the same rules in other Cursor projects.
