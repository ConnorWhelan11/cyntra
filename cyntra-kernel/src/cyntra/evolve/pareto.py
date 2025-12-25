"""
Pareto frontier utilities.
"""

from __future__ import annotations

from typing import Any


def _dominates(
    a: dict[str, Any],
    b: dict[str, Any],
    objectives: dict[str, str],
) -> bool:
    better_or_equal = True
    strictly_better = False

    for key, direction in objectives.items():
        av = a.get(key)
        bv = b.get(key)
        if av is None or bv is None:
            better_or_equal = False
            continue

        if direction == "max":
            if av < bv:
                return False
            if av > bv:
                strictly_better = True
        else:
            if av > bv:
                return False
            if av < bv:
                strictly_better = True

    return better_or_equal and strictly_better


def pareto_frontier(
    items: list[dict[str, Any]],
    objectives: dict[str, str],
) -> list[dict[str, Any]]:
    if not objectives:
        return items[:]

    frontier: list[dict[str, Any]] = []
    for candidate in items:
        dominated = False
        for other in items:
            if other is candidate:
                continue
            if _dominates(other, candidate, objectives):
                dominated = True
                break
        if not dominated:
            frontier.append(candidate)

    return frontier

