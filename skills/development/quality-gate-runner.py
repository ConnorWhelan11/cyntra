#!/usr/bin/env python3
"""
Quality Gate Runner Skill

Orchestrate pytest/mypy/ruff/fab gates with consistent reporting.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[2]


def _run_command(command: str, cwd: Path, timeout: int = 300) -> dict[str, Any]:
    """Run a shell command and return result."""
    start_time = time.time()

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        duration_ms = int((time.time() - start_time) * 1000)

        return {
            "passed": result.returncode == 0,
            "exit_code": result.returncode,
            "duration_ms": duration_ms,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }

    except subprocess.TimeoutExpired:
        duration_ms = int((time.time() - start_time) * 1000)
        return {
            "passed": False,
            "exit_code": -1,
            "duration_ms": duration_ms,
            "error": "timeout",
        }
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return {
            "passed": False,
            "exit_code": -1,
            "duration_ms": duration_ms,
            "error": str(e),
        }


def execute(
    workcell_path: str | Path,
    gates: dict[str, Any],
    fail_fast: bool = False,
) -> dict[str, Any]:
    """
    Run quality gates on workcell.

    Args:
        workcell_path: Path to workcell
        gates: Gate configuration with code.test, code.lint, etc.
        fail_fast: Stop on first failure

    Returns:
        {
            "all_passed": bool,
            "results": {...},
            "blocking_failures": [...]
        }
    """
    wc_path = Path(workcell_path)

    if not wc_path.exists():
        return {
            "success": False,
            "error": f"Workcell not found: {workcell_path}",
        }

    results = {}
    blocking_failures = []
    all_passed = True

    # Run code gates
    code_gates = gates.get("code", {})

    if "test" in code_gates:
        print(f"Running code.test: {code_gates['test']}")
        results["code.test"] = _run_command(code_gates["test"], wc_path)
        if not results["code.test"]["passed"]:
            all_passed = False
            blocking_failures.append("code.test")
            if fail_fast:
                return {
                    "success": True,
                    "all_passed": False,
                    "results": results,
                    "blocking_failures": blocking_failures,
                }

    if "lint" in code_gates:
        print(f"Running code.lint: {code_gates['lint']}")
        results["code.lint"] = _run_command(code_gates["lint"], wc_path)
        if not results["code.lint"]["passed"]:
            all_passed = False
            blocking_failures.append("code.lint")
            if fail_fast:
                return {
                    "success": True,
                    "all_passed": False,
                    "results": results,
                    "blocking_failures": blocking_failures,
                }

    if "typecheck" in code_gates:
        print(f"Running code.typecheck: {code_gates['typecheck']}")
        results["code.typecheck"] = _run_command(code_gates["typecheck"], wc_path)
        if not results["code.typecheck"]["passed"]:
            all_passed = False
            blocking_failures.append("code.typecheck")
            if fail_fast:
                return {
                    "success": True,
                    "all_passed": False,
                    "results": results,
                    "blocking_failures": blocking_failures,
                }

    # Run fab gates
    fab_gates = gates.get("fab", {})

    if "validate" in fab_gates:
        # Fab gates are config paths that need to be run with fab-gate CLI
        validate_configs = fab_gates["validate"]
        if not isinstance(validate_configs, list):
            validate_configs = [validate_configs]

        for config_path in validate_configs:
            gate_name = f"fab.validate.{Path(config_path).stem}"
            print(f"Running {gate_name}: {config_path}")

            # Construct fab-gate command
            # This assumes the gate runner is available
            # For now, just mark as not implemented
            results[gate_name] = {
                "passed": None,
                "exit_code": -1,
                "duration_ms": 0,
                "error": "fab gate execution not yet implemented in skill",
            }

    return {
        "success": True,
        "all_passed": all_passed,
        "results": results,
        "blocking_failures": blocking_failures,
    }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Run quality gates on workcell")
    parser.add_argument("workcell_path", help="Path to workcell")
    parser.add_argument("--gates-json", required=True, help="Gates config as JSON string")
    parser.add_argument("--fail-fast", action="store_true", help="Stop on first failure")

    args = parser.parse_args()

    gates = json.loads(args.gates_json)
    result = execute(args.workcell_path, gates, args.fail_fast)

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("all_passed") else 1)


if __name__ == "__main__":
    main()
