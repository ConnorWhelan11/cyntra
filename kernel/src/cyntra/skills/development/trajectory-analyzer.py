#!/usr/bin/env python3
"""
Trajectory Analyzer Skill

Compute tool usage stats, file change summaries, transition boundaries.
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


def analyze_tool_usage(rollout: dict[str, Any]) -> dict[str, Any]:
    """Analyze tool usage patterns from rollout."""
    trajectory = rollout.get("trajectory", {})
    tool_summary = trajectory.get("tool_summary", {})

    total_tools = sum(tool_summary.values())

    return {
        "total_tool_calls": total_tools,
        "by_tool": tool_summary,
        "most_used": max(tool_summary.items(), key=lambda x: x[1])[0] if tool_summary else None,
    }


def analyze_file_changes(rollout: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract file changes from rollout."""
    trajectory = rollout.get("trajectory", {})
    file_changes = trajectory.get("file_changes", [])

    # Ensure each change has required fields
    normalized = []
    for change in file_changes:
        if isinstance(change, dict):
            normalized.append(
                {
                    "path": change.get("path"),
                    "kind": change.get("kind", "modified"),
                }
            )
        elif isinstance(change, str):
            normalized.append(
                {
                    "path": change,
                    "kind": "modified",
                }
            )

    return normalized


def extract_transitions(rollout: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Extract T1 state transitions from rollout.

    This is a simplified version - full implementation would parse telemetry.
    """
    from cyntra.dynamics.state_t1 import bucket_diff_lines, bucket_files_touched, build_state_t1

    # Get basic state info
    job_type = rollout.get("job_type", "code")
    policy = rollout.get("policy", {})
    scores = rollout.get("scores", {})
    outcomes = rollout.get("outcomes", {})

    diff_lines = scores.get("diff_lines", 0)
    file_changes = rollout.get("trajectory", {}).get("file_changes", [])

    # Build initial state features (simplified)
    initial_features = {
        "phase": "start",
        "diff_bucket": "0",
        "files_touched_bucket": "0",
    }

    # Build final state features
    verification = outcomes.get("verification", {})
    all_passed = verification.get("all_passed", False)

    final_features = {
        "phase": "completed" if all_passed else "failed",
        "diff_bucket": bucket_diff_lines(diff_lines),
        "files_touched_bucket": bucket_files_touched(len(file_changes)),
    }

    # Determine domain
    domain = ("fab_asset" if "asset" in job_type else "fab_world") if "fab" in job_type else "code"

    # Build T1 states
    initial_state = build_state_t1(
        domain=domain,
        job_type=job_type,
        features=initial_features,
        policy_key={
            "toolchain": policy.get("toolchain"),
            "model": policy.get("model"),
        },
    )

    final_state = build_state_t1(
        domain=domain,
        job_type=job_type,
        features=final_features,
        policy_key={
            "toolchain": policy.get("toolchain"),
            "model": policy.get("model"),
        },
    )

    return [
        {
            "from_state": initial_state["state_id"],
            "to_state": final_state["state_id"],
            "transition_kind": "workcell_completion",
        }
    ]


def execute(
    rollout_path: str | Path,
    compute_transitions: bool = False,
) -> dict[str, Any]:
    """
    Analyze trajectory from rollout.

    Args:
        rollout_path: Path to rollout.json
        compute_transitions: Compute T1 state transitions

    Returns:
        {
            "tool_summary": {...},
            "file_changes": [...],
            "transitions": [...],
            "metrics": {...}
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

    # Analyze tool usage
    tool_summary = analyze_tool_usage(rollout)

    # Analyze file changes
    file_changes = analyze_file_changes(rollout)

    # Extract metrics
    scores = rollout.get("scores", {})
    metrics = {
        "diff_lines": scores.get("diff_lines", 0),
        "risk": scores.get("risk", "unknown"),
    }

    if "duration_ms" in scores:
        metrics["duration_ms"] = scores["duration_ms"]

    if "cost_usd" in scores:
        metrics["cost_usd"] = scores["cost_usd"]

    # Add outcome
    verification = rollout.get("outcomes", {}).get("verification", {})
    metrics["all_passed"] = verification.get("all_passed", False)
    metrics["blocking_failures_count"] = len(verification.get("blocking_failures", []))

    # Compute transitions if requested
    transitions = []
    if compute_transitions:
        transitions = extract_transitions(rollout)

    return {
        "success": True,
        "tool_summary": tool_summary,
        "file_changes": file_changes,
        "transitions": transitions,
        "metrics": metrics,
    }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Analyze trajectory from rollout")
    parser.add_argument("rollout_path", help="Path to rollout.json")
    parser.add_argument("--transitions", action="store_true", help="Compute transitions")
    parser.add_argument("--output", help="Output path for analysis JSON")

    args = parser.parse_args()

    result = execute(args.rollout_path, args.transitions)

    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
