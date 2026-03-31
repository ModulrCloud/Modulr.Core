"""HTTP API (FastAPI)."""

from modulr_core.http.config_resolve import resolve_config_path

__all__ = [
    "create_app",
    "resolve_config_path",
]


def __getattr__(name: str):
    # Lazy import avoids import cycle: handlers → envelope → http (this) → app → dispatch → handlers.
    if name == "create_app":
        from modulr_core.http.app import create_app as _create_app

        return _create_app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
