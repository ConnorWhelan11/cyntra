#!/usr/bin/env python3
"""
Detailed Balance Verifier Skill

Verify detailed balance using χ²/ndf statistics.
Based on: "Detailed balance in LLM-driven agents" (arXiv:2512.10047)
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
    db_path: str,
    domain: str | None = None,
    beta: float = 1.0,
    chi2_threshold: float = 3.0,
    top_violations: int = 10,
) -> dict[str, Any]:
    """
    Verify detailed balance from transition database.

    Args:
        db_path: Path to dynamics SQLite database
        domain: Filter by domain (optional)
        beta: Inverse temperature parameter
        chi2_threshold: χ²/ndf threshold for passing
        top_violations: Number of top violations to return

    Returns:
        {
            "success": bool,
            "chi2": float,
            "ndf": int,
            "chi2_per_ndf": float,
            "passed": bool,
            "equilibrium_score": float,
            "violations": [...],
            "non_equilibrium_drives": [...],
            "summary": {...}
        }
    """
    try:
        from cyntra.dynamics.balance import (
            compute_equilibrium_score,
            identify_non_equilibrium_drives,
            verify_detailed_balance_from_db,
        )

        result = verify_detailed_balance_from_db(
            db_path=db_path,
            domain=domain,
            beta=beta,
            chi2_threshold=chi2_threshold,
        )

        # Limit violations
        violations = result.violations[:top_violations]

        # Identify non-equilibrium drives
        drives = identify_non_equilibrium_drives(
            result.violations, threshold_chi2=chi2_threshold
        )

        # Compute equilibrium score
        eq_score = compute_equilibrium_score(result)

        return {
            "success": True,
            "chi2": result.chi2,
            "ndf": result.ndf,
            "chi2_per_ndf": result.chi2_per_ndf,
            "passed": result.passed,
            "threshold": result.threshold,
            "equilibrium_score": eq_score,
            "violations": [v.to_dict() for v in violations],
            "non_equilibrium_drives": drives,
            "summary": result.summary,
        }

    except FileNotFoundError:
        return {
            "success": False,
            "error": f"Database not found: {db_path}",
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to verify detailed balance: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Verify detailed balance in transition dynamics"
    )
    parser.add_argument("db_path", help="Path to dynamics SQLite database")
    parser.add_argument("--domain", help="Filter by domain")
    parser.add_argument(
        "--beta", type=float, default=1.0, help="Inverse temperature (default: 1.0)"
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=3.0,
        help="χ²/ndf threshold for passing (default: 3.0)",
    )
    parser.add_argument(
        "--top-violations",
        type=int,
        default=10,
        help="Number of top violations to show (default: 10)",
    )
    parser.add_argument("--output", help="Output path for result JSON")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    result = execute(
        db_path=args.db_path,
        domain=args.domain,
        beta=args.beta,
        chi2_threshold=args.threshold,
        top_violations=args.top_violations,
    )

    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
        print(f"Result written to {args.output}")
    elif args.json:
        print(json.dumps(result, indent=2))
    else:
        # Human-readable output
        if not result.get("success"):
            print(f"Error: {result.get('error')}")
            sys.exit(1)

        print("\n" + "=" * 60)
        print("DETAILED BALANCE VERIFICATION")
        print("=" * 60)
        print(f"χ²:        {result['chi2']:.3f}")
        print(f"ndf:       {result['ndf']}")
        print(f"χ²/ndf:    {result['chi2_per_ndf']:.3f}")
        print(f"Threshold: {result['threshold']:.1f}")
        print(f"Passed:    {'YES' if result['passed'] else 'NO'}")
        print(f"Eq Score:  {result['equilibrium_score']:.3f}")

        if result.get("summary"):
            print("\nSummary:")
            for k, v in result["summary"].items():
                if isinstance(v, float):
                    print(f"  {k}: {v:.4f}")
                else:
                    print(f"  {k}: {v}")

        if result.get("violations"):
            print(f"\nTop {len(result['violations'])} Violations:")
            for v in result["violations"]:
                print(f"  {v['from_state'][:20]} → {v['to_state'][:20]}")
                print(f"    χ² contrib: {v['chi2_contribution']:.3f}")
                print(f"    residual:   {v['residual']:.4f}")

        if result.get("non_equilibrium_drives"):
            print(f"\nNon-equilibrium Drives ({len(result['non_equilibrium_drives'])}):")
            for d in result["non_equilibrium_drives"][:5]:
                print(f"  {d['direction']}")
                print(f"    {d['interpretation']}")

        print("=" * 60 + "\n")

    sys.exit(0 if result.get("success") and result.get("passed", False) else 1)


if __name__ == "__main__":
    main()
