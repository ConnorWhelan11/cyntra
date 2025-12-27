#!/usr/bin/env python3
"""
Analyze Diff Skill - Code review analysis.

Parses git diffs and identifies potential issues like:
- Debug statements (print, console.log)
- TODO/FIXME comments
- Hardcoded secrets
- Large functions
- Missing error handling
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Issue:
    """A code review issue."""

    file: str
    line: int
    severity: str  # info, warning, error
    message: str
    code: str = ""
    category: str = ""


@dataclass
class DiffHunk:
    """A parsed diff hunk."""

    file: str
    additions: list[tuple[int, str]] = field(default_factory=list)
    deletions: list[tuple[int, str]] = field(default_factory=list)


def parse_diff(diff: str) -> list[DiffHunk]:
    """Parse git diff into structured hunks."""
    hunks: list[DiffHunk] = []
    current_file: str | None = None
    current_hunk: DiffHunk | None = None
    add_line_num = 0
    del_line_num = 0

    for line in diff.split("\n"):
        # New file
        if line.startswith("diff --git"):
            if current_hunk:
                hunks.append(current_hunk)
            match = re.search(r"b/(.+)$", line)
            current_file = match.group(1) if match else "unknown"
            current_hunk = DiffHunk(file=current_file)
            continue

        # Hunk header - get line numbers
        if line.startswith("@@"):
            match = re.search(r"\+(\d+)", line)
            if match:
                add_line_num = int(match.group(1))
            match = re.search(r"-(\d+)", line)
            if match:
                del_line_num = int(match.group(1))
            continue

        # Addition
        if line.startswith("+") and not line.startswith("+++"):
            if current_hunk:
                current_hunk.additions.append((add_line_num, line[1:]))
            add_line_num += 1
            continue

        # Deletion
        if line.startswith("-") and not line.startswith("---"):
            if current_hunk:
                current_hunk.deletions.append((del_line_num, line[1:]))
            del_line_num += 1
            continue

        # Context line - increment both
        if not line.startswith("\\"):
            add_line_num += 1
            del_line_num += 1

    if current_hunk:
        hunks.append(current_hunk)

    return hunks


# Issue detection patterns
DEBUG_PATTERNS = [
    (r"\bconsole\.log\s*\(", "console.log statement"),
    (r"\bprint\s*\(", "print statement"),
    (r"\bdebugger\b", "debugger statement"),
    (r"\bpdb\.set_trace\s*\(", "pdb debugger"),
    (r"\bbreakpoint\s*\(", "breakpoint() call"),
    (r"\blogger\.debug\s*\(", "debug logging"),
]

TODO_PATTERNS = [
    (r"\bTODO\b", "TODO comment"),
    (r"\bFIXME\b", "FIXME comment"),
    (r"\bHACK\b", "HACK comment"),
    (r"\bXXX\b", "XXX marker"),
]

SECRET_PATTERNS = [
    (r"(password|passwd)\s*=\s*['\"][^'\"]+['\"]", "Hardcoded password"),
    (r"(api_key|apikey)\s*=\s*['\"][^'\"]+['\"]", "Hardcoded API key"),
    (r"(secret|token)\s*=\s*['\"][^'\"]+['\"]", "Hardcoded secret/token"),
    (r"(aws_access_key|aws_secret)\s*=\s*['\"][^'\"]+['\"]", "AWS credentials"),
]

QUALITY_PATTERNS = [
    (r"except\s*:", "Bare except clause", "warning"),
    (r"# type:\s*ignore", "Type ignore comment", "info"),
    (r"noqa", "Linter suppression", "info"),
    (r"pylint:\s*disable", "Pylint disable", "info"),
]


def analyze_hunk(hunk: DiffHunk, depth: str) -> list[Issue]:
    """Analyze a diff hunk for issues."""
    issues: list[Issue] = []

    for line_num, line in hunk.additions:
        # Debug statements
        for pattern, message in DEBUG_PATTERNS:
            if re.search(pattern, line, re.I):
                issues.append(
                    Issue(
                        file=hunk.file,
                        line=line_num,
                        severity="warning",
                        message=message,
                        code=line.strip()[:80],
                        category="debug",
                    )
                )

        # TODO/FIXME
        for pattern, message in TODO_PATTERNS:
            if re.search(pattern, line, re.I):
                issues.append(
                    Issue(
                        file=hunk.file,
                        line=line_num,
                        severity="info",
                        message=message,
                        code=line.strip()[:80],
                        category="todo",
                    )
                )

        # Secrets
        for pattern, message in SECRET_PATTERNS:
            if re.search(pattern, line, re.I):
                issues.append(
                    Issue(
                        file=hunk.file,
                        line=line_num,
                        severity="error",
                        message=message,
                        code="[REDACTED]",
                        category="security",
                    )
                )

        # Quality (for standard and deep)
        if depth in ("standard", "deep"):
            for pattern, message, severity in QUALITY_PATTERNS:
                if re.search(pattern, line, re.I):
                    issues.append(
                        Issue(
                            file=hunk.file,
                            line=line_num,
                            severity=severity,
                            message=message,
                            code=line.strip()[:80],
                            category="quality",
                        )
                    )

        if depth == "deep" and len(line) > 120:
            issues.append(
                Issue(
                    file=hunk.file,
                    line=line_num,
                    severity="info",
                    message=f"Line too long ({len(line)} chars)",
                    code=line.strip()[:80] + "...",
                    category="style",
                )
            )

    return issues


def check_acceptance_criteria(hunks: list[DiffHunk], context: dict[str, Any] | None) -> list[str]:
    """Check if changes align with acceptance criteria."""
    gaps: list[str] = []

    if not context:
        return gaps

    criteria = context.get("acceptance_criteria", [])
    if not criteria:
        return gaps

    # Simple heuristic: check if criteria keywords appear in changes
    all_changes = ""
    for hunk in hunks:
        for _, line in hunk.additions:
            all_changes += line.lower() + " "

    for criterion in criteria:
        # Extract key terms
        terms = re.findall(r"\b\w{4,}\b", criterion.lower())
        matches = sum(1 for term in terms if term in all_changes)
        if matches < len(terms) * 0.3:  # Less than 30% match
            gaps.append(f"May not address: {criterion[:60]}...")

    return gaps


def execute(
    diff: str,
    context: dict[str, Any] | None = None,
    review_depth: str = "standard",
) -> dict[str, Any]:
    """
    Analyze a diff for code quality issues.

    Args:
        diff: Git diff content
        context: Issue context (id, title, acceptance_criteria)
        review_depth: quick, standard, or deep

    Returns:
        {
            "success": bool,
            "summary": str,
            "issues": [...],
            "approval": str,
            "coverage_gaps": [...]
        }
    """
    if not diff.strip():
        return {
            "success": True,
            "summary": "No changes to review",
            "issues": [],
            "approval": "approve",
            "coverage_gaps": [],
        }

    hunks = parse_diff(diff)
    all_issues: list[Issue] = []

    for hunk in hunks:
        issues = analyze_hunk(hunk, review_depth)
        all_issues.extend(issues)

    # Check acceptance criteria
    coverage_gaps = check_acceptance_criteria(hunks, context)

    # Determine approval recommendation
    error_count = sum(1 for i in all_issues if i.severity == "error")
    warning_count = sum(1 for i in all_issues if i.severity == "warning")

    if error_count > 0:
        approval = "request_changes"
    elif warning_count > 2:
        approval = "needs_discussion"
    else:
        approval = "approve"

    # Build summary
    files_changed = len(hunks)
    total_additions = sum(len(h.additions) for h in hunks)
    total_deletions = sum(len(h.deletions) for h in hunks)

    summary_parts = [
        f"Reviewed {files_changed} file(s)",
        f"+{total_additions}/-{total_deletions} lines",
    ]

    if all_issues:
        summary_parts.append(
            f"Found {len(all_issues)} issue(s) ({error_count} errors, {warning_count} warnings)"
        )
    else:
        summary_parts.append("No issues found")

    # Convert issues to dicts
    issues_list = [
        {
            "file": i.file,
            "line": i.line,
            "severity": i.severity,
            "message": i.message,
            "code": i.code,
            "category": i.category,
        }
        for i in all_issues
    ]

    return {
        "success": True,
        "summary": ". ".join(summary_parts) + ".",
        "issues": issues_list,
        "approval": approval,
        "coverage_gaps": coverage_gaps,
        "stats": {
            "files_changed": files_changed,
            "additions": total_additions,
            "deletions": total_deletions,
            "error_count": error_count,
            "warning_count": warning_count,
        },
    }


def main() -> None:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Analyze git diff for issues")
    parser.add_argument(
        "diff_file",
        nargs="?",
        default="-",
        help="Path to diff file or - for stdin",
    )
    parser.add_argument(
        "--context-json",
        help="Issue context as JSON string",
    )
    parser.add_argument(
        "--depth",
        default="standard",
        choices=["quick", "standard", "deep"],
        help="Review depth",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file (default: stdout)",
    )

    args = parser.parse_args()

    # Read diff
    diff = sys.stdin.read() if args.diff_file == "-" else Path(args.diff_file).read_text()

    # Parse context
    context = json.loads(args.context_json) if args.context_json else None

    # Execute
    result = execute(diff, context, args.depth)

    # Output
    output = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
