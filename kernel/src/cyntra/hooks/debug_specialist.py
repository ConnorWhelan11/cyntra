"""
Debug Specialist Hook - Investigates gate failures and errors.

Triggered when gates fail or status is 'failed'/'partial'.
Analyzes errors, traces root causes, and suggests fixes.
"""

from __future__ import annotations

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


def read_gate_logs(workcell_path: Path, gate_name: str) -> str:
    """Read gate output logs."""
    logs_dir = workcell_path / "logs"
    content_parts: list[str] = []

    # Try various log file patterns
    patterns = [
        f"{gate_name}.log",
        f"{gate_name}-stdout.log",
        f"{gate_name}-stderr.log",
        f"gate-{gate_name}.log",
    ]

    for pattern in patterns:
        log_file = logs_dir / pattern
        if log_file.exists():
            try:
                content = log_file.read_text()
                if content.strip():
                    content_parts.append(f"=== {pattern} ===\n{content}")
            except Exception:
                pass

    return "\n\n".join(content_parts)


def invoke_explain_failure(
    gate_name: str,
    error_output: str,
    files_modified: list[str] | None = None,
) -> dict[str, Any]:
    """
    Invoke the explain-failure skill.

    Falls back to basic analysis if skill not available.
    """
    try:
        import importlib.util
        import sys

        if str(SKILLS_PATH) not in sys.path:
            sys.path.insert(0, str(SKILLS_PATH))

        spec = importlib.util.spec_from_file_location(
            "explain_failure", SKILLS_PATH / "explain-failure.py"
        )
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module.execute(gate_name, error_output, files_modified)
    except Exception as e:
        logger.warning("skill_import_failed", skill="explain-failure", error=str(e))

    # Fallback: basic analysis
    return {
        "success": True,
        "root_cause": f"Gate '{gate_name}' failed",
        "suggestions": [
            f"Review the {gate_name} output",
            "Check modified files for errors",
        ],
        "related_files": files_modified or [],
        "severity": "medium",
        "category": "unknown",
    }


def debug_specialist_handler(context: HookContext) -> HookResult:
    """
    Investigate gate failures and produce diagnostic report.

    Analyzes:
    - Test failure output
    - Type errors
    - Lint violations
    - Stack traces
    - Recent changes that may have caused the issue
    """
    workcell_path = context.workcell_path
    gate_failures = context.gate_failures

    logger.info(
        "debug_specialist_starting",
        workcell_id=context.workcell_id,
        gate_failures=gate_failures,
    )

    if not gate_failures:
        return HookResult(
            hook_name="debug-specialist",
            success=True,
            output={"message": "No failures to investigate"},
        )

    # Get modified files from proof
    files_modified = context.proof.patch.get("files_modified", [])

    diagnostics: list[dict[str, Any]] = []
    all_recommendations: list[str] = []

    for gate_name in gate_failures:
        # Read gate output
        error_content = read_gate_logs(workcell_path, gate_name)

        if not error_content and context.verification_result:
            gate_result = context.verification_result.get("results", {}).get(gate_name, {})
            error_content = gate_result.get("stderr", "") or gate_result.get("stdout", "")

        if not error_content:
            diagnostics.append(
                {
                    "gate": gate_name,
                    "root_cause": f"No output found for {gate_name}",
                    "suggestions": [f"Run {gate_name} manually to see output"],
                    "severity": "medium",
                }
            )
            continue

        # Invoke explain-failure skill
        diagnosis = invoke_explain_failure(
            gate_name=gate_name,
            error_output=error_content[:5000],  # Limit context size
            files_modified=files_modified,
        )

        diagnostic = {
            "gate": gate_name,
            "root_cause": diagnosis.get("root_cause", "Unknown"),
            "suggestions": diagnosis.get("suggestions", []),
            "related_files": diagnosis.get("related_files", []),
            "severity": diagnosis.get("severity", "medium"),
            "category": diagnosis.get("category", "unknown"),
        }
        diagnostics.append(diagnostic)

        # Build recommendations
        for suggestion in diagnostic.get("suggestions", [])[:3]:
            all_recommendations.append(f"[{gate_name}] {suggestion}")

    # Determine if auto-fixable
    auto_fixable = all(d.get("severity") == "low" for d in diagnostics)

    logger.info(
        "debug_specialist_complete",
        workcell_id=context.workcell_id,
        diagnostics_count=len(diagnostics),
        auto_fixable=auto_fixable,
    )

    return HookResult(
        hook_name="debug-specialist",
        success=True,
        output={
            "diagnostics": diagnostics,
            "summary": f"Investigated {len(gate_failures)} failing gate(s)",
            "auto_fixable": auto_fixable,
            "total_suggestions": len(all_recommendations),
        },
        recommendations=all_recommendations,
    )


# Hook definition for registration
DEBUG_SPECIALIST_HOOK = HookDefinition(
    name="debug-specialist",
    trigger=HookTrigger.ON_GATE_FAILURE,
    handler=debug_specialist_handler,
    priority=HookPriority.EARLY,  # Run early to inform other hooks
)
