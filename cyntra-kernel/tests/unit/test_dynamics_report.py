"""Tests for dynamics report builder."""

from __future__ import annotations

from pathlib import Path

from cyntra.dynamics.report import build_report
from cyntra.dynamics.state_t1 import build_state_t1
from cyntra.dynamics.transition_db import TransitionDB


def test_build_report_smoke(tmp_path: Path) -> None:
    db_path = tmp_path / "dynamics.sqlite"
    db = TransitionDB(db_path)

    from_state = build_state_t1(
        domain="code",
        job_type="code",
        features={"phase": "plan"},
        policy_key={"toolchain": "codex"},
    )
    to_state = build_state_t1(
        domain="code",
        job_type="code",
        features={"phase": "edit"},
        policy_key={"toolchain": "codex"},
    )

    transitions = [
        {
            "schema_version": "cyntra.transition.v1",
            "transition_id": "tr_1",
            "rollout_id": "ro_test",
            "from_state": from_state,
            "to_state": to_state,
            "transition_kind": "tool",
            "action_label": {"tool": "Write", "command_class": None, "domain": "code"},
            "context": {
                "issue_id": "1",
                "job_type": "code",
                "toolchain": "codex",
                "workcell_id": "wc-1",
            },
            "timestamp": "2025-12-20T19:00:00Z",
            "observations": {},
        },
        {
            "schema_version": "cyntra.transition.v1",
            "transition_id": "tr_2",
            "rollout_id": "ro_test",
            "from_state": to_state,
            "to_state": from_state,
            "transition_kind": "tool",
            "action_label": {"tool": "Write", "command_class": None, "domain": "code"},
            "context": {
                "issue_id": "1",
                "job_type": "code",
                "toolchain": "codex",
                "workcell_id": "wc-1",
            },
            "timestamp": "2025-12-20T19:00:01Z",
            "observations": {},
        },
    ]

    db.insert_transitions(transitions)
    db.close()

    report = build_report(db_path)

    assert report["schema_version"] == "cyntra.dynamics_report.v1"
    assert report["estimation"]["fit"]["edges_used"] == 1
    assert report["action_summary"]["global_action_rate"] == 1.0
    assert report["action_summary"]["by_domain"]["code"] == 1.0

