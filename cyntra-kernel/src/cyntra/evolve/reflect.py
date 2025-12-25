"""
Reflection stubs for prompt evolution.
"""

from __future__ import annotations

from typing import Any


def reflect_on_failures(
    rollouts: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Placeholder reflection hook.

    The GEPA optimizer handles mutation; reflection can be added later for
    structured prompt patching.
    """
    return {
        "summary": "reflection not implemented",
        "rollout_count": len(rollouts),
    }

