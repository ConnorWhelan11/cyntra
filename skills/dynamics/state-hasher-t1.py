#!/usr/bin/env python3
"""
State Hasher T1 Skill

Extract coarse-grained features and compute deterministic state_id.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[2]
kernel_src = repo_root / "kernel" / "src"
if kernel_src.exists():
    sys.path.insert(0, str(kernel_src))


def execute(
    snapshot: dict[str, Any],
    domain: str,
    job_type: str,
) -> dict[str, Any]:
    """
    Build T1 state from snapshot.

    Args:
        snapshot: State snapshot with features, policy, artifacts
        domain: Domain (code, fab_asset, fab_world)
        job_type: Job type (code.patch, fab.gate, etc.)

    Returns:
        {
            "state_id": str,
            "features": {...},
            "policy_key": {...}
        }
    """
    try:
        from cyntra.dynamics.state_t1 import build_state_t1

        features = snapshot.get("features", {})
        policy_key = snapshot.get("policy_key")
        artifact_digests = snapshot.get("artifact_digests")

        state = build_state_t1(
            domain=domain,
            job_type=job_type,
            features=features,
            policy_key=policy_key,
            artifact_digests=artifact_digests,
        )

        return {
            "success": True,
            "state_id": state["state_id"],
            "features": state["features"],
            "policy_key": state["policy_key"],
            "state": state,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to build state: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Build T1 state from snapshot")
    parser.add_argument("snapshot_json", help="Snapshot as JSON string or path")
    parser.add_argument("domain", choices=["code", "fab_asset", "fab_world"])
    parser.add_argument("job_type", help="Job type (e.g., code.patch)")

    args = parser.parse_args()

    # Try to parse as JSON, or load from file
    try:
        snapshot = json.loads(args.snapshot_json)
    except json.JSONDecodeError:
        snapshot_path = Path(args.snapshot_json)
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
        else:
            print(
                f"Error: Invalid JSON and file not found: {args.snapshot_json}",
                file=sys.stderr,
            )
            sys.exit(1)

    result = execute(snapshot, args.domain, args.job_type)
    print(json.dumps(result, indent=2))

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
