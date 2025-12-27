from __future__ import annotations

from cyntra.planner.candidates import select_candidate_actions


def test_select_candidate_actions_is_deterministic_and_includes_baseline() -> None:
    actions = [
        ("serial_handoff", 1, "NA", "NA"),
        ("speculate_vote", 1, "NA", "NA"),
        ("speculate_vote", 2, "NA", "NA"),
    ]
    baseline = ("serial_handoff", 1, "NA", "NA")

    out1 = select_candidate_actions(actions, k=2, seed=123, baseline=baseline)
    out2 = select_candidate_actions(actions, k=2, seed=123, baseline=baseline)
    assert out1 == out2
    assert baseline in out1
    # Should include an opposite-swarm candidate when available.
    assert any(a[0] == "speculate_vote" for a in out1)
