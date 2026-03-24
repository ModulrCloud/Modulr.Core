import re

import modulr_core

# Calendar-style with PEP 440–canonical segments (e.g. 2026.3.22.0, not 2026.03.22.0).
_MODULE_VERSION_RE = re.compile(r"^\d{4}\.\d+\.\d+\.\d+$")


def test_version_strings_present() -> None:
    assert modulr_core.__version__
    assert isinstance(modulr_core.__version__, str)
    assert modulr_core.MODULE_VERSION
    assert modulr_core.__version__ == modulr_core.MODULE_VERSION


def test_module_version_format() -> None:
    assert _MODULE_VERSION_RE.match(modulr_core.MODULE_VERSION)
