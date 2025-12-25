"""
Action metrics and trap detection for Cyntra dynamics.
"""

from __future__ import annotations

from typing import Any


def compute_action_summary(
    counts: list[dict[str, Any]],
    potentials: dict[str, float],
    state_meta: dict[str, dict[str, Any]],
    *,
    action_low: float = 0.1,
    delta_v_low: float = 0.05,
    min_outgoing: int = 3,
) -> dict[str, Any]:
    outgoing: dict[str, int] = {}
    unique_next: dict[str, set[str]] = {}
    delta_v_sum: dict[str, float] = {}
    delta_v_count: dict[str, int] = {}

    for row in counts:
        from_state = row.get("from_state")
        to_state = row.get("to_state")
        if not from_state or not to_state:
            continue
        count = int(row.get("count") or 0)
        if count <= 0:
            continue

        outgoing[from_state] = outgoing.get(from_state, 0) + count
        unique_next.setdefault(from_state, set()).add(to_state)

        delta = abs(potentials.get(to_state, 0.0) - potentials.get(from_state, 0.0))
        delta_v_sum[from_state] = delta_v_sum.get(from_state, 0.0) + delta * count
        delta_v_count[from_state] = delta_v_count.get(from_state, 0) + count

    action_rates: dict[str, float] = {}
    delta_v_mean: dict[str, float] = {}
    for state_id, total in outgoing.items():
        action_rates[state_id] = (
            len(unique_next.get(state_id, set())) / total if total > 0 else 0.0
        )
        if delta_v_count.get(state_id):
            delta_v_mean[state_id] = delta_v_sum[state_id] / delta_v_count[state_id]
        else:
            delta_v_mean[state_id] = 0.0

    weighted_action_sum = 0.0
    weighted_total = 0
    by_domain_sum: dict[str, float] = {}
    by_domain_total: dict[str, int] = {}

    for state_id, total in outgoing.items():
        rate = action_rates.get(state_id, 0.0)
        weighted_action_sum += rate * total
        weighted_total += total

        domain = str(state_meta.get(state_id, {}).get("domain") or "unknown")
        by_domain_sum[domain] = by_domain_sum.get(domain, 0.0) + rate * total
        by_domain_total[domain] = by_domain_total.get(domain, 0) + total

    global_action_rate = weighted_action_sum / weighted_total if weighted_total else 0.0

    by_domain: dict[str, float] = {}
    for domain, total in by_domain_total.items():
        by_domain[domain] = by_domain_sum[domain] / total if total else 0.0

    traps: list[dict[str, Any]] = []
    for state_id, total in outgoing.items():
        if total < min_outgoing:
            continue
        rate = action_rates.get(state_id, 0.0)
        delta_v = delta_v_mean.get(state_id, 0.0)
        if rate < action_low and delta_v < delta_v_low:
            traps.append(
                {
                    "state_id": state_id,
                    "reason": f"low_action={rate:.3f}, delta_v={delta_v:.3f}",
                    "recommendation": "increase exploration (temperature, parallelism); switch scaffold",
                }
            )

    traps.sort(key=lambda t: t.get("state_id", ""))

    return {
        "global_action_rate": global_action_rate,
        "by_domain": by_domain,
        "traps": traps,
    }

