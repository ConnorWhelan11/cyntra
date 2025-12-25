#!/usr/bin/env python3
"""
Action Metric Calculator Skill

Compute trajectory action, entropy production, detect trapping.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root / "cyntra-kernel" / "src"))

from cyntra.cyntra.dynamics.action import compute_action


def execute(
    rollout_path: str | Path,
    transition_matrix: dict[str, Any],
) -> dict[str, Any]:
    """
    Compute action metrics for rollout.

    Args:
        rollout_path: Path to rollout.json with state trajectory
        transition_matrix: Transition probabilities for action calculation

    Returns:
        {
            "trajectory_action": float,
            "action_rate": float,
            "trapping_detected": bool,
            "per_transition_action": [...]
        }
    """
    rollout_path = Path(rollout_path)

    if not rollout_path.exists():
        return {
            "success": False,
            "error": f"Rollout not found: {rollout_path}",
        }

    try:
        rollout = json.loads(rollout_path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        return {
            "success": False,
            "error": f"Failed to read rollout: {e}",
        }

    try:
        result = compute_action(
            rollout=rollout,
            transition_matrix=transition_matrix,
        )

        return {
            "success": True,
            **result,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to compute action: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Compute action metrics for rollout")
    parser.add_argument("rollout_path", help="Path to rollout.json")
    parser.add_argument("matrix_path", help="Path to transition matrix JSON")
    parser.add_argument("--output", help="Output path for action metrics JSON")

    args = parser.parse_args()

    matrix_path = Path(args.matrix_path)
    if not matrix_path.exists():
        print(f"Error: Matrix file not found: {args.matrix_path}", file=sys.stderr)
        sys.exit(1)

    transition_matrix = json.loads(matrix_path.read_text())

    result = execute(
        rollout_path=args.rollout_path,
        transition_matrix=transition_matrix,
    )

    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
