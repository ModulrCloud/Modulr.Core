"""Release and protocol module version (calendar-style `YYYY.M.D.N`).

Use **PEP 440 canonical** segments (no leading zeros), e.g. ``2026.3.22.0``, so
``importlib.metadata.version("modulr-core")`` matches ``MODULE_VERSION`` after install.

Keep in sync with ``[project].version`` in ``pyproject.toml`` until automated.
"""

MODULE_VERSION = "2026.3.22.0"

__version__ = MODULE_VERSION
