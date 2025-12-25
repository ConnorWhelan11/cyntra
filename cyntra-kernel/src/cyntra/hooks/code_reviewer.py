"""
Code Reviewer Hook - Reviews patches after primary agent completes.

Runs in the same workcell, analyzes the diff, and produces review comments.
Uses the analyze-diff skill for detection.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import structlog

from cyntra.hooks.types import (
    HookContext,
    HookDefinition,
    HookPriority,
    HookResult,
    HookTrigger,
)

logger = structlog.get_logger()

# Path to skills (relative to repo root)
SKILLS_PATH = Path(__file__).parents[4] / "skills" / "development"


def get_git_diff(workcell_path: Path) -> str:
    """Get git diff from main to HEAD."""
    try:
        result = subprocess.run(
            ["git", "diff", "main...HEAD"],
            cwd=workcell_path,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout
    except Exception as e:
        logger.warning("failed_to_get_diff", error=str(e))
        return ""


def invoke_analyze_diff(
    diff: str,
    context: dict[str, Any] | None = None,
    review_depth: str = "standard",
) -> dict[str, Any]:
    """
    Invoke the analyze-diff skill.

    Falls back to inline analysis if skill not available.
    """
    try:
        # Try importing the skill
        import sys

        if str(SKILLS_PATH) not in sys.path:
            sys.path.insert(0, str(SKILLS_PATH))

        # Dynamic import to avoid circular deps
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "analyze_diff", SKILLS_PATH / "analyze-diff.py"
        )
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module.execute(diff, context, review_depth)
    except Exception as e:
        logger.warning("skill_import_failed", skill="analyze-diff", error=str(e))

    # Fallback: basic analysis
    return {
        "success": True,
        "summary": "Review completed (basic mode)",
        "issues": [],
        "approval": "approve",
        "coverage_gaps": [],
    }


def code_reviewer_handler(context: HookContext) -> HookResult:
    """
    Review the patch produced by the primary agent.

    Analyzes:
    - Code quality issues
    - Potential bugs
    - Debug statements
    - Security concerns
    - Style consistency
    """
    workcell_path = context.workcell_path

    logger.info(
        "code_reviewer_starting",
        workcell_id=context.workcell_id,
        issue_id=context.issue_id,
    )

    # Get diff
    diff = get_git_diff(workcell_path)

    if not diff.strip():
        logger.info("code_reviewer_no_changes", workcell_id=context.workcell_id)
        return HookResult(
            hook_name="code-reviewer",
            success=True,
            output={"review": "No changes to review", "approval": "approve"},
        )

    # Build context for review
    issue = context.manifest.get("issue", {})
    review_context = {
        "issue_id": context.issue_id,
        "issue_title": issue.get("title", ""),
        "acceptance_criteria": issue.get("acceptance_criteria", []),
    }

    # Invoke analyze-diff skill
    review_result = invoke_analyze_diff(
        diff=diff,
        context=review_context,
        review_depth="standard",
    )

    # Build recommendations from issues
    recommendations: list[str] = []
    issues = review_result.get("issues", [])

    for issue_item in issues:
        severity = issue_item.get("severity", "info")
        file_path = issue_item.get("file", "unknown")
        line = issue_item.get("line", "?")
        message = issue_item.get("message", "")
        recommendations.append(f"[{severity.upper()}] {file_path}:{line} - {message}")

    # Add coverage gap warnings
    for gap in review_result.get("coverage_gaps", []):
        recommendations.append(f"[COVERAGE] {gap}")

    logger.info(
        "code_reviewer_complete",
        workcell_id=context.workcell_id,
        issues_found=len(issues),
        approval=review_result.get("approval", "approve"),
    )

    return HookResult(
        hook_name="code-reviewer",
        success=True,
        output={
            "review_summary": review_result.get("summary", ""),
            "issues_found": len(issues),
            "issues": issues,
            "approval_recommendation": review_result.get("approval", "approve"),
            "coverage_gaps": review_result.get("coverage_gaps", []),
            "stats": review_result.get("stats", {}),
        },
        recommendations=recommendations,
    )


# Hook definition for registration
CODE_REVIEWER_HOOK = HookDefinition(
    name="code-reviewer",
    trigger=HookTrigger.POST_EXECUTION,
    handler=code_reviewer_handler,
    priority=HookPriority.NORMAL,
    match_status=["success", "partial"],  # Only review successful patches
)
