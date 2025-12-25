from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cyntra.planner import outcome_eval


def test_evaluate_outcome_dataset_uses_model_to_choose_candidate(tmp_path: Path, monkeypatch: Any) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    bundle_dir = tmp_path / "bundle"
    bundle_dir.mkdir()

    row = {
        "planner_input": {"job_type": "code"},
        "bench": {
            "candidates": [
                {
                    "action": ["serial_handoff", 1, "NA", "NA"],
                    "verified": False,
                    "duration_ms": 10,
                    "cost_usd": None,
                },
                {
                    "action": ["speculate_vote", 2, "NA", "NA"],
                    "verified": True,
                    "duration_ms": 5,
                    "cost_usd": None,
                },
            ]
        },
    }
    dataset_path.write_text(json.dumps(row) + "\n", encoding="utf-8")

    class FakePlanner:
        def __init__(self, _: Path) -> None:
            pass

        def select_best_action(self, __: dict[str, Any], candidates: list[tuple]) -> tuple:
            return candidates[1]

    monkeypatch.setattr(outcome_eval, "OnnxPlanner", FakePlanner)

    report = outcome_eval.evaluate_outcome_dataset(dataset_path=dataset_path, bundle_dir=bundle_dir)
    assert report["baseline"]["pass_rate"] == 0.0
    assert report["model"]["pass_rate"] == 1.0
    assert report["model"]["oracle_match_rate"] == 1.0

