"""Tests for Cyntra rollout builder."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema

from cyntra.rollouts.builder import build_rollout
from cyntra.rollouts.schemas import load_rollout_schema


def _write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2))


def _base_manifest() -> dict:
    return {
        "schema_version": "1.0.0",
        "workcell_id": "wc-1",
        "job_type": "code",
        "toolchain": "codex",
        "toolchain_config": {"model": "gpt-5.2"},
        "speculate_mode": False,
        "speculate_tag": None,
        "issue": {
            "id": "1",
            "title": "Test rollout",
            "description": "Test",
            "acceptance_criteria": [],
            "context_files": [],
            "forbidden_paths": [],
            "tags": [],
        },
    }


def _base_proof() -> dict:
    return {
        "schema_version": "1.0.0",
        "workcell_id": "wc-1",
        "issue_id": "1",
        "status": "success",
        "patch": {
            "branch": "wc/1/0000",
            "base_commit": "0" * 40,
            "head_commit": "1" * 40,
            "diff_stats": {"files_changed": 1, "insertions": 3, "deletions": 1},
            "files_modified": ["README.md"],
        },
        "verification": {"gates": {}, "all_passed": True, "blocking_failures": []},
        "metadata": {
            "toolchain": "codex",
            "model": "gpt-5.2",
            "started_at": "2025-12-20T19:00:00Z",
            "completed_at": "2025-12-20T19:01:00Z",
            "duration_ms": 60000,
            "cost_usd": 0.01,
        },
        "risk_classification": "low",
    }


def test_build_rollout_with_telemetry(tmp_path: Path) -> None:
    workcell_path = tmp_path / "wc-1"
    workcell_path.mkdir(parents=True, exist_ok=True)

    _write_json(workcell_path / "manifest.json", _base_manifest())
    _write_json(workcell_path / "proof.json", _base_proof())

    telemetry = "\n".join(
        [
            json.dumps({"type": "file_read", "timestamp": "2025-12-20T19:00:01Z"}),
            json.dumps({"type": "file_write", "timestamp": "2025-12-20T19:00:02Z"}),
            json.dumps({"type": "bash_command", "timestamp": "2025-12-20T19:00:03Z"}),
            json.dumps({"type": "tool_call", "tool": "blender.render"}),
        ]
    )
    (workcell_path / "telemetry.jsonl").write_text(telemetry + "\n")

    rollout = build_rollout(workcell_path)
    assert rollout is not None

    summary = rollout["trajectory"]["tool_summary"]
    assert summary["Read"] == 1
    assert summary["Write"] == 1
    assert summary["Bash"] == 1
    assert summary["Blender"] == 1

    schema = load_rollout_schema()
    jsonschema.validate(instance=rollout, schema=schema)


def test_build_rollout_missing_telemetry(tmp_path: Path) -> None:
    workcell_path = tmp_path / "wc-1"
    workcell_path.mkdir(parents=True, exist_ok=True)

    _write_json(workcell_path / "manifest.json", _base_manifest())
    _write_json(workcell_path / "proof.json", _base_proof())

    rollout = build_rollout(workcell_path)
    assert rollout is not None

    assert rollout["trajectory"]["telemetry_missing_reason"] == "missing"
    schema = load_rollout_schema()
    jsonschema.validate(instance=rollout, schema=schema)


def test_build_rollout_copies_planner_manifest(tmp_path: Path) -> None:
    workcell_path = tmp_path / "wc-1"
    workcell_path.mkdir(parents=True, exist_ok=True)

    manifest = _base_manifest()
    manifest["planner"] = {
        "planner_input": {"schema_version": "cyntra.planner_input.v1"},
        "planner_action": {"schema_version": "cyntra.planner_action.v1"},
        "executed_plan": {"schema_version": "cyntra.executed_plan.v1"},
    }

    _write_json(workcell_path / "manifest.json", manifest)
    _write_json(workcell_path / "proof.json", _base_proof())

    rollout = build_rollout(workcell_path)
    assert rollout is not None

    assert rollout.get("planner") == manifest["planner"]
    schema = load_rollout_schema()
    jsonschema.validate(instance=rollout, schema=schema)
