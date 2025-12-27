"""
Potential estimator for Cyntra dynamics.
"""

from __future__ import annotations

import math
from typing import Any


def _build_reversible_edges(
    counts: list[dict[str, Any]], alpha: float
) -> list[tuple[str, str, float, float]]:
    counts_map: dict[tuple[str, str], int] = {}
    for row in counts:
        from_state = row.get("from_state")
        to_state = row.get("to_state")
        if not from_state or not to_state:
            continue
        count = int(row.get("count") or 0)
        if count <= 0:
            continue
        counts_map[(from_state, to_state)] = count

    edges: list[tuple[str, str, float, float]] = []
    seen_pairs: set[tuple[str, str]] = set()
    for (a, b), count_ab in counts_map.items():
        if a == b:
            continue
        if (b, a) not in counts_map:
            continue
        pair = tuple(sorted((a, b)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)

        count_ba = counts_map[(b, a)]
        ratio = (count_ab + alpha) / (count_ba + alpha)
        delta = -math.log(ratio)
        weight = float(min(count_ab, count_ba))
        edges.append((a, b, delta, weight))

    edges.sort(key=lambda e: (e[0], e[1], e[2], e[3]))
    return edges


def _choose_anchor(counts: list[dict[str, Any]], state_ids: set[str]) -> str:
    totals: dict[str, int] = dict.fromkeys(state_ids, 0)
    for row in counts:
        from_state = row.get("from_state")
        if from_state not in totals:
            continue
        totals[from_state] += int(row.get("count") or 0)

    if totals:
        return max(totals.items(), key=lambda item: (item[1], item[0]))[0]
    return sorted(state_ids)[0]


def estimate_potential(
    counts: list[dict[str, Any]],
    state_ids: set[str],
    *,
    alpha: float = 1.0,
    max_iter: int = 500,
    lr: float = 0.1,
    tol: float = 1e-6,
) -> tuple[dict[str, float], dict[str, float], dict[str, Any]]:
    """
    Estimate potentials V(state) from reversible transitions.

    Returns:
        potentials, stderr_by_state, fit_info
    """
    if not state_ids:
        return {}, {}, {"rmse_logratio": None, "edges_used": 0}

    edges = _build_reversible_edges(counts, alpha)
    anchor = _choose_anchor(counts, state_ids)

    potentials = dict.fromkeys(state_ids, 0.0)
    if not edges:
        return (
            potentials,
            dict.fromkeys(state_ids, 0.0),
            {
                "rmse_logratio": None,
                "edges_used": 0,
            },
        )

    max_weight = max(edge[3] for edge in edges) or 1.0

    for _ in range(max_iter):
        max_delta = 0.0
        for a, b, delta, weight in edges:
            weight_norm = weight / max_weight
            error = (potentials[b] - potentials[a]) - delta
            if a != anchor:
                update = lr * weight_norm * error
                potentials[a] += update
                max_delta = max(max_delta, abs(update))
            if b != anchor:
                update = -lr * weight_norm * error
                potentials[b] += update
                max_delta = max(max_delta, abs(update))
        if max_delta < tol:
            break

    residuals: list[float] = []
    residuals_by_state: dict[str, list[float]] = {state_id: [] for state_id in state_ids}
    for a, b, delta, _weight in edges:
        residual = (potentials[b] - potentials[a]) - delta
        residuals.append(residual)
        residuals_by_state[a].append(residual)
        residuals_by_state[b].append(residual)

    rmse = math.sqrt(sum(r * r for r in residuals) / max(len(residuals), 1))
    stderr_by_state: dict[str, float] = {}
    for state_id, res in residuals_by_state.items():
        if res:
            stderr_by_state[state_id] = math.sqrt(sum(r * r for r in res) / len(res))
        else:
            stderr_by_state[state_id] = rmse

    return (
        potentials,
        stderr_by_state,
        {
            "rmse_logratio": rmse,
            "edges_used": len(edges),
        },
    )
