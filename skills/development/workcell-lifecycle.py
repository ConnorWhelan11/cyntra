#!/usr/bin/env python3
"""
Workcell Lifecycle Skill

Create/verify/cleanup git worktree workcells with proper isolation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Add cyntra-kernel to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root / "cyntra-kernel" / "src"))

from cyntra.kernel.config import KernelConfig
from cyntra.workcell.manager import WorkcellManager


def execute(
    action: str,
    issue_id: str | None = None,
    workcell_id: str | None = None,
    forbidden_paths: list[str] | None = None,
) -> dict[str, Any]:
    """
    Manage workcell lifecycle.

    Args:
        action: create, verify, cleanup, cleanup-all
        issue_id: Issue ID (required for create)
        workcell_id: Workcell ID (required for verify/cleanup)
        forbidden_paths: Paths that should not be accessible

    Returns:
        {
            "workcell_id": str,
            "workcell_path": str,
            "branch_name": str,
            "status": str
        }
    """
    if forbidden_paths is None:
        forbidden_paths = [".beads/", ".cyntra/", ".cyntra/secrets/"]

    # Load kernel config
    try:
        config = KernelConfig.load(repo_root)
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to load kernel config: {e}",
        }

    manager = WorkcellManager(config, repo_root)

    if action == "create":
        if not issue_id:
            return {
                "success": False,
                "error": "issue_id required for create action",
            }

        try:
            workcell_path = manager.create(issue_id)
            workcell_id = workcell_path.name

            # Verify forbidden paths are removed
            violations = []
            for forbidden in forbidden_paths:
                check_path = workcell_path / forbidden
                if check_path.exists():
                    violations.append(forbidden)

            if violations:
                return {
                    "success": False,
                    "error": f"Forbidden paths still exist: {violations}",
                    "workcell_id": workcell_id,
                    "workcell_path": str(workcell_path),
                }

            # Extract branch name from git
            import subprocess
            result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=workcell_path,
                capture_output=True,
                text=True,
            )
            branch_name = result.stdout.strip() if result.returncode == 0 else "unknown"

            return {
                "success": True,
                "workcell_id": workcell_id,
                "workcell_path": str(workcell_path),
                "branch_name": branch_name,
                "status": "created",
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to create workcell: {e}",
            }

    elif action == "verify":
        if not workcell_id:
            return {
                "success": False,
                "error": "workcell_id required for verify action",
            }

        workcell_path = config.workcells_dir / workcell_id

        if not workcell_path.exists():
            return {
                "success": False,
                "error": f"Workcell not found: {workcell_id}",
            }

        # Verify it's a valid worktree
        git_dir = workcell_path / ".git"
        if not git_dir.exists():
            return {
                "success": False,
                "error": "Not a valid git worktree (missing .git)",
                "workcell_id": workcell_id,
                "workcell_path": str(workcell_path),
            }

        # Check forbidden paths
        violations = []
        for forbidden in forbidden_paths:
            check_path = workcell_path / forbidden
            if check_path.exists():
                violations.append(forbidden)

        return {
            "success": len(violations) == 0,
            "workcell_id": workcell_id,
            "workcell_path": str(workcell_path),
            "status": "valid" if len(violations) == 0 else "violations_found",
            "violations": violations if violations else None,
        }

    elif action == "cleanup":
        if not workcell_id:
            return {
                "success": False,
                "error": "workcell_id required for cleanup action",
            }

        try:
            manager.cleanup(workcell_id)
            return {
                "success": True,
                "workcell_id": workcell_id,
                "status": "cleaned_up",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to cleanup workcell: {e}",
                "workcell_id": workcell_id,
            }

    elif action == "cleanup-all":
        try:
            # List all workcells
            workcells = list(config.workcells_dir.glob("wc-*"))
            cleaned = []

            for wc_path in workcells:
                try:
                    manager.cleanup(wc_path.name)
                    cleaned.append(wc_path.name)
                except Exception:
                    pass

            return {
                "success": True,
                "status": "cleanup_all_complete",
                "cleaned_count": len(cleaned),
                "cleaned_workcells": cleaned,
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to cleanup all: {e}",
            }

    else:
        return {
            "success": False,
            "error": f"Unknown action: {action}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Manage workcell lifecycle")
    parser.add_argument("action", choices=["create", "verify", "cleanup", "cleanup-all"])
    parser.add_argument("--issue-id", help="Issue ID for create")
    parser.add_argument("--workcell-id", help="Workcell ID for verify/cleanup")

    args = parser.parse_args()

    result = execute(
        action=args.action,
        issue_id=args.issue_id,
        workcell_id=args.workcell_id,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
