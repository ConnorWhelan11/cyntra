#!/usr/bin/env python3
"""
Beads Graph Operations Skill

Query/update .beads/issues.jsonl with proper status transitions.
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
    operation: str,
    issue_id: str | None = None,
    updates: dict[str, Any] | None = None,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Perform Beads graph operations.

    Args:
        operation: get, update, list, validate-deps
        issue_id: Issue ID for get/update
        updates: Fields to update
        filters: Filters for list (tags, status, etc.)

    Returns:
        {
            "issues": [...],
            "validation_errors": [...],
            "updated": bool
        }
    """
    try:
        from cyntra.state.manager import StateManager
        from cyntra.state.models import Issue

        state_mgr = StateManager(repo_root=repo_root)
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to initialize StateManager: {e}",
        }

    if operation == "get":
        if not issue_id:
            return {
                "success": False,
                "error": "issue_id required for get operation",
            }

        try:
            issue = state_mgr.get_issue(issue_id)
            if issue is None:
                return {
                    "success": False,
                    "error": f"Issue not found: {issue_id}",
                }

            return {
                "success": True,
                "issues": [issue.model_dump()],
                "validation_errors": [],
                "updated": False,
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to get issue: {e}",
            }

    elif operation == "update":
        if not issue_id:
            return {
                "success": False,
                "error": "issue_id required for update operation",
            }

        if not updates:
            return {
                "success": False,
                "error": "updates required for update operation",
            }

        try:
            issue = state_mgr.get_issue(issue_id)
            if issue is None:
                return {
                    "success": False,
                    "error": f"Issue not found: {issue_id}",
                }

            # Apply updates
            issue_dict = issue.model_dump()
            issue_dict.update(updates)

            # Create updated issue
            updated_issue = Issue(**issue_dict)

            # Validate status transition if status changed
            if "status" in updates and updates["status"] != issue.status:
                # Basic validation - could be more sophisticated
                valid_statuses = [
                    "open",
                    "in_progress",
                    "completed",
                    "blocked",
                    "archived",
                ]
                if updates["status"] not in valid_statuses:
                    return {
                        "success": False,
                        "error": f"Invalid status: {updates['status']}",
                    }

            # Update in state manager
            state_mgr.update_issue(updated_issue)

            return {
                "success": True,
                "issues": [updated_issue.model_dump()],
                "validation_errors": [],
                "updated": True,
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to update issue: {e}",
            }

    elif operation == "list":
        try:
            all_issues = state_mgr.list_issues()

            # Apply filters if provided
            if filters:
                filtered = []
                for issue in all_issues:
                    match = True

                    # Filter by status
                    if "status" in filters and issue.status != filters["status"]:
                        match = False

                    # Filter by tags (any tag matches)
                    if "tags" in filters:
                        filter_tags = set(filters["tags"])
                        issue_tags = set(issue.tags or [])
                        if not filter_tags.intersection(issue_tags):
                            match = False

                    if match:
                        filtered.append(issue)

                all_issues = filtered

            return {
                "success": True,
                "issues": [issue.model_dump() for issue in all_issues],
                "validation_errors": [],
                "updated": False,
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to list issues: {e}",
            }

    elif operation == "validate-deps":
        try:
            all_issues = state_mgr.list_issues()
            validation_errors = []

            # Build ID set for quick lookup
            issue_ids = {issue.id for issue in all_issues}

            # Check each issue's dependencies
            for issue in all_issues:
                if not issue.depends_on:
                    continue

                for dep_id in issue.depends_on:
                    if dep_id not in issue_ids:
                        validation_errors.append(
                            {
                                "issue_id": issue.id,
                                "error": f"Dependency not found: {dep_id}",
                            }
                        )

            return {
                "success": True,
                "issues": [],
                "validation_errors": validation_errors,
                "updated": False,
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to validate dependencies: {e}",
            }

    else:
        return {
            "success": False,
            "error": f"Unknown operation: {operation}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Beads graph operations")
    parser.add_argument("operation", choices=["get", "update", "list", "validate-deps"])
    parser.add_argument("--issue-id", help="Issue ID")
    parser.add_argument("--updates", help="Updates as JSON string")
    parser.add_argument("--filters", help="Filters as JSON string")

    args = parser.parse_args()

    updates = json.loads(args.updates) if args.updates else None
    filters = json.loads(args.filters) if args.filters else None

    result = execute(
        operation=args.operation,
        issue_id=args.issue_id,
        updates=updates,
        filters=filters,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
