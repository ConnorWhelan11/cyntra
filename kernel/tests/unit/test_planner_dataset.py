from __future__ import annotations

import json
from pathlib import Path

from cyntra.planner.dataset import build_and_write_dataset


def _write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2))


def _make_archive(workcell_dir: Path, *, issue_id: str, started_at: str) -> None:
    workcell_dir.mkdir(parents=True, exist_ok=True)

    _write_json(
        workcell_dir / "manifest.json",
        {
            "schema_version": "1.0.0",
            "workcell_id": workcell_dir.name,
            "job_type": "code",
            "toolchain": "codex",
            "toolchain_config": {"model": "gpt-5.2"},
            "speculate_mode": False,
            "speculate_tag": None,
            "issue": {
                "id": issue_id,
                "title": "Test",
                "description": None,
                "acceptance_criteria": [],
                "context_files": [],
                "forbidden_paths": [],
                "dk_estimated_tokens": 50000,
                "tags": ["gate:test"],
            },
        },
    )

    _write_json(
        workcell_dir / "proof.json",
        {
            "schema_version": "1.0.0",
            "workcell_id": workcell_dir.name,
            "issue_id": issue_id,
            "status": "success",
            "patch": {
                "branch": "wc/1/0000",
                "base_commit": "0" * 40,
                "head_commit": "1" * 40,
                "diff_stats": {"files_changed": 0, "insertions": 0, "deletions": 0},
                "files_modified": [],
                "forbidden_path_violations": [],
            },
            "verification": {"gates": {}, "all_passed": True, "blocking_failures": []},
            "metadata": {
                "toolchain": "codex",
                "model": "gpt-5.2",
                "started_at": started_at,
                "completed_at": started_at,
                "duration_ms": 1234,
                "exit_code": 0,
            },
            "confidence": 0.9,
            "risk_classification": "low",
        },
    )


def test_build_and_write_dataset_is_deterministic(tmp_path: Path) -> None:
    # Minimal repo layout.
    (tmp_path / ".beads").mkdir()
    (tmp_path / ".cyntra" / "archives").mkdir(parents=True)

    # One issue definition.
    (tmp_path / ".beads" / "issues.jsonl").write_text(
        json.dumps(
            {
                "id": "1",
                "title": "Test",
                "status": "ready",
                "created": "2025-12-20T00:00:00Z",
                "updated": "2025-12-20T00:00:00Z",
                "tags": ["gate:test"],
                "dk_priority": "P2",
                "dk_risk": "medium",
                "dk_size": "M",
                "dk_tool_hint": None,
                "dk_attempts": 0,
            }
        )
        + "\n"
    )

    # Two archives in timestamp order.
    _make_archive(
        tmp_path / ".cyntra" / "archives" / "wc-1",
        issue_id="1",
        started_at="2025-12-20T00:00:00Z",
    )
    _make_archive(
        tmp_path / ".cyntra" / "archives" / "wc-2",
        issue_id="1",
        started_at="2025-12-20T01:00:00Z",
    )

    out1 = tmp_path / "out1"
    out2 = tmp_path / "out2"

    meta1 = build_and_write_dataset(repo_root=tmp_path, out_dir=out1, include_world=False)
    meta2 = build_and_write_dataset(repo_root=tmp_path, out_dir=out2, include_world=False)

    assert meta1["dataset_hash"] == meta2["dataset_hash"]
    assert meta1["example_count"] == 2

    # Second example should see the first in its leakage-safe history.
    lines = (out1 / "dataset.jsonl").read_text().splitlines()
    assert len(lines) == 2
    second = json.loads(lines[1])
    history = second["planner_input"]["history"]["last_n_similar_runs"]
    assert isinstance(history, list)
    assert len(history) == 1
    assert isinstance(second.get("tokens"), list)
    assert all(isinstance(t, str) for t in second["tokens"])
