"""Repo path helpers for Blender scripts in the Outora Library.

Blender scripts run under `bpy` and are often executed from arbitrary working
directories (headless runs, UI console, etc). These helpers make it easy to
resolve repo-relative paths without hard-coding machine-specific absolute paths.
"""

from __future__ import annotations

import sys
from pathlib import Path


def blender_dir() -> Path:
    """Return the `fab/outora-library/blender/` directory."""
    return Path(__file__).resolve().parent


def repo_root() -> Path:
    """Return the `fab/outora-library/` directory."""
    return blender_dir().parent


def assets_dir() -> Path:
    """Return the `fab/outora-library/assets/` directory."""
    return repo_root() / "assets"


def export_dir() -> Path:
    """Return the `fab/outora-library/export/` directory."""
    return repo_root() / "export"


def ensure_blender_dir_on_path() -> None:
    """Ensure the Blender scripts directory is importable."""
    scripts_dir = blender_dir()
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))


def ensure_src_on_path() -> None:
    """Ensure `fab/outora-library/src/` is importable."""
    src_dir = repo_root() / "src"
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

