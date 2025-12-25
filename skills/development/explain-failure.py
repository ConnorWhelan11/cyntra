#!/usr/bin/env python3
"""
Explain Failure Skill - Root cause analysis for gate failures.

Parses error output from various gates (pytest, mypy, ruff, etc.)
and identifies root causes with fix suggestions.
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
class FailureAnalysis:
    """Analysis result for a failure."""

    root_cause: str
    suggestions: list[str] = field(default_factory=list)
    related_files: list[str] = field(default_factory=list)
    severity: str = "medium"  # low, medium, high
    category: str = "unknown"  # syntax, type, test, lint, import, runtime
    error_type: str = ""
    line_number: int | None = None


# Error pattern matchers
PYTEST_PATTERNS = [
    (
        r"FAILED\s+(\S+)::(\S+)\s+-\s+(\w+Error)",
        lambda m: FailureAnalysis(
            root_cause=f"{m.group(3)} in {m.group(2)}",
            related_files=[m.group(1).replace("::", "/")],
            category="test",
            error_type=m.group(3),
        ),
    ),
    (
        r"AssertionError:\s*(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Assertion failed: {m.group(1)[:100]}",
            suggestions=[
                "Check expected vs actual values",
                "Verify test setup and fixtures",
                "Check if the implementation matches test expectations",
            ],
            category="test",
            severity="medium",
        ),
    ),
    (
        r"ModuleNotFoundError:\s*No module named ['\"](\S+)['\"]",
        lambda m: FailureAnalysis(
            root_cause=f"Missing module: {m.group(1)}",
            suggestions=[
                f"Install the missing package: pip install {m.group(1)}",
                "Check if the module is in the project's dependencies",
                "Verify import paths are correct",
            ],
            category="import",
            severity="low",
        ),
    ),
    (
        r"ImportError:\s*(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Import error: {m.group(1)[:100]}",
            suggestions=[
                "Check import statement syntax",
                "Verify the module exists at the expected path",
                "Check for circular imports",
            ],
            category="import",
            severity="medium",
        ),
    ),
    (
        r"TypeError:\s*(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Type error: {m.group(1)[:100]}",
            suggestions=[
                "Check argument types match function signature",
                "Verify return type expectations",
                "Look for None values being passed where objects expected",
            ],
            category="runtime",
            severity="medium",
        ),
    ),
    (
        r"AttributeError:\s*(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Attribute error: {m.group(1)[:100]}",
            suggestions=[
                "Check if the object has the expected attribute",
                "Verify object initialization",
                "Look for typos in attribute names",
            ],
            category="runtime",
            severity="medium",
        ),
    ),
]

MYPY_PATTERNS = [
    (
        r"(\S+):(\d+):\s*error:\s*(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Type error in {m.group(1)}:{m.group(2)}: {m.group(3)[:80]}",
            related_files=[m.group(1)],
            line_number=int(m.group(2)),
            category="type",
            severity="low",
        ),
    ),
    (
        r"Incompatible types in assignment",
        lambda m: FailureAnalysis(
            root_cause="Type mismatch in assignment",
            suggestions=[
                "Check the declared type matches the assigned value",
                "Add explicit type cast if appropriate",
                "Update type annotation to be more general",
            ],
            category="type",
            severity="low",
        ),
    ),
    (
        r'Argument .+ has incompatible type "([^"]+)"; expected "([^"]+)"',
        lambda m: FailureAnalysis(
            root_cause=f"Wrong argument type: got {m.group(1)}, expected {m.group(2)}",
            suggestions=[
                f"Convert value to {m.group(2)}",
                "Check if function signature needs updating",
                "Verify the value being passed is correct",
            ],
            category="type",
            severity="low",
        ),
    ),
]

RUFF_PATTERNS = [
    (
        r"(\S+):(\d+):(\d+):\s*(\w+)\s+(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Lint error {m.group(4)}: {m.group(5)[:80]}",
            related_files=[m.group(1)],
            line_number=int(m.group(2)),
            category="lint",
            severity="low",
            error_type=m.group(4),
        ),
    ),
    (
        r"E501",
        lambda m: FailureAnalysis(
            root_cause="Line too long",
            suggestions=[
                "Break the line into multiple lines",
                "Use line continuation with backslash or parentheses",
                "Consider extracting to a variable",
            ],
            category="lint",
            severity="low",
        ),
    ),
    (
        r"F401",
        lambda m: FailureAnalysis(
            root_cause="Unused import",
            suggestions=[
                "Remove the unused import",
                "If needed for type checking, add # noqa: F401",
            ],
            category="lint",
            severity="low",
        ),
    ),
    (
        r"F841",
        lambda m: FailureAnalysis(
            root_cause="Unused variable",
            suggestions=[
                "Remove the unused variable",
                "Prefix with underscore if intentionally unused",
            ],
            category="lint",
            severity="low",
        ),
    ),
]

SYNTAX_PATTERNS = [
    (
        r"SyntaxError:\s*(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Syntax error: {m.group(1)}",
            suggestions=[
                "Check for missing colons, parentheses, or brackets",
                "Verify indentation is correct",
                "Look for unclosed string literals",
            ],
            category="syntax",
            severity="high",
        ),
    ),
    (
        r"IndentationError:\s*(.+)",
        lambda m: FailureAnalysis(
            root_cause=f"Indentation error: {m.group(1)}",
            suggestions=[
                "Check for mixed tabs and spaces",
                "Verify consistent indentation level",
                "Use editor's auto-format feature",
            ],
            category="syntax",
            severity="medium",
        ),
    ),
]


def analyze_gate_output(
    gate_name: str,
    error_output: str,
    files_modified: list[str] | None = None,
) -> FailureAnalysis:
    """
    Analyze gate output and identify root cause.

    Args:
        gate_name: Name of the failing gate
        error_output: Error output from the gate
        files_modified: Files modified in the patch

    Returns:
        FailureAnalysis with root cause and suggestions
    """
    files_modified = files_modified or []

    # Select patterns based on gate type
    patterns: list[tuple[str, Any]] = []

    if gate_name in ("test", "pytest"):
        patterns = PYTEST_PATTERNS + SYNTAX_PATTERNS
    elif gate_name in ("typecheck", "mypy"):
        patterns = MYPY_PATTERNS
    elif gate_name in ("lint", "ruff"):
        patterns = RUFF_PATTERNS
    else:
        # Try all patterns
        patterns = PYTEST_PATTERNS + MYPY_PATTERNS + RUFF_PATTERNS + SYNTAX_PATTERNS

    # Try to match patterns
    for pattern, handler in patterns:
        match = re.search(pattern, error_output, re.MULTILINE | re.IGNORECASE)
        if match:
            analysis = handler(match)

            # Enhance with modified files
            if files_modified and not analysis.related_files:
                # Try to find related files in error output
                for f in files_modified:
                    if f in error_output or Path(f).stem in error_output:
                        analysis.related_files.append(f)

            return analysis

    # Fallback: generic analysis
    return FailureAnalysis(
        root_cause=f"Gate '{gate_name}' failed",
        suggestions=[
            f"Review the full {gate_name} output",
            "Check recent changes in modified files",
            "Run the gate locally to reproduce",
        ],
        related_files=files_modified[:3],
        severity="medium",
        category="unknown",
    )


def extract_file_references(error_output: str) -> list[str]:
    """Extract file paths from error output."""
    files: list[str] = []

    # Match file:line patterns
    file_patterns = [
        r"(\S+\.py):(\d+)",
        r"(\S+\.tsx?):(\d+)",
        r"(\S+\.jsx?):(\d+)",
        r'File "([^"]+)"',
    ]

    for pattern in file_patterns:
        for match in re.finditer(pattern, error_output):
            filepath = match.group(1)
            if filepath not in files:
                files.append(filepath)

    return files[:5]  # Limit to 5 files


def execute(
    gate_name: str,
    error_output: str,
    files_modified: list[str] | None = None,
) -> dict[str, Any]:
    """
    Analyze gate failure and explain root cause.

    Args:
        gate_name: Name of the failing gate
        error_output: Error output from the gate
        files_modified: Files modified in the patch

    Returns:
        {
            "success": bool,
            "root_cause": str,
            "suggestions": [...],
            "related_files": [...],
            "severity": str,
            "category": str
        }
    """
    if not error_output.strip():
        return {
            "success": True,
            "root_cause": f"No output from {gate_name} gate",
            "suggestions": ["Check if gate ran correctly"],
            "related_files": [],
            "severity": "low",
            "category": "unknown",
        }

    # Analyze the output
    analysis = analyze_gate_output(gate_name, error_output, files_modified)

    # Extract additional file references
    extracted_files = extract_file_references(error_output)
    for f in extracted_files:
        if f not in analysis.related_files:
            analysis.related_files.append(f)

    return {
        "success": True,
        "root_cause": analysis.root_cause,
        "suggestions": analysis.suggestions or [
            f"Review the {gate_name} output carefully",
            "Check the files that were modified",
            f"Run {gate_name} locally to investigate",
        ],
        "related_files": analysis.related_files[:5],
        "severity": analysis.severity,
        "category": analysis.category,
        "error_type": analysis.error_type,
        "line_number": analysis.line_number,
    }


def main() -> None:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Analyze gate failure")
    parser.add_argument(
        "gate_name",
        help="Name of the failing gate",
    )
    parser.add_argument(
        "error_file",
        nargs="?",
        default="-",
        help="Path to error output file or - for stdin",
    )
    parser.add_argument(
        "--files",
        nargs="*",
        help="Files modified in the patch",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file (default: stdout)",
    )

    args = parser.parse_args()

    # Read error output
    if args.error_file == "-":
        error_output = sys.stdin.read()
    else:
        error_output = Path(args.error_file).read_text()

    # Execute
    result = execute(args.gate_name, error_output, args.files)

    # Output
    output = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
