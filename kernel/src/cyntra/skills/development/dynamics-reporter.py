#!/usr/bin/env python3
"""
Dynamics Reporter Skill

Generate comprehensive dynamics analysis including:
- Potential function V(state) estimates
- Action metrics and trap detection
- Detailed balance verification (arXiv:2512.10047)
- Exploration parameter recommendations
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[5]
kernel_src = repo_root / "kernel" / "src"
if kernel_src.exists():
    sys.path.insert(0, str(kernel_src))


def execute(
    dynamics_db_path: str,
    window_days: int = 30,
    smoothing_alpha: float = 1.0,
    output_path: str | None = None,
) -> dict[str, Any]:
    """
    Generate dynamics report with potential, action, and balance analysis.

    Args:
        dynamics_db_path: Path to dynamics SQLite database
        window_days: Number of days to include in analysis window
        smoothing_alpha: Laplace smoothing parameter
        output_path: Path to write dynamics_report.json (optional)

    Returns:
        {
            "success": bool,
            "report_path": str (if output_path provided),
            "potentials": {...},
            "action_summary": {...},
            "balance": {...},
            "traps_detected": [...],
            "controller_recommendations": {...}
        }
    """
    try:
        from cyntra.dynamics.action import compute_action_summary
        from cyntra.dynamics.balance import (
            compute_equilibrium_score,
            identify_non_equilibrium_drives,
            verify_detailed_balance,
        )
        from cyntra.dynamics.potential import estimate_potential
        from cyntra.dynamics.transition_db import TransitionDB

        db_path = Path(dynamics_db_path)
        if not db_path.exists():
            return {"success": False, "error": f"Database not found: {dynamics_db_path}"}

        db = TransitionDB(db_path)

        try:
            # Load all states and transitions
            states = db.load_states()
            counts = db.transition_counts()

            # Filter by time window if timestamps available
            cutoff = datetime.now(UTC) - timedelta(days=window_days)
            cutoff_str = cutoff.isoformat()

            # Note: filtering by timestamp would require querying raw transitions
            # For now, use all available data

            # Build state ID set
            state_ids = set(states.keys())
            for c in counts:
                state_ids.add(c.get("from_state"))
                state_ids.add(c.get("to_state"))
            state_ids.discard(None)

            # Estimate potentials
            potentials, stderr, fit_info = estimate_potential(
                counts=counts,
                state_ids=state_ids,
                alpha=smoothing_alpha,
            )

            # Compute action summary with trap detection
            action_summary = compute_action_summary(
                counts=counts,
                potentials=potentials,
                state_meta=states,
                action_low=0.1,
                delta_v_low=0.05,
                min_outgoing=3,
            )

            # Verify detailed balance
            balance_result = verify_detailed_balance(
                counts=counts,
                potentials=potentials,
                beta=1.0,
                alpha=smoothing_alpha,
                chi2_threshold=3.0,
            )
            equilibrium_score = compute_equilibrium_score(balance_result)
            non_eq_drives = identify_non_equilibrium_drives(balance_result.violations)

            # Extract traps
            traps_detected = action_summary.get("traps", [])

            # Generate controller recommendations
            recommendations = _generate_recommendations(
                action_summary=action_summary,
                balance_result=balance_result,
                traps=traps_detected,
            )

            # Build report
            report = {
                "schema_version": "cyntra.dynamics_report.v1",
                "generated_at": datetime.now(UTC).isoformat(),
                "window_days": window_days,
                "statistics": {
                    "total_states": len(state_ids),
                    "total_transitions": sum(c.get("count", 0) for c in counts),
                    "reversible_edges": balance_result.summary.get("reversible_edges", 0),
                },
                "potentials": {
                    "by_state": potentials,
                    "stderr": stderr,
                    "fit_info": fit_info,
                },
                "action": {
                    "global_action_rate": action_summary.get("global_action_rate", 0.0),
                    "by_domain": action_summary.get("by_domain", {}),
                },
                "balance": {
                    "chi2": balance_result.chi2,
                    "ndf": balance_result.ndf,
                    "chi2_per_ndf": balance_result.chi2_per_ndf,
                    "passed": balance_result.passed,
                    "equilibrium_score": equilibrium_score,
                    "top_violations": [v.to_dict() for v in balance_result.violations[:5]],
                    "non_equilibrium_drives": non_eq_drives[:5],
                },
                "traps_detected": traps_detected,
                "controller_recommendations": recommendations,
            }

            # Write report if output path provided
            report_path = None
            if output_path:
                report_path = Path(output_path)
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(json.dumps(report, indent=2))

            return {
                "success": True,
                "report_path": str(report_path) if report_path else None,
                "potentials": report["potentials"],
                "action_summary": report["action"],
                "balance": report["balance"],
                "traps_detected": traps_detected,
                "controller_recommendations": recommendations,
            }

        finally:
            db.close()

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to generate dynamics report: {e}",
        }


def _generate_recommendations(
    action_summary: dict[str, Any],
    balance_result: Any,
    traps: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Generate exploration parameter recommendations based on dynamics analysis.

    Returns per-domain recommendations for temperature, parallelism, etc.
    """
    recommendations: dict[str, Any] = {
        "global": {},
        "by_domain": {},
    }

    # Global action rate assessment
    global_action = action_summary.get("global_action_rate", 0.0)

    if global_action < 0.1:
        recommendations["global"]["temperature"] = "increase"
        recommendations["global"]["reason"] = "Low action rate indicates insufficient exploration"
    elif global_action > 0.5:
        recommendations["global"]["temperature"] = "decrease"
        recommendations["global"]["reason"] = "High action rate may indicate too much randomness"
    else:
        recommendations["global"]["temperature"] = "maintain"
        recommendations["global"]["reason"] = "Action rate in healthy range"

    # Balance assessment
    if not balance_result.passed:
        recommendations["global"]["balance_warning"] = True
        recommendations["global"]["balance_advice"] = (
            f"χ²/ndf={balance_result.chi2_per_ndf:.2f} exceeds threshold. "
            "Consider adjusting prompts or adding explicit guidance for problematic transitions."
        )

    # Trap assessment
    if traps:
        trap_states = [t.get("state_id", "unknown") for t in traps]
        recommendations["global"]["traps_detected"] = len(traps)
        recommendations["global"]["trap_advice"] = (
            f"Detected {len(traps)} potential traps. "
            "Consider increasing temperature or parallelism for affected states."
        )
        recommendations["global"]["trap_states"] = trap_states[:5]

    # Per-domain recommendations
    by_domain = action_summary.get("by_domain", {})
    for domain, rate in by_domain.items():
        domain_rec: dict[str, Any] = {}

        if rate < 0.1:
            domain_rec["temperature"] = "increase"
            domain_rec["parallelism"] = "increase"
            domain_rec["reason"] = f"Low action rate ({rate:.3f}) in {domain}"
        elif rate > 0.5:
            domain_rec["temperature"] = "decrease"
            domain_rec["reason"] = f"High action rate ({rate:.3f}) in {domain}"
        else:
            domain_rec["temperature"] = "maintain"
            domain_rec["reason"] = f"Healthy action rate ({rate:.3f}) in {domain}"

        recommendations["by_domain"][domain] = domain_rec

    return recommendations


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate comprehensive dynamics analysis report"
    )
    parser.add_argument("db_path", help="Path to dynamics SQLite database")
    parser.add_argument(
        "--window-days",
        type=int,
        default=30,
        help="Number of days to include (default: 30)",
    )
    parser.add_argument(
        "--smoothing",
        type=float,
        default=1.0,
        help="Laplace smoothing alpha (default: 1.0)",
    )
    parser.add_argument(
        "--output", "-o", help="Output path for dynamics_report.json"
    )
    parser.add_argument("--json", action="store_true", help="Output raw JSON")

    args = parser.parse_args()

    result = execute(
        dynamics_db_path=args.db_path,
        window_days=args.window_days,
        smoothing_alpha=args.smoothing,
        output_path=args.output,
    )

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if not result.get("success"):
            print(f"Error: {result.get('error')}")
            sys.exit(1)

        print("\n" + "=" * 70)
        print("DYNAMICS REPORT")
        print("=" * 70)

        # Potentials summary
        potentials = result.get("potentials", {})
        fit_info = potentials.get("fit_info", {})
        print(f"\nPotential Estimation:")
        print(f"  States:     {len(potentials.get('by_state', {}))}")
        print(f"  Edges used: {fit_info.get('edges_used', 0)}")
        if fit_info.get("rmse_logratio"):
            print(f"  RMSE:       {fit_info['rmse_logratio']:.4f}")

        # Action summary
        action = result.get("action_summary", {})
        print(f"\nAction Metrics:")
        print(f"  Global rate: {action.get('global_action_rate', 0):.4f}")
        for domain, rate in action.get("by_domain", {}).items():
            print(f"  {domain}: {rate:.4f}")

        # Balance summary
        balance = result.get("balance", {})
        print(f"\nDetailed Balance:")
        print(f"  χ²/ndf:     {balance.get('chi2_per_ndf', 0):.3f}")
        print(f"  Passed:     {'YES' if balance.get('passed') else 'NO'}")
        print(f"  Eq Score:   {balance.get('equilibrium_score', 0):.3f}")

        # Traps
        traps = result.get("traps_detected", [])
        if traps:
            print(f"\nTraps Detected ({len(traps)}):")
            for t in traps[:3]:
                print(f"  - {t.get('state_id', 'unknown')[:30]}")
                print(f"    {t.get('reason', '')}")

        # Recommendations
        recs = result.get("controller_recommendations", {})
        global_rec = recs.get("global", {})
        print(f"\nRecommendations:")
        print(f"  Temperature: {global_rec.get('temperature', 'unknown')}")
        print(f"  Reason: {global_rec.get('reason', 'N/A')}")
        if global_rec.get("balance_warning"):
            print(f"  Balance: {global_rec.get('balance_advice', '')}")

        if result.get("report_path"):
            print(f"\nReport written to: {result['report_path']}")

        print("=" * 70 + "\n")

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
