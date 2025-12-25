#!/usr/bin/env python3
"""
Exploration Controller Skill

Adjust temperature/parallelism/M based on action bands and ΔV trends.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def analyze_dynamics_for_control(
    dynamics_report: dict[str, Any],
    domain: str,
) -> dict[str, Any]:
    """Analyze dynamics report to determine control signals."""
    # Extract action summary for domain
    action_summary = dynamics_report.get("action_summary", {})
    by_domain = action_summary.get("by_domain", {})
    domain_action = by_domain.get(domain, 0.5)

    # Check for traps
    traps = action_summary.get("traps", [])
    domain_traps = [t for t in traps if domain in t.get("state_id", "")]

    # Get current recommendations if any
    current_rec = dynamics_report.get("controller_recommendations", {}).get(domain, {})

    return {
        "action_rate": domain_action,
        "has_traps": len(domain_traps) > 0,
        "traps": domain_traps,
        "current_recommendation": current_rec,
    }


def compute_adjustments(
    analysis: dict[str, Any],
    current_config: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, str]], str]:
    """Compute parameter adjustments based on dynamics analysis."""
    action_rate = analysis["action_rate"]
    has_traps = analysis["has_traps"]

    # Action bands (tunable)
    A_LOW = 0.2
    A_HIGH = 0.7

    adjustments = []
    new_config = current_config.copy()

    # Determine mode
    if has_traps or action_rate < A_LOW:
        mode = "explore"

        # Increase exploration
        temp = new_config.get("temperature", 0.2)
        new_temp = min(temp + 0.1, 0.6)
        if new_temp != temp:
            new_config["temperature"] = new_temp
            adjustments.append({
                "parameter": "temperature",
                "old": str(temp),
                "new": str(new_temp),
                "reason": "trapped/low action - increase exploration",
            })

        # Increase parallelism
        parallelism = new_config.get("speculate_parallelism", 1)
        new_parallelism = min(parallelism + 1, 3)
        if new_parallelism != parallelism:
            new_config["speculate_parallelism"] = new_parallelism
            adjustments.append({
                "parameter": "speculate_parallelism",
                "old": str(parallelism),
                "new": str(new_parallelism),
                "reason": "trapped/low action - increase diversity",
            })

    elif action_rate > A_HIGH:
        mode = "exploit"

        # Decrease exploration (more directed)
        temp = new_config.get("temperature", 0.2)
        new_temp = max(temp - 0.1, 0.1)
        if new_temp != temp:
            new_config["temperature"] = new_temp
            adjustments.append({
                "parameter": "temperature",
                "old": str(temp),
                "new": str(new_temp),
                "reason": "high action/chaos - increase directionality",
            })

    else:
        mode = "balanced"
        # Keep current settings

    return new_config, adjustments, mode


def execute(
    dynamics_report_path: str | Path,
    domain: str,
    current_config: dict[str, Any],
) -> dict[str, Any]:
    """
    Adjust exploration parameters based on dynamics.

    Args:
        dynamics_report_path: Path to dynamics_report.json
        domain: Domain to tune (code, fab_asset, fab_world)
        current_config: Current exploration configuration

    Returns:
        {
            "updated_config": {...},
            "adjustments": [...],
            "rationale": str,
            "mode": str
        }
    """
    dynamics_report_path = Path(dynamics_report_path)

    if not dynamics_report_path.exists():
        return {
            "success": False,
            "error": f"Dynamics report not found: {dynamics_report_path}",
        }

    try:
        dynamics_report = json.loads(dynamics_report_path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        return {
            "success": False,
            "error": f"Failed to read dynamics report: {e}",
        }

    try:
        # Analyze dynamics
        analysis = analyze_dynamics_for_control(dynamics_report, domain)

        # Compute adjustments
        updated_config, adjustments, mode = compute_adjustments(analysis, current_config)

        # Build rationale
        if mode == "explore":
            rationale = f"Domain {domain} showing trapped/low action behavior (rate={analysis['action_rate']:.2f}). Increasing exploration parameters."
        elif mode == "exploit":
            rationale = f"Domain {domain} showing high action/chaos (rate={analysis['action_rate']:.2f}). Tightening parameters for more directed search."
        else:
            rationale = f"Domain {domain} in healthy action band (rate={analysis['action_rate']:.2f}). Maintaining current parameters."

        return {
            "success": True,
            "updated_config": updated_config,
            "adjustments": adjustments,
            "rationale": rationale,
            "mode": mode,
            "analysis": analysis,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Control computation failed: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Compute exploration parameter adjustments")
    parser.add_argument("dynamics_report", help="Path to dynamics_report.json")
    parser.add_argument("domain", choices=["code", "fab_asset", "fab_world"])
    parser.add_argument("current_config", help="Current config as JSON string")

    args = parser.parse_args()

    current_config = json.loads(args.current_config)

    result = execute(
        dynamics_report_path=args.dynamics_report,
        domain=args.domain,
        current_config=current_config,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
