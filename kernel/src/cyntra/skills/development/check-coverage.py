#!/usr/bin/env python3
"""
Check Coverage Skill - Analyze test coverage and identify gaps.

Runs pytest with coverage and parses the results to provide
actionable coverage information.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def run_coverage(repo_path: Path, source_paths: list[str] | None = None) -> dict[str, Any] | None:
    """Run pytest with coverage and return parsed results."""
    coverage_json = repo_path / "coverage.json"

    # Build pytest command
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        "--cov",
        "--cov-report=json",
        "-q",
        "--tb=no",
    ]

    # Add source paths if specified
    if source_paths:
        for path in source_paths:
            cmd.extend(["--cov", path])

    try:
        subprocess.run(
            cmd,
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=300,
        )

        # Try to read coverage.json
        if coverage_json.exists():
            return json.loads(coverage_json.read_text())

        # Fallback: try to parse from output
        return None

    except subprocess.TimeoutExpired:
        return None
    except Exception:
        return None


def parse_existing_coverage(repo_path: Path) -> dict[str, Any] | None:
    """Try to parse existing coverage data."""
    # Try coverage.json
    coverage_json = repo_path / "coverage.json"
    if coverage_json.exists():
        try:
            return json.loads(coverage_json.read_text())
        except Exception:
            pass

    # Try .coverage database (requires coverage library)
    coverage_db = repo_path / ".coverage"
    if coverage_db.exists():
        try:
            result = subprocess.run(
                [sys.executable, "-m", "coverage", "json", "-o", "coverage.json"],
                cwd=repo_path,
                capture_output=True,
                timeout=60,
            )
            if result.returncode == 0 and coverage_json.exists():
                return json.loads(coverage_json.read_text())
        except Exception:
            pass

    return None


def extract_coverage_info(
    coverage_data: dict[str, Any],
) -> tuple[float, dict[str, float], dict[str, list[int]]]:
    """Extract coverage information from coverage.py JSON output."""
    totals = coverage_data.get("totals", {})
    overall = totals.get("percent_covered", 0.0)

    file_coverage: dict[str, float] = {}
    uncovered_lines: dict[str, list[int]] = {}

    files = coverage_data.get("files", {})
    for filepath, file_data in files.items():
        summary = file_data.get("summary", {})
        percent = summary.get("percent_covered", 0.0)
        file_coverage[filepath] = round(percent, 2)

        missing = file_data.get("missing_lines", [])
        if missing:
            uncovered_lines[filepath] = missing

    return overall, file_coverage, uncovered_lines


def identify_coverage_gaps(
    file_coverage: dict[str, float],
    uncovered_lines: dict[str, list[int]],
    min_coverage: float,
) -> list[dict[str, Any]]:
    """Identify files with coverage below threshold."""
    gaps: list[dict[str, Any]] = []

    for filepath, percent in file_coverage.items():
        if percent < min_coverage:
            gap = {
                "file": filepath,
                "coverage": percent,
                "target": min_coverage,
                "gap": round(min_coverage - percent, 2),
            }

            if filepath in uncovered_lines:
                missing = uncovered_lines[filepath]
                gap["uncovered_lines"] = len(missing)
                gap["sample_lines"] = missing[:10]  # First 10

            gaps.append(gap)

    # Sort by gap size (largest first)
    gaps.sort(key=lambda x: x["gap"], reverse=True)

    return gaps


def execute(
    repo_path: str,
    source_paths: list[str] | None = None,
    min_coverage: float = 80.0,
    run_tests: bool = True,
) -> dict[str, Any]:
    """
    Check test coverage for a repository.

    Args:
        repo_path: Path to repository
        source_paths: Source paths to check coverage for
        min_coverage: Minimum coverage threshold (0-100)
        run_tests: Whether to run tests (False = use existing data)

    Returns:
        {
            "success": bool,
            "overall_coverage": float,
            "file_coverage": {...},
            "uncovered_lines": {...},
            "meets_threshold": bool,
            "coverage_gaps": [...]
        }
    """
    repo = Path(repo_path)

    if not repo.exists():
        return {
            "success": False,
            "error": f"Repository path does not exist: {repo_path}",
            "overall_coverage": 0,
            "file_coverage": {},
            "uncovered_lines": {},
            "meets_threshold": False,
        }

    # Get coverage data
    coverage_data = None

    if run_tests:
        coverage_data = run_coverage(repo, source_paths)

    if coverage_data is None:
        coverage_data = parse_existing_coverage(repo)

    if coverage_data is None:
        return {
            "success": False,
            "error": "Could not get coverage data. Run tests with --cov first.",
            "overall_coverage": 0,
            "file_coverage": {},
            "uncovered_lines": {},
            "meets_threshold": False,
        }

    # Extract info
    overall, file_coverage, uncovered_lines = extract_coverage_info(coverage_data)

    # Check threshold
    meets_threshold = overall >= min_coverage

    # Find gaps
    coverage_gaps = identify_coverage_gaps(file_coverage, uncovered_lines, min_coverage)

    return {
        "success": True,
        "overall_coverage": round(overall, 2),
        "file_coverage": file_coverage,
        "uncovered_lines": uncovered_lines,
        "meets_threshold": meets_threshold,
        "min_coverage": min_coverage,
        "coverage_gaps": coverage_gaps,
        "stats": {
            "total_files": len(file_coverage),
            "files_below_threshold": len(coverage_gaps),
            "total_uncovered_lines": sum(len(lines) for lines in uncovered_lines.values()),
        },
    }


def main() -> None:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Check test coverage")
    parser.add_argument(
        "--repo-path",
        default=".",
        help="Repository root path",
    )
    parser.add_argument(
        "--source-paths",
        nargs="*",
        help="Source paths to check coverage for",
    )
    parser.add_argument(
        "--min-coverage",
        type=float,
        default=80.0,
        help="Minimum coverage threshold (0-100)",
    )
    parser.add_argument(
        "--no-run",
        action="store_true",
        help="Don't run tests, use existing coverage data",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file (default: stdout)",
    )

    args = parser.parse_args()

    result = execute(
        repo_path=args.repo_path,
        source_paths=args.source_paths,
        min_coverage=args.min_coverage,
        run_tests=not args.no_run,
    )

    output = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)

    sys.exit(0 if result.get("success") and result.get("meets_threshold") else 1)


if __name__ == "__main__":
    main()
