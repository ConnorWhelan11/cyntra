from __future__ import annotations

from datetime import UTC, datetime

import pytest

from cyntra.kernel.config import KernelConfig
from cyntra.kernel.planner_integration import KernelPlannerIntegration
from cyntra.planner.action_space import action_space_for_swarms
from cyntra.state.models import Issue


def _issue(issue_id: str = "1") -> Issue:
    now = datetime(2025, 1, 1, tzinfo=UTC).isoformat().replace("+00:00", "Z")
    return Issue.from_dict(
        {
            "id": issue_id,
            "title": "Test issue",
            "status": "open",
            "created": now,
            "updated": now,
            "description": "A test issue",
            "tags": ["kernel"],
            "dk_priority": "P2",
            "dk_risk": "medium",
            "dk_size": "M",
        }
    )


def _predicted_action(
    *,
    swarm_id: str = "speculate_vote",
    max_candidates_bin: object = 2,
    max_minutes_bin: object = 30,
    max_iterations_bin: object = "NA",
    confidence: float = 0.9,
    checkpoint_id: str = "planner_bundle_v1",
) -> dict[str, object]:
    return {
        "schema_version": "cyntra.planner_action.v1",
        "created_at": "2025-01-01T00:00:00Z",
        "swarm_id": swarm_id,
        "budgets": {
            "max_candidates_bin": max_candidates_bin,
            "max_minutes_bin": max_minutes_bin,
            "max_iterations_bin": max_iterations_bin,
        },
        "confidence": confidence,
        "abstain_to_default": False,
        "reason": None,
        "model": {"checkpoint_id": checkpoint_id},
        "input_hash": "abc",
    }


def test_decide_off_uses_baseline(monkeypatch: pytest.MonkeyPatch) -> None:
    config = KernelConfig()
    config.planner.mode = "off"
    integration = KernelPlannerIntegration(config)

    # Should not attempt to predict in off mode.
    monkeypatch.setattr(integration, "_predict_action", lambda *_: (_predicted_action(), None))

    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    selection = integration.decide(
        issue=_issue(),
        job_type="code",
        universe_id="u",
        universe_defaults={"swarm_id": "serial_handoff", "objective_id": None},
        action_space=action_space,
        history_candidates=[],
        system_state=None,
        now_ms=1_700_000_000_000,
        baseline_swarm_id="serial_handoff",
        baseline_max_candidates=1,
        baseline_timeout_cap_seconds=1800,
        max_iterations=None,
    )

    assert selection.fallback_applied is False
    assert selection.fallback_reason is None
    assert selection.max_candidates_executed == 1
    assert selection.timeout_seconds_override is None
    assert selection.planner_action.get("model", {}).get("checkpoint_id") == "baseline_heuristic_v0"


def test_decide_log_always_abstains(monkeypatch: pytest.MonkeyPatch) -> None:
    config = KernelConfig()
    config.planner.mode = "log"
    integration = KernelPlannerIntegration(config)

    monkeypatch.setattr(integration, "_predict_action", lambda *_: (_predicted_action(), None))

    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    selection = integration.decide(
        issue=_issue(),
        job_type="code",
        universe_id="u",
        universe_defaults={"swarm_id": "serial_handoff", "objective_id": None},
        action_space=action_space,
        history_candidates=[],
        system_state=None,
        now_ms=1_700_000_000_000,
        baseline_swarm_id="speculate_vote",
        baseline_max_candidates=2,
        baseline_timeout_cap_seconds=1800,
        max_iterations=None,
    )

    assert selection.fallback_applied is True
    assert selection.fallback_reason == "log_only"
    assert selection.planner_action.get("abstain_to_default") is True
    assert selection.planner_action.get("reason") == "log_only"


def test_decide_low_confidence_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    config = KernelConfig()
    config.planner.mode = "enforce"
    config.planner.confidence_threshold = 0.8
    integration = KernelPlannerIntegration(config)

    monkeypatch.setattr(
        integration,
        "_predict_action",
        lambda *_: (_predicted_action(confidence=0.2), None),
    )

    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    selection = integration.decide(
        issue=_issue(),
        job_type="code",
        universe_id="u",
        universe_defaults={"swarm_id": "serial_handoff", "objective_id": None},
        action_space=action_space,
        history_candidates=[],
        system_state=None,
        now_ms=1_700_000_000_000,
        baseline_swarm_id="speculate_vote",
        baseline_max_candidates=2,
        baseline_timeout_cap_seconds=1800,
        max_iterations=None,
    )

    assert selection.fallback_applied is True
    assert selection.fallback_reason == "low_confidence"


def test_decide_swarm_mismatch_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    config = KernelConfig()
    config.planner.mode = "enforce"
    integration = KernelPlannerIntegration(config)

    monkeypatch.setattr(
        integration,
        "_predict_action",
        lambda *_: (_predicted_action(swarm_id="serial_handoff", max_candidates_bin=1), None),
    )

    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    selection = integration.decide(
        issue=_issue(),
        job_type="code",
        universe_id="u",
        universe_defaults={"swarm_id": "serial_handoff", "objective_id": None},
        action_space=action_space,
        history_candidates=[],
        system_state=None,
        now_ms=1_700_000_000_000,
        baseline_swarm_id="speculate_vote",
        baseline_max_candidates=2,
        baseline_timeout_cap_seconds=1800,
        max_iterations=None,
    )

    assert selection.fallback_applied is True
    assert selection.fallback_reason == "swarm_mismatch"


def test_decide_enforce_applies_budget_reductions(monkeypatch: pytest.MonkeyPatch) -> None:
    config = KernelConfig()
    config.planner.mode = "enforce"
    config.planner.confidence_threshold = 0.1
    integration = KernelPlannerIntegration(config)

    monkeypatch.setattr(
        integration,
        "_predict_action",
        lambda *_: (
            _predicted_action(
                swarm_id="speculate_vote",
                max_candidates_bin=1,
                max_minutes_bin=15,
                max_iterations_bin="NA",
                confidence=0.9,
            ),
            None,
        ),
    )

    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    selection = integration.decide(
        issue=_issue(),
        job_type="code",
        universe_id="u",
        universe_defaults={"swarm_id": "serial_handoff", "objective_id": None},
        action_space=action_space,
        history_candidates=[],
        system_state=None,
        now_ms=1_700_000_000_000,
        baseline_swarm_id="speculate_vote",
        baseline_max_candidates=2,
        baseline_timeout_cap_seconds=1800,
        max_iterations=None,
    )

    assert selection.fallback_applied is False
    assert selection.max_candidates_executed == 1
    assert selection.timeout_seconds_override == 15 * 60

    bundle = integration.build_manifest_planner_bundle(
        selection=selection,
        swarm_id_executed="speculate_vote",
        timeout_seconds_default=2700,
        max_iterations_executed=None,
    )

    executed = bundle["executed_plan"]
    assert executed["swarm_id_executed"] == "speculate_vote"
    assert executed["max_candidates_executed"] == 1
    assert executed["timeout_seconds_executed"] == 15 * 60

