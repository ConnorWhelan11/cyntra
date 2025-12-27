#!/usr/bin/env python3
"""
Potential Fitter Skill

Solve graph Laplacian for V(state) from reversible edge log-ratios.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[5]
kernel_src = repo_root / "kernel" / "src"
if kernel_src.exists():
    sys.path.insert(0, str(kernel_src))


def execute(
    transition_matrix: dict[str, Any],
    anchor_state: str | None = None,
    regularization: float = 0.01,
) -> dict[str, Any]:
    """
    Fit potential landscape from transition probabilities.

    Args:
        transition_matrix: Sparse transition probability matrix
        anchor_state: State to anchor at V=0 (or None for auto-select)
        regularization: Ridge regularization parameter

    Returns:
        {
            "potential": [...],
            "fit_quality": {...},
            "non_equilibrium_drives": [...]
        }
    """
    try:
        from cyntra.dynamics.potential import fit_potential

        result = fit_potential(
            transition_matrix=transition_matrix,
            anchor_state=anchor_state,
            regularization=regularization,
        )

        return {
            "success": True,
            **result,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to fit potential: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Fit potential from transition matrix")
    parser.add_argument("matrix_path", help="Path to transition matrix JSON")
    parser.add_argument("--anchor", help="Anchor state ID")
    parser.add_argument("--regularization", type=float, default=0.01, help="Ridge parameter")
    parser.add_argument("--output", help="Output path for potential JSON")

    args = parser.parse_args()

    matrix_path = Path(args.matrix_path)
    if not matrix_path.exists():
        print(f"Error: Matrix file not found: {args.matrix_path}", file=sys.stderr)
        sys.exit(1)

    transition_matrix = json.loads(matrix_path.read_text())

    result = execute(
        transition_matrix=transition_matrix,
        anchor_state=args.anchor,
        regularization=args.regularization,
    )

    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
