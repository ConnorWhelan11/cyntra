from __future__ import annotations

import json
from pathlib import Path

from cyntra.planner.outcome_dataset import build_outcome_dataset_rows, resolve_bench_run_dir


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def test_build_outcome_dataset_rows_from_bench_run(tmp_path: Path) -> None:
    bench_run_dir = tmp_path / "run_20250101T000000Z"
    workcell_id = "wc-1-20250101T000000Z"

    planner_input = {
        "schema_version": "cyntra.planner_input.v1",
        "created_at": "2025-01-01T00:00:00Z",
        "universe_id": "test",
        "job_type": "code",
        "universe_defaults": {"swarm_id": "serial_handoff", "objective_id": None},
        "issue": {
            "issue_id": "1",
            "dk_priority": "P2",
            "dk_risk": "low",
            "dk_size": "S",
            "dk_tool_hint": None,
            "dk_attempts": 0,
            "tags": ["bench"],
        },
        "history": {"last_n_similar_runs": []},
        "action_space": {
            "swarm_ids": ["serial_handoff", "speculate_vote"],
            "max_minutes_bins": [15, "NA"],
            "max_candidates_bins": [1, 2, "NA"],
            "max_iterations_bins": [1, "NA"],
            "validity_rules": [],
        },
        "system_state": None,
    }
    planner_action = {
        "schema_version": "cyntra.planner_action.v1",
        "created_at": "2025-01-01T00:00:00Z",
        "swarm_id": "serial_handoff",
        "budgets": {"max_candidates_bin": 1, "max_minutes_bin": "NA", "max_iterations_bin": "NA"},
        "confidence": 1.0,
        "abstain_to_default": False,
        "reason": None,
        "model": {"checkpoint_id": "bench"},
        "input_hash": "deadbeef",
    }

    manifest = {"planner": {"planner_input": planner_input, "planner_action": planner_action}}
    _write_json(bench_run_dir / "archives" / workcell_id / "manifest.json", manifest)

    best_of_k = [
        {
            "bench_config_hash": "cfg",
            "issue_id": "1",
            "title": "Bench case",
            "job_type": "code",
            "candidates": [
                {
                    "action": ["serial_handoff", 1, "NA", "NA"],
                    "verified": False,
                    "status": "failed",
                    "duration_ms": 10,
                    "cost_usd": None,
                    "workcell_id": workcell_id,
                    "details": {},
                }
            ],
            "winner": {
                "action": ["serial_handoff", 1, "NA", "NA"],
                "verified": False,
                "status": "failed",
                "duration_ms": 10,
                "cost_usd": None,
                "workcell_id": workcell_id,
                "details": {},
            },
        }
    ]
    _write_json(bench_run_dir / "results" / "best_of_k.json", best_of_k)
    _write_json(bench_run_dir / "bench_report.json", {"bench_config_hash": "cfg"})

    rows, meta = build_outcome_dataset_rows(bench_run_dir)
    assert meta["example_count"] == 1
    assert len(rows) == 1
    assert rows[0]["run_id"] == workcell_id
    assert rows[0]["planner_input"]["schema_version"] == "cyntra.planner_input.v1"
    assert isinstance(rows[0]["tokens"], list) and rows[0]["tokens"]
    assert rows[0]["label_action"]["schema_version"] == "cyntra.planner_action.v1"
    assert rows[0]["bench"]["winner"]["workcell_id"] == workcell_id


def test_resolve_bench_run_dir_picks_latest(tmp_path: Path) -> None:
    base = tmp_path / "planner_best_of_k_v1"
    older = base / "run_20240101T000000Z"
    newer = base / "run_20250101T000000Z"
    _write_json(older / "bench_report.json", {"bench_config_hash": "old"})
    _write_json(newer / "bench_report.json", {"bench_config_hash": "new"})

    resolved = resolve_bench_run_dir(base)
    assert resolved is not None
    assert resolved.name == "run_20250101T000000Z"

