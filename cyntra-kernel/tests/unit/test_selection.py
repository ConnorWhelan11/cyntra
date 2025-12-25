"""Tests for Pareto/NSGA-II style selection."""

from __future__ import annotations

from cyntra.evolve.selection import non_dominated_sort, select_survivors


def test_non_dominated_sort_and_select_survivors() -> None:
    items = [
        {"genome_id": "a", "pass_rate": 1.0, "avg_cost_usd": 2.0},
        {"genome_id": "b", "pass_rate": 0.9, "avg_cost_usd": 1.0},
        {"genome_id": "c", "pass_rate": 1.0, "avg_cost_usd": 3.0},
        {"genome_id": "d", "pass_rate": 0.8, "avg_cost_usd": 4.0},
    ]
    objectives = {"pass_rate": "max", "avg_cost_usd": "min"}

    fronts = non_dominated_sort(items, objectives)
    assert fronts

    frontier_ids = {items[i]["genome_id"] for i in fronts[0]}
    assert frontier_ids == {"a", "b"}

    survivors = select_survivors(items, objectives, k=2)
    survivor_ids = {s["genome_id"] for s in survivors}
    assert survivor_ids == {"a", "b"}

