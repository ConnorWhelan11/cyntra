#!/usr/bin/env python3
"""
Cyntra Dynamics Ingest Skill

Extract T1 states from trajectories and log transitions to SQLite DB.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root / "cyntra-kernel" / "src"))

from cyntra.cyntra.dynamics.state_t1 import build_state_t1, bucket_diff_lines, bucket_files_touched
from cyntra.cyntra.dynamics.transition_logger import TransitionLogger
from cyntra.cyntra.dynamics.transition_db import TransitionDB


def extract_states_from_rollout(rollout: dict[str, Any], domain: str) -> list[dict[str, Any]]:
    """Extract T1 states from rollout."""
    job_type = rollout.get("job_type", "code")
    policy = rollout.get("policy", {})
    scores = rollout.get("scores", {})
    outcomes = rollout.get("outcomes", {})
    trajectory = rollout.get("trajectory", {})

    diff_lines = scores.get("diff_lines", 0)
    file_changes = trajectory.get("file_changes", [])

    verification = outcomes.get("verification", {})
    all_passed = verification.get("all_passed", False)

    policy_key = {
        "toolchain": policy.get("toolchain"),
        "model": policy.get("model"),
    }

    states = []

    # Initial state
    initial_features = {
        "phase": "start",
        "diff_bucket": "0",
        "files_touched_bucket": "0",
    }

    states.append(build_state_t1(
        domain=domain,
        job_type=job_type,
        features=initial_features,
        policy_key=policy_key,
    ))

    # Final state
    final_features = {
        "phase": "completed" if all_passed else "failed",
        "diff_bucket": bucket_diff_lines(diff_lines),
        "files_touched_bucket": bucket_files_touched(len(file_changes)),
    }

    if not all_passed:
        blocking_failures = verification.get("blocking_failures", [])
        if blocking_failures:
            final_features["failing_gate"] = blocking_failures[0]

    states.append(build_state_t1(
        domain=domain,
        job_type=job_type,
        features=final_features,
        policy_key=policy_key,
    ))

    return states


def execute(
    rollout_path: str | Path,
    db_path: str | Path,
    domain: str,
) -> dict[str, Any]:
    """
    Ingest rollout into dynamics database.

    Args:
        rollout_path: Path to rollout.json
        db_path: Path to dynamics SQLite DB
        domain: Domain (code, fab_asset, fab_world)

    Returns:
        {
            "states_extracted": int,
            "transitions_logged": int,
            "state_ids": [...]
        }
    """
    rollout_path = Path(rollout_path)
    db_path = Path(db_path)

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

    # Extract states
    try:
        states = extract_states_from_rollout(rollout, domain)
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to extract states: {e}",
        }

    # Initialize DB
    try:
        db = TransitionDB(db_path)
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to initialize DB: {e}",
        }

    # Log states and transitions
    try:
        rollout_id = rollout.get("rollout_id", "unknown")
        issue_id = rollout.get("issue_id", "unknown")

        state_ids = []
        transitions_logged = 0

        # Log each state and transitions between them
        for i, state in enumerate(states):
            state_ids.append(state["state_id"])

            if i > 0:
                # Log transition from previous state
                prev_state = states[i - 1]
                db.log_transition(
                    from_state=prev_state["state_id"],
                    to_state=state["state_id"],
                    rollout_id=rollout_id,
                    issue_id=issue_id,
                    domain=domain,
                    job_type=rollout.get("job_type", "code"),
                )
                transitions_logged += 1

        return {
            "success": True,
            "states_extracted": len(states),
            "transitions_logged": transitions_logged,
            "state_ids": state_ids,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to log to DB: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Ingest rollout into dynamics DB")
    parser.add_argument("rollout_path", help="Path to rollout.json")
    parser.add_argument("db_path", help="Path to dynamics SQLite DB")
    parser.add_argument("domain", choices=["code", "fab_asset", "fab_world"], help="Domain")

    args = parser.parse_args()

    result = execute(args.rollout_path, args.db_path, args.domain)
    print(json.dumps(result, indent=2))

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
