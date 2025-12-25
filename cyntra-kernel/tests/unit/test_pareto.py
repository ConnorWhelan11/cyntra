"""Tests for Pareto frontier utilities."""

from __future__ import annotations

from cyntra.evolve.pareto import pareto_frontier


def test_pareto_frontier_basic() -> None:
    items = [
        {"id": "a", "quality": 0.9, "cost": 5},
        {"id": "b", "quality": 0.8, "cost": 3},
        {"id": "c", "quality": 0.95, "cost": 7},
        {"id": "d", "quality": 0.7, "cost": 10},
    ]
    objectives = {"quality": "max", "cost": "min"}
    frontier = pareto_frontier(items, objectives)

    frontier_ids = {item["id"] for item in frontier}
    assert "a" in frontier_ids
    assert "b" in frontier_ids
    assert "c" in frontier_ids
    assert "d" not in frontier_ids

