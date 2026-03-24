"""Modulr.Core reference implementation (Python package ``modulr_core``)."""

from modulr_core.errors import ErrorCode, SuccessCode
from modulr_core.version import MODULE_VERSION, __version__

__all__ = ["MODULE_VERSION", "__version__", "ErrorCode", "SuccessCode"]
