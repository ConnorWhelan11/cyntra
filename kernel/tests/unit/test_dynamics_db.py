"""Tests for Cyntra dynamics DB."""

from __future__ import annotations

from pathlib import Path

from cyntra.dynamics.state_t1 import build_state_t1
from cyntra.dynamics.transition_db import TransitionDB


def test_state_id_deterministic() -> None:
    state_a = build_state_t1(
        domain="code",
        job_type="code",
        features={"phase": "plan", "diff_bucket": "0"},
        policy_key={"toolchain": "codex"},
    )
    state_b = build_state_t1(
        domain="code",
        job_type="code",
        features={"phase": "plan", "diff_bucket": "0"},
        policy_key={"toolchain": "codex"},
    )
    state_c = build_state_t1(
        domain="code",
        job_type="code",
        features={"phase": "edit", "diff_bucket": "0"},
        policy_key={"toolchain": "codex"},
    )

    assert state_a["state_id"] == state_b["state_id"]
    assert state_a["state_id"] != state_c["state_id"]


def test_transition_db_roundtrip(tmp_path: Path) -> None:
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

    transition = {
        "schema_version": "cyntra.transition.v1",
        "transition_id": "tr_test",
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
    }

    inserted = db.insert_transitions([transition])
    assert inserted == 1

    counts = db.transition_counts()
    assert counts and counts[0]["count"] == 1

    probs = db.transition_probabilities()
    assert probs and probs[0]["probability"] == 1.0

    db.close()
