"""Path helpers for the Outora Library repo layout."""

from __future__ import annotations

from pathlib import Path


def project_root() -> Path:
    """
    Return the `fab/assets/` directory when running from a source checkout.

    For an installed wheel, this will resolve to the installed package location and
    may not include bundled Blender assets.
    """
    # `.../kernel/src/cyntra/fab/outora/paths.py`
    repo_root = Path(__file__).resolve().parents[5]
    return repo_root / "fab" / "assets"


def blender_dir() -> Path:
    """Return the `blender/` directory under the source checkout."""
    return project_root() / "blender"


def default_library_blend() -> Path:
    """Default library `.blend` path used by tooling in this repo."""
    return blender_dir() / "outora_library_v0.4.0.blend"
