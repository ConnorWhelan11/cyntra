"""
Detailed Balance Verification for Cyntra Dynamics.

Based on: "Detailed balance in LLM-driven agents" (arXiv:2512.10047)

This module provides χ²/ndf statistics for verifying detailed balance:
    π(f)P(g|f) = π(g)P(f|g)

Which in log-space becomes:
    log(T(g←f)) - log(T(f←g)) = β(V(f) - V(g))

Where T is the transition count and V is the potential.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class BalanceViolation:
    """A violation of detailed balance between two states."""

    from_state: str
    to_state: str
    expected_log_ratio: float  # β(V(f) - V(g))
    observed_log_ratio: float  # log(T(g←f)) - log(T(f←g))
    residual: float  # Difference
    chi2_contribution: float  # Contribution to χ²
    forward_count: int
    backward_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "from_state": self.from_state,
            "to_state": self.to_state,
            "expected_log_ratio": self.expected_log_ratio,
            "observed_log_ratio": self.observed_log_ratio,
            "residual": self.residual,
            "chi2_contribution": self.chi2_contribution,
            "forward_count": self.forward_count,
            "backward_count": self.backward_count,
        }


@dataclass
class BalanceResult:
    """Result of detailed balance verification."""

    chi2: float  # Sum of (observed - expected)² / variance
    ndf: int  # Number of degrees of freedom (reversible edges - 1)
    chi2_per_ndf: float  # χ²/ndf - should be ~1.0 if detailed balance holds
    passed: bool  # Whether χ²/ndf < threshold
    threshold: float  # Threshold used for pass/fail
    violations: list[BalanceViolation] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "chi2": self.chi2,
            "ndf": self.ndf,
            "chi2_per_ndf": self.chi2_per_ndf,
            "passed": self.passed,
            "threshold": self.threshold,
            "violations": [v.to_dict() for v in self.violations],
            "summary": self.summary,
        }


def verify_detailed_balance(
    counts: list[dict[str, Any]],
    potentials: dict[str, float],
    *,
    beta: float = 1.0,
    alpha: float = 1.0,
    chi2_threshold: float = 3.0,
    top_violations: int = 10,
) -> BalanceResult:
    """
    Verify detailed balance using χ²/ndf statistics.

    For detailed balance to hold:
        log(T(g←f)/T(f←g)) ≈ β(V(f) - V(g))

    Args:
        counts: List of {from_state, to_state, count} transition counts
        potentials: Dict mapping state_id -> V(state)
        beta: Inverse temperature parameter
        alpha: Laplace smoothing for counts
        chi2_threshold: Threshold for χ²/ndf to pass (paper uses 3.0)
        top_violations: Number of top violations to return

    Returns:
        BalanceResult with χ²/ndf statistics and violations
    """
    # Build counts map
    counts_map: dict[tuple[str, str], int] = {}
    for row in counts:
        from_state = row.get("from_state")
        to_state = row.get("to_state")
        if not from_state or not to_state or from_state == to_state:
            continue
        count = int(row.get("count") or 0)
        if count <= 0:
            continue
        counts_map[(from_state, to_state)] = count

    # Find reversible edges (both directions observed)
    violations: list[BalanceViolation] = []
    chi2_sum = 0.0
    seen_pairs: set[tuple[str, str]] = set()

    for (a, b), count_ab in counts_map.items():
        # Only process each pair once
        pair = tuple(sorted((a, b)))
        if pair in seen_pairs:
            continue

        # Check if reverse exists
        count_ba = counts_map.get((b, a), 0)
        if count_ba == 0:
            continue

        seen_pairs.add(pair)

        # Compute observed log-ratio with Laplace smoothing
        observed_log_ratio = math.log((count_ab + alpha) / (count_ba + alpha))

        # Compute expected log-ratio from potentials
        v_a = potentials.get(a, 0.0)
        v_b = potentials.get(b, 0.0)
        expected_log_ratio = beta * (v_a - v_b)

        # Residual
        residual = observed_log_ratio - expected_log_ratio

        # Variance estimate (from Poisson statistics)
        # Var(log(n)) ≈ 1/n for large n
        variance = (1.0 / (count_ab + alpha)) + (1.0 / (count_ba + alpha))

        # χ² contribution
        chi2_contribution = (residual ** 2) / variance if variance > 0 else 0.0
        chi2_sum += chi2_contribution

        violations.append(
            BalanceViolation(
                from_state=a,
                to_state=b,
                expected_log_ratio=expected_log_ratio,
                observed_log_ratio=observed_log_ratio,
                residual=residual,
                chi2_contribution=chi2_contribution,
                forward_count=count_ab,
                backward_count=count_ba,
            )
        )

    # Degrees of freedom = number of reversible edges - 1 (for anchor)
    ndf = max(len(seen_pairs) - 1, 1)
    chi2_per_ndf = chi2_sum / ndf if ndf > 0 else 0.0

    # Sort violations by χ² contribution
    violations.sort(key=lambda v: -v.chi2_contribution)
    top_violations_list = violations[:top_violations]

    # Compute summary statistics
    total_forward = sum(counts_map.values())
    reversible_edges = len(seen_pairs)
    mean_residual = sum(v.residual for v in violations) / len(violations) if violations else 0.0
    std_residual = (
        math.sqrt(sum((v.residual - mean_residual) ** 2 for v in violations) / len(violations))
        if violations
        else 0.0
    )

    summary = {
        "total_transitions": total_forward,
        "reversible_edges": reversible_edges,
        "mean_residual": mean_residual,
        "std_residual": std_residual,
        "num_violations_high": sum(1 for v in violations if v.chi2_contribution > chi2_threshold),
    }

    return BalanceResult(
        chi2=chi2_sum,
        ndf=ndf,
        chi2_per_ndf=chi2_per_ndf,
        passed=chi2_per_ndf < chi2_threshold,
        threshold=chi2_threshold,
        violations=top_violations_list,
        summary=summary,
    )


def identify_non_equilibrium_drives(
    violations: list[BalanceViolation],
    *,
    threshold_chi2: float = 3.0,
) -> list[dict[str, Any]]:
    """
    Identify non-equilibrium drives from balance violations.

    Non-equilibrium drives are systematic deviations from detailed balance
    that indicate the agent has a persistent preference for certain
    state transitions beyond what the potential function predicts.

    Args:
        violations: List of BalanceViolation objects
        threshold_chi2: Minimum χ² contribution to flag as a drive

    Returns:
        List of non-equilibrium drive descriptions
    """
    drives: list[dict[str, Any]] = []

    for v in violations:
        if v.chi2_contribution < threshold_chi2:
            continue

        # Determine drive direction
        if v.residual > 0:
            # More forward than expected
            direction = f"{v.from_state} → {v.to_state}"
            interpretation = "Agent prefers this transition more than potential predicts"
        else:
            # More backward than expected
            direction = f"{v.to_state} → {v.from_state}"
            interpretation = "Agent prefers reverse transition more than potential predicts"

        drives.append(
            {
                "edge": (v.from_state, v.to_state),
                "direction": direction,
                "residual": v.residual,
                "chi2_contribution": v.chi2_contribution,
                "interpretation": interpretation,
                "recommendation": _recommend_intervention(v),
            }
        )

    return drives


def _recommend_intervention(violation: BalanceViolation) -> str:
    """Generate intervention recommendation for a balance violation."""
    if abs(violation.residual) > 1.0:
        # Large deviation - likely systematic issue
        return (
            "Large deviation suggests systematic bias. "
            "Consider adjusting prompt or adding explicit guidance."
        )
    if violation.chi2_contribution > 10.0:
        # Very significant statistically
        return (
            "Highly significant deviation. "
            "May indicate the agent is stuck in a local optimum or "
            "the potential function is poorly calibrated for this state pair."
        )
    return (
        "Moderate deviation. "
        "May resolve with more data or temperature adjustment."
    )


def compute_equilibrium_score(balance_result: BalanceResult) -> float:
    """
    Compute an equilibrium score from 0-1.

    1.0 = perfect detailed balance
    0.0 = severe violations

    Uses sigmoid transform of χ²/ndf.
    """
    chi2_per_ndf = balance_result.chi2_per_ndf

    # Sigmoid transform centered at threshold
    # score = 1 / (1 + exp((χ²/ndf - threshold) / scale))
    scale = balance_result.threshold / 2
    centered = chi2_per_ndf - balance_result.threshold
    score = 1.0 / (1.0 + math.exp(centered / scale))

    return max(0.0, min(1.0, score))


def verify_detailed_balance_from_db(
    db_path: str,
    *,
    domain: str | None = None,
    beta: float = 1.0,
    chi2_threshold: float = 3.0,
) -> BalanceResult:
    """
    Verify detailed balance directly from transition database.

    Convenience function that loads data and runs verification.

    Args:
        db_path: Path to transition database
        domain: Filter by domain (optional)
        beta: Inverse temperature
        chi2_threshold: χ²/ndf threshold for passing

    Returns:
        BalanceResult
    """
    from pathlib import Path

    from cyntra.dynamics.potential import estimate_potential
    from cyntra.dynamics.transition_db import TransitionDB

    db = TransitionDB(Path(db_path))

    try:
        counts = db.transition_counts()
        states = db.load_states()

        # Filter by domain if specified
        if domain:
            domain_states = {
                sid for sid, sdata in states.items() if sdata.get("domain") == domain
            }
            counts = [
                c
                for c in counts
                if c.get("from_state") in domain_states and c.get("to_state") in domain_states
            ]

        state_ids = set()
        for c in counts:
            state_ids.add(c.get("from_state"))
            state_ids.add(c.get("to_state"))

        # Estimate potentials
        potentials, _stderr, _info = estimate_potential(
            counts=counts, state_ids=state_ids, alpha=1.0
        )

        return verify_detailed_balance(
            counts=counts,
            potentials=potentials,
            beta=beta,
            chi2_threshold=chi2_threshold,
        )

    finally:
        db.close()
