#!/usr/bin/env python3
"""
Fab Gate Evaluator Skill

Run gate config (YAML) against asset, produce verdict JSON with critic reports.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[5]
kernel_src = repo_root / "kernel" / "src"
if kernel_src.exists():
    sys.path.insert(0, str(kernel_src))


def execute(
    gate_config_path: str | Path,
    asset_path: str | Path,
    output_dir: str | Path,
    render_samples: int | None = None,
) -> dict[str, Any]:
    """
    Evaluate asset against gate.

    Args:
        gate_config_path: Path to gate YAML config
        asset_path: Path to asset (.glb or .blend)
        output_dir: Directory for verdict and reports
        render_samples: Override render samples from config

    Returns:
        {
            "verdict_path": str,
            "passed": bool,
            "overall_score": float,
            "critic_reports": [...],
            "blocking_failures": [...]
        }
    """
    gate_config_path = Path(gate_config_path)
    asset_path = Path(asset_path)
    output_dir = Path(output_dir)

    if not gate_config_path.exists():
        return {
            "success": False,
            "error": f"Gate config not found: {gate_config_path}",
        }

    if not asset_path.exists():
        return {
            "success": False,
            "error": f"Asset not found: {asset_path}",
        }

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        from cyntra.fab.gate import run_gate

        # Run gate using existing fab gate runner
        verdict = run_gate(
            gate_config_path=gate_config_path,
            asset_path=asset_path,
            output_dir=output_dir,
            render_samples_override=render_samples,
        )

        # Extract key fields
        passed = verdict.get("passed", False)
        overall_score = verdict.get("overall_score", 0.0)

        # Find blocking failures
        blocking_failures = []
        for critic_name, critic_result in verdict.get("critics", {}).items():
            if isinstance(critic_result, dict) and critic_result.get("hard_fail"):
                blocking_failures.append(
                    {
                        "critic": critic_name,
                        "reason": critic_result.get("reason", "unknown"),
                    }
                )

        # Verdict path
        verdict_path = output_dir / "verdict.json"
        verdict_path.write_text(json.dumps(verdict, indent=2))

        # Collect critic report paths
        critic_reports = []
        for critic_file in output_dir.glob("*_critic_report.json"):
            critic_reports.append(str(critic_file))

        return {
            "success": True,
            "verdict_path": str(verdict_path),
            "passed": passed,
            "overall_score": overall_score,
            "critic_reports": critic_reports,
            "blocking_failures": blocking_failures,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Gate evaluation failed: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Evaluate asset against fab gate")
    parser.add_argument("gate_config", help="Path to gate YAML config")
    parser.add_argument("asset", help="Path to asset (.glb or .blend)")
    parser.add_argument("output_dir", help="Output directory")
    parser.add_argument("--samples", type=int, help="Override render samples")

    args = parser.parse_args()

    result = execute(
        gate_config_path=args.gate_config,
        asset_path=args.asset,
        output_dir=args.output_dir,
        render_samples=args.samples,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
