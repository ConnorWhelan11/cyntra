"""Tests for dynamics potential estimator."""

from __future__ import annotations

import math

import pytest

from cyntra.dynamics.potential import estimate_potential


def test_estimate_potential_two_state() -> None:
    counts = [
        {"from_state": "st_a", "to_state": "st_b", "count": 100},
        {"from_state": "st_b", "to_state": "st_a", "count": 25},
    ]
    state_ids = {"st_a", "st_b"}

    potentials, _stderr, fit = estimate_potential(counts, state_ids, alpha=1.0)

    expected_delta = -math.log((100 + 1) / (25 + 1))
    observed_delta = potentials["st_b"] - potentials["st_a"]

    assert fit["edges_used"] == 1
    assert observed_delta == pytest.approx(expected_delta, rel=0.1)

