#!/usr/bin/env python3
"""
Cyntra Rollout Builder Skill

Build canonical rollout.json from telemetry + proof + fab manifests.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Add cyntra-kernel to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root / "cyntra-kernel" / "src"))

from cyntra.cyntra.rollouts.builder import build_rollout, write_rollout


def execute(
    workcell_path: str | Path,
    include_trajectory_details: bool = False,
) -> dict[str, Any]:
    """
    Build rollout.json for a workcell.

    Args:
        workcell_path: Path to workcell directory
        include_trajectory_details: Include full tool call details (not yet implemented)

    Returns:
        {
            "rollout_path": str,
            "rollout_id": str,
            "summary": {...}
        }
    """
    wc_path = Path(workcell_path)

    if not wc_path.exists():
        return {
            "success": False,
            "error": f"Workcell path does not exist: {workcell_path}"
        }

    # Build and write rollout
    rollout_path = write_rollout(wc_path)

    if rollout_path is None:
        return {
            "success": False,
            "error": "Failed to build rollout (missing proof.json or write error)"
        }

    # Read back for summary
    rollout = json.loads(rollout_path.read_text())

    summary = {
        "job_type": rollout.get("job_type"),
        "toolchain": rollout.get("policy", {}).get("toolchain"),
        "all_passed": rollout.get("outcomes", {}).get("verification", {}).get("all_passed"),
        "tool_summary": rollout.get("trajectory", {}).get("tool_summary", {}),
        "diff_lines": rollout.get("scores", {}).get("diff_lines", 0),
    }

    if "duration_ms" in rollout.get("scores", {}):
        summary["duration_ms"] = rollout["scores"]["duration_ms"]

    return {
        "success": True,
        "rollout_path": str(rollout_path),
        "rollout_id": rollout.get("rollout_id"),
        "summary": summary,
    }


def main():
    """CLI entrypoint for testing."""
    import argparse

    parser = argparse.ArgumentParser(description="Build rollout.json from workcell")
    parser.add_argument("workcell_path", help="Path to workcell directory")
    parser.add_argument("--details", action="store_true", help="Include trajectory details")

    args = parser.parse_args()

    result = execute(args.workcell_path, args.details)
    print(json.dumps(result, indent=2))

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
