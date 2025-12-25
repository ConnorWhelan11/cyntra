"""
Selection utilities for evolutionary prompt optimization.

Implements a minimal NSGA-II style selection:
- Non-dominated sorting into Pareto fronts
- Crowding distance for diversity within a front
"""

from __future__ import annotations

import math
from typing import Any


def dominates(a: dict[str, Any], b: dict[str, Any], objectives: dict[str, str]) -> bool:
    """
    Return True if `a` dominates `b` under the given objective directions.

    Missing objective values are treated as non-comparable (i.e., cannot dominate).
    """
    if not objectives:
        return False

    better_or_equal = True
    strictly_better = False

    for key, direction in objectives.items():
        av = a.get(key)
        bv = b.get(key)
        if av is None or bv is None:
            return False

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


def non_dominated_sort(
    items: list[dict[str, Any]],
    objectives: dict[str, str],
) -> list[list[int]]:
    """
    Return fronts as lists of indices (front[0] is the Pareto frontier).
    """
    if not items:
        return []
    if not objectives:
        return [list(range(len(items)))]

    remaining = list(range(len(items)))
    fronts: list[list[int]] = []

    while remaining:
        front: list[int] = []
        for i in remaining:
            dominated = False
            for j in remaining:
                if i == j:
                    continue
                if dominates(items[j], items[i], objectives):
                    dominated = True
                    break
            if not dominated:
                front.append(i)

        fronts.append(front)
        front_set = set(front)
        remaining = [i for i in remaining if i not in front_set]

    return fronts


def crowding_distance(
    items: list[dict[str, Any]],
    front: list[int],
    objectives: dict[str, str],
) -> dict[int, float]:
    """
    Compute crowding distance for a front (indices -> distance).

    Distance is computed in objective-space; direction doesn't matter for spacing.
    """
    distances = {idx: 0.0 for idx in front}
    if len(front) <= 2:
        for idx in front:
            distances[idx] = math.inf
        return distances

    for key in objectives.keys():
        values: list[tuple[int, float]] = []
        for idx in front:
            raw = items[idx].get(key)
            if raw is None:
                continue
            try:
                values.append((idx, float(raw)))
            except (TypeError, ValueError):
                continue

        if len(values) < 2:
            continue

        values.sort(key=lambda x: x[1])
        min_v = values[0][1]
        max_v = values[-1][1]
        if max_v == min_v:
            continue

        distances[values[0][0]] = math.inf
        distances[values[-1][0]] = math.inf

        for pos in range(1, len(values) - 1):
            idx, val = values[pos]
            prev_val = values[pos - 1][1]
            next_val = values[pos + 1][1]
            distances[idx] += (next_val - prev_val) / (max_v - min_v)

    return distances


def select_survivors(
    items: list[dict[str, Any]],
    objectives: dict[str, str],
    *,
    k: int,
) -> list[dict[str, Any]]:
    """
    Select `k` survivors from `items` using Pareto rank + crowding distance.

    Items are returned as dicts (same objects from `items` list).
    """
    if k <= 0:
        return []
    if k >= len(items):
        return items[:]

    fronts = non_dominated_sort(items, objectives)

    selected: list[int] = []
    for front in fronts:
        if len(selected) + len(front) <= k:
            selected.extend(front)
            continue

        distances = crowding_distance(items, front, objectives)
        front_sorted = sorted(
            front,
            key=lambda idx: distances.get(idx, 0.0),
            reverse=True,
        )
        remaining = k - len(selected)
        selected.extend(front_sorted[:remaining])
        break

    return [items[i] for i in selected]

