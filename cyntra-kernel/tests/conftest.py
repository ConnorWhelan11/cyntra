"""Pytest configuration for Cyntra (src layout)."""

from __future__ import annotations

import sys
from pathlib import Path


def pytest_configure() -> None:
    project_root = Path(__file__).resolve().parents[1]
    src_root = project_root / "src"
    sys.path.insert(0, str(src_root))
