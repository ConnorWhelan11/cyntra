"""
Rollout storage helpers.
"""

from __future__ import annotations

from pathlib import Path


def rollout_path(workcell_path: Path) -> Path:
    """Return the rollout.json path for a workcell."""
    return workcell_path / "rollout.json"
