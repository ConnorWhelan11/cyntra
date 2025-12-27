#!/usr/bin/env python3
"""
Generate Fixtures Skill - Create test fixtures from code analysis.

Analyzes source files to generate:
- Factory functions for creating test objects
- Sample data based on type hints
- Mock objects for dependencies
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class ClassInfo:
    """Information about a class."""

    name: str
    fields: list[tuple[str, str]]  # (name, type_hint)
    init_params: list[tuple[str, str, Any]]  # (name, type_hint, default)


@dataclass
class FunctionInfo:
    """Information about a function."""

    name: str
    params: list[tuple[str, str]]  # (name, type_hint)
    return_type: str


def parse_python_file(file_path: Path) -> tuple[list[ClassInfo], list[FunctionInfo]]:
    """Parse a Python file and extract class/function info."""
    classes: list[ClassInfo] = []
    functions: list[FunctionInfo] = []

    try:
        content = file_path.read_text()
        tree = ast.parse(content)
    except Exception:
        return classes, functions

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            fields: list[tuple[str, str]] = []
            init_params: list[tuple[str, str, Any]] = []

            for item in node.body:
                # Get annotated class attributes
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    type_hint = ast.unparse(item.annotation) if item.annotation else ""
                    fields.append((item.target.id, type_hint))

                # Get __init__ parameters
                if isinstance(item, ast.FunctionDef) and item.name == "__init__":
                    for arg in item.args.args:
                        if arg.arg == "self":
                            continue
                        type_hint = ast.unparse(arg.annotation) if arg.annotation else ""
                        init_params.append((arg.arg, type_hint, None))

            classes.append(ClassInfo(name=node.name, fields=fields, init_params=init_params))

        elif isinstance(node, ast.FunctionDef):
            params: list[tuple[str, str]] = []
            for arg in node.args.args:
                type_hint = ast.unparse(arg.annotation) if arg.annotation else ""
                params.append((arg.arg, type_hint))

            return_type = ast.unparse(node.returns) if node.returns else ""
            functions.append(FunctionInfo(name=node.name, params=params, return_type=return_type))

    return classes, functions


def generate_sample_value(type_hint: str) -> Any:
    """Generate a sample value based on type hint."""
    type_hint = type_hint.lower().strip()

    if not type_hint or type_hint == "any":
        return "sample_value"

    if type_hint in ("str", "string"):
        return "test_string"
    if type_hint in ("int", "integer"):
        return 42
    if type_hint in ("float", "double"):
        return 3.14
    if type_hint in ("bool", "boolean"):
        return True
    if type_hint.startswith("list") or type_hint.startswith("list["):
        return []
    if type_hint.startswith("dict") or type_hint.startswith("dict["):
        return {}
    if type_hint.startswith("optional"):
        return None
    if "datetime" in type_hint:
        return "2024-01-01T00:00:00Z"
    if "uuid" in type_hint:
        return "00000000-0000-0000-0000-000000000000"
    if "path" in type_hint:
        return "/tmp/test"

    # Default
    return f"sample_{type_hint}"


def generate_factory_function(class_info: ClassInfo) -> str:
    """Generate a factory function for a class."""
    class_name = class_info.name
    func_name = f"{class_name.lower()}_factory"

    # Build kwargs with defaults
    kwargs_lines: list[str] = []
    constructor_args: list[str] = []

    # Use init params if available, otherwise use fields
    params = class_info.init_params or [
        (name, type_hint, None) for name, type_hint in class_info.fields
    ]

    for name, type_hint, _default in params:
        sample = generate_sample_value(type_hint)
        if isinstance(sample, str):
            kwargs_lines.append(f'    {name}: {type_hint or "Any"} = "{sample}",')
        else:
            kwargs_lines.append(f"    {name}: {type_hint or 'Any'} = {sample!r},")
        constructor_args.append(f"{name}={name}")

    kwargs_str = "\n".join(kwargs_lines)
    args_str = ", ".join(constructor_args)

    return f'''def {func_name}(
{kwargs_str}
) -> {class_name}:
    """Create a {class_name} instance for testing."""
    return {class_name}({args_str})
'''


def generate_sample_data(class_info: ClassInfo) -> dict[str, Any]:
    """Generate sample data for a class."""
    data: dict[str, Any] = {}

    params = class_info.init_params or [
        (name, type_hint, None) for name, type_hint in class_info.fields
    ]

    for name, type_hint, _ in params:
        data[name] = generate_sample_value(type_hint)

    return data


def execute(
    source_file: str,
    repo_path: str,
    fixture_type: str = "all",
    output_dir: str | None = None,
) -> dict[str, Any]:
    """
    Generate fixtures for a source file.

    Args:
        source_file: Source file to analyze
        repo_path: Repository root path
        fixture_type: Type of fixtures to generate
        output_dir: Output directory for fixtures

    Returns:
        {
            "success": bool,
            "fixtures_created": [...],
            "factory_functions": [...],
            "sample_data": {...}
        }
    """
    repo = Path(repo_path)
    source = repo / source_file

    if not source.exists():
        return {
            "success": False,
            "error": f"Source file not found: {source_file}",
            "fixtures_created": [],
            "factory_functions": [],
            "sample_data": {},
        }

    # Parse the source file
    classes, functions = parse_python_file(source)

    if not classes:
        return {
            "success": True,
            "message": "No classes found in source file",
            "fixtures_created": [],
            "factory_functions": [],
            "sample_data": {},
        }

    fixtures_created: list[dict[str, Any]] = []
    factory_functions: list[str] = []
    sample_data: dict[str, Any] = {}

    for class_info in classes:
        # Generate factory
        if fixture_type in ("factory", "all"):
            factory_code = generate_factory_function(class_info)
            factory_name = f"{class_info.name.lower()}_factory"
            fixtures_created.append(
                {
                    "name": factory_name,
                    "type": "factory",
                    "for_class": class_info.name,
                    "code": factory_code,
                }
            )
            factory_functions.append(factory_name)

        # Generate sample data
        if fixture_type in ("sample_data", "all"):
            data = generate_sample_data(class_info)
            sample_data[class_info.name.lower()] = data

    # Write fixtures file if output_dir specified
    if output_dir and fixtures_created:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        fixture_file = output_path / f"fixtures_{Path(source_file).stem}.py"
        fixture_content = [
            '"""',
            f"Auto-generated fixtures for {source_file}",
            '"""',
            "",
            "from typing import Any",
            f"from {source_file.replace('/', '.').replace('.py', '')} import *",
            "",
        ]

        for fixture in fixtures_created:
            if fixture["type"] == "factory":
                fixture_content.append(fixture["code"])
                fixture_content.append("")

        fixture_file.write_text("\n".join(fixture_content))

    return {
        "success": True,
        "fixtures_created": fixtures_created,
        "factory_functions": factory_functions,
        "sample_data": sample_data,
        "classes_analyzed": [c.name for c in classes],
    }


def main() -> None:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Generate test fixtures")
    parser.add_argument(
        "source_file",
        help="Source file to generate fixtures for",
    )
    parser.add_argument(
        "--repo-path",
        default=".",
        help="Repository root path",
    )
    parser.add_argument(
        "--fixture-type",
        default="all",
        choices=["factory", "mock", "sample_data", "all"],
        help="Type of fixtures to generate",
    )
    parser.add_argument(
        "--output-dir",
        help="Directory to write fixture files",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="JSON output file (default: stdout)",
    )

    args = parser.parse_args()

    result = execute(
        source_file=args.source_file,
        repo_path=args.repo_path,
        fixture_type=args.fixture_type,
        output_dir=args.output_dir,
    )

    output = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
