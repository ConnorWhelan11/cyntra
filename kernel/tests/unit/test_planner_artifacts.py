from __future__ import annotations

from datetime import UTC, datetime

import jsonschema

from cyntra.planner.action_space import action_space_for_swarms
from cyntra.planner.artifacts import (
    build_executed_plan_v1,
    build_planner_action_v1,
    build_planner_input_v1,
)
from cyntra.planner.schemas import (
    load_executed_plan_schema,
    load_planner_action_schema,
    load_planner_input_schema,
)
from cyntra.state.models import Issue


def _make_issue() -> Issue:
    now = datetime.now(UTC)
    return Issue(
        id="1",
        title="Test issue",
        status="open",
        created=now,
        updated=now,
        tags=["gate:test", "dk:example"],
        dk_priority="P1",
        dk_risk="high",
        dk_size="M",
        dk_tool_hint="codex",
        dk_attempts=2,
    )


def test_planner_artifacts_validate_against_schemas() -> None:
    issue = _make_issue()
    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])

    planner_input = build_planner_input_v1(
        issue=issue,
        job_type="code",
        universe_id="medica",
        universe_defaults={"swarm_id": "speculate_vote", "objective_id": "realism_perf_v1"},
        action_space=action_space,
        history_candidates=[],
        system_state=None,
        now_ms=1_700_000_000_000,
        n_similar=8,
    )
    jsonschema.validate(instance=planner_input, schema=load_planner_input_schema())

    planner_action = build_planner_action_v1(
        swarm_id="serial_handoff",
        max_candidates=1,
        max_minutes=60,
        max_iterations=None,
        action_space=action_space,
        planner_input=planner_input,
        now_ms=1_700_000_000_000,
    )
    jsonschema.validate(instance=planner_action, schema=load_planner_action_schema())

    executed_plan = build_executed_plan_v1(
        swarm_id="serial_handoff",
        max_candidates=1,
        timeout_seconds=3600,
        max_iterations=None,
        fallback_applied=False,
        fallback_reason=None,
    )
    jsonschema.validate(instance=executed_plan, schema=load_executed_plan_schema())
