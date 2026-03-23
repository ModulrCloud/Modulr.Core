import re

import modulr_core

_MODULE_VERSION_RE = re.compile(r"^\d{4}\.\d{2}\.\d{2}\.\d+$")


def test_version_strings_present() -> None:
    assert modulr_core.__version__
    assert isinstance(modulr_core.__version__, str)
    assert modulr_core.MODULE_VERSION
    assert modulr_core.__version__ == modulr_core.MODULE_VERSION


def test_module_version_format() -> None:
    assert _MODULE_VERSION_RE.match(modulr_core.MODULE_VERSION)
