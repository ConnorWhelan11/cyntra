#!/usr/bin/env python3
"""
Find Tests Skill - Map source files to their test counterparts.

Searches for test files using common naming patterns and
directory structures.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def detect_test_frameworks(repo_path: Path) -> list[str]:
    """Detect which test frameworks are used in the repo."""
    frameworks: list[str] = []

    # Check for pytest
    if (repo_path / "pytest.ini").exists() or (repo_path / "pyproject.toml").exists():
        pyproject = repo_path / "pyproject.toml"
        if pyproject.exists():
            content = pyproject.read_text()
            if "pytest" in content or "[tool.pytest" in content:
                frameworks.append("pytest")

    if (repo_path / "conftest.py").exists():
        frameworks.append("pytest")

    # Check for Jest
    package_json = repo_path / "package.json"
    if package_json.exists():
        try:
            pkg = json.loads(package_json.read_text())
            deps = {
                **pkg.get("dependencies", {}),
                **pkg.get("devDependencies", {}),
            }
            if "jest" in deps:
                frameworks.append("jest")
            if "vitest" in deps:
                frameworks.append("vitest")
            if "mocha" in deps:
                frameworks.append("mocha")
        except Exception:
            pass

    # Check for Go testing
    if list(repo_path.glob("**/*_test.go")):
        frameworks.append("go-test")

    # Check for Rust testing
    if (repo_path / "Cargo.toml").exists():
        frameworks.append("cargo-test")

    return frameworks or ["pytest"]  # Default assumption


def find_test_file(source_file: str, repo_path: Path) -> list[str]:
    """Find test files for a given source file."""
    source_path = Path(source_file)
    stem = source_path.stem
    suffix = source_path.suffix

    test_files: list[str] = []

    # Python test patterns
    if suffix == ".py":
        patterns = [
            f"tests/test_{stem}.py",
            f"tests/**/test_{stem}.py",
            f"test_{stem}.py",
            f"{stem}_test.py",
            f"tests/{source_path.parent}/test_{stem}.py",
            f"{source_path.parent}/tests/test_{stem}.py",
        ]

        for pattern in patterns:
            matches = list(repo_path.glob(pattern))
            for match in matches:
                rel = str(match.relative_to(repo_path))
                if rel not in test_files:
                    test_files.append(rel)

    # TypeScript/JavaScript test patterns
    elif suffix in (".ts", ".tsx", ".js", ".jsx"):
        patterns = [
            f"**/{stem}.test{suffix}",
            f"**/{stem}.spec{suffix}",
            f"__tests__/{stem}{suffix}",
            f"tests/{stem}.test{suffix}",
        ]

        for pattern in patterns:
            matches = list(repo_path.glob(pattern))
            for match in matches:
                rel = str(match.relative_to(repo_path))
                if rel not in test_files:
                    test_files.append(rel)

    # Go test patterns
    elif suffix == ".go" and not source_file.endswith("_test.go"):
        test_file = source_file.replace(".go", "_test.go")
        if (repo_path / test_file).exists():
            test_files.append(test_file)

    # Rust test patterns (tests in same file typically)
    elif suffix == ".rs":
        # Check for integration tests
        patterns = [
            f"tests/{stem}.rs",
            f"tests/test_{stem}.rs",
        ]
        for pattern in patterns:
            matches = list(repo_path.glob(pattern))
            for match in matches:
                rel = str(match.relative_to(repo_path))
                if rel not in test_files:
                    test_files.append(rel)

    return test_files


def execute(
    source_files: list[str],
    repo_path: str,
    test_patterns: list[str] | None = None,
) -> dict[str, Any]:
    """
    Find tests for the given source files.

    Args:
        source_files: List of source file paths
        repo_path: Repository root path
        test_patterns: Custom test file patterns

    Returns:
        {
            "success": bool,
            "test_mapping": {source: [tests]},
            "untested_files": [...],
            "test_frameworks": [...]
        }
    """
    repo = Path(repo_path)

    if not repo.exists():
        return {
            "success": False,
            "error": f"Repository path does not exist: {repo_path}",
            "test_mapping": {},
            "untested_files": source_files,
            "test_frameworks": [],
        }

    # Detect frameworks
    frameworks = detect_test_frameworks(repo)

    # Find tests for each source file
    test_mapping: dict[str, list[str]] = {}
    untested_files: list[str] = []

    for source in source_files:
        tests = find_test_file(source, repo)
        if tests:
            test_mapping[source] = tests
        else:
            untested_files.append(source)

    return {
        "success": True,
        "test_mapping": test_mapping,
        "untested_files": untested_files,
        "test_frameworks": frameworks,
        "stats": {
            "total_sources": len(source_files),
            "sources_with_tests": len(test_mapping),
            "sources_without_tests": len(untested_files),
        },
    }


def main() -> None:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Find tests for source files")
    parser.add_argument(
        "--source-files",
        nargs="+",
        required=True,
        help="Source files to find tests for",
    )
    parser.add_argument(
        "--repo-path",
        default=".",
        help="Repository root path",
    )
    parser.add_argument(
        "--test-patterns",
        nargs="*",
        help="Custom test file patterns",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file (default: stdout)",
    )

    args = parser.parse_args()

    result = execute(
        source_files=args.source_files,
        repo_path=args.repo_path,
        test_patterns=args.test_patterns,
    )

    output = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
