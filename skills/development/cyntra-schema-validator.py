#!/usr/bin/env python3
"""
Cyntra Schema Validator Skill

Validate JSON artifacts against Cyntra schemas.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft7Validator
except ImportError:
    print(
        "Error: jsonschema package required. Install with: pip install jsonschema",
        file=sys.stderr,
    )
    sys.exit(1)

# Schema directory
repo_root = Path(__file__).resolve().parents[2]
SCHEMA_DIR = repo_root / "kernel" / "schemas" / "cyntra"

# Schema name mapping
SCHEMA_FILES = {
    "rollout": "rollout.schema.json",
    "proof": "proof.schema.json",
    "manifest": "manifest.schema.json",
    "state_t1": "state_t1.schema.json",
    "transition": "transition.schema.json",
    "dynamics_report": "dynamics_report.schema.json",
}


def load_schema(schema_name: str) -> dict[str, Any] | None:
    """Load schema by name."""
    if schema_name not in SCHEMA_FILES:
        return None

    schema_path = SCHEMA_DIR / SCHEMA_FILES[schema_name]
    if not schema_path.exists():
        return None

    try:
        return json.loads(schema_path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def execute(
    artifact_path: str | Path,
    schema_name: str,
    strict: bool = False,
) -> dict[str, Any]:
    """
    Validate JSON artifact against schema.

    Args:
        artifact_path: Path to JSON artifact
        schema_name: Schema name (rollout, proof, manifest, etc.)
        strict: Fail on warnings, not just errors

    Returns:
        {
            "valid": bool,
            "errors": [...],
            "warnings": [...],
            "schema_version": str
        }
    """
    artifact_path = Path(artifact_path)

    # Check artifact exists
    if not artifact_path.exists():
        return {
            "valid": False,
            "errors": [f"Artifact not found: {artifact_path}"],
            "warnings": [],
            "schema_version": None,
        }

    # Load schema
    schema = load_schema(schema_name)
    if schema is None:
        return {
            "valid": False,
            "errors": [f"Schema not found: {schema_name}"],
            "warnings": [],
            "schema_version": None,
        }

    # Load artifact
    try:
        artifact = json.loads(artifact_path.read_text())
    except json.JSONDecodeError as e:
        return {
            "valid": False,
            "errors": [f"Invalid JSON: {e}"],
            "warnings": [],
            "schema_version": None,
        }

    # Validate
    validator = Draft7Validator(schema)
    validation_errors = list(validator.iter_errors(artifact))

    errors = []
    warnings = []

    for error in validation_errors:
        error_msg = f"{'.'.join(str(p) for p in error.path)}: {error.message}"

        # Classify as error or warning based on severity
        # For now, all validation errors are errors
        errors.append(error_msg)

    # Check schema version if present
    schema_version = artifact.get("schema_version")
    expected_version = (
        schema.get("properties", {}).get("schema_version", {}).get("const")
    )

    if schema_version != expected_version and expected_version:
        warnings.append(
            f"Schema version mismatch: got {schema_version}, expected {expected_version}"
        )

    valid = len(errors) == 0 and (not strict or len(warnings) == 0)

    return {
        "valid": valid,
        "errors": errors,
        "warnings": warnings,
        "schema_version": schema_version,
    }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Validate JSON against Cyntra schema")
    parser.add_argument("artifact_path", help="Path to JSON artifact")
    parser.add_argument("schema_name", help="Schema name (rollout, proof, etc.)")
    parser.add_argument("--strict", action="store_true", help="Fail on warnings")

    args = parser.parse_args()

    result = execute(args.artifact_path, args.schema_name, args.strict)
    print(json.dumps(result, indent=2))

    sys.exit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
