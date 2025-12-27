from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cyntra.universe import load_universe
from cyntra.universe.evolve_world import evolve_world


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _stub_world_evaluator(run_dir: Path, overrides: dict[str, Any], world_seed: int) -> bool:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "verdict").mkdir(parents=True, exist_ok=True)

    complexity = str(overrides.get("layout.complexity") or "")
    lighting = str(overrides.get("lighting.preset") or "")
    bake_mode = str(overrides.get("bake.mode") or "")

    complexity_score = {"low": 0.55, "medium": 0.75, "high": 0.9}.get(complexity, 0.0)
    lighting_bonus = {"dramatic": 0.0, "warm_reading": 0.03, "cosmic": 0.05}.get(lighting, 0.0)
    bake_penalty = {"all": 0.0, "layout_only": -0.02, "test": -0.25}.get(bake_mode, 0.0)

    overall = round(complexity_score + lighting_bonus + bake_penalty, 4)

    base_duration = {"low": 600, "medium": 900, "high": 1200}.get(complexity, 1000)
    lighting_cost = {"dramatic": 0, "warm_reading": 50, "cosmic": 80}.get(lighting, 0)
    bake_cost = {"all": 200, "layout_only": 120, "test": 50}.get(bake_mode, 150)

    duration_ms = int(base_duration + lighting_cost + bake_cost + (world_seed % 3))

    passed = overall >= 0.7 and bake_mode != "test"

    (run_dir / "verdict" / "gate_verdict.json").write_text(
        json.dumps(
            {
                "verdict": "pass" if passed else "fail",
                "scores": {"overall": overall, "by_critic": {}},
                "failures": {"hard": [] if passed else ["STUB_FAIL"], "soft": []},
                "timing": {"duration_ms": duration_ms},
            }
        ),
        encoding="utf-8",
    )

    return True


def test_evolve_world_is_deterministic_given_seed(tmp_path: Path) -> None:
    repo_root = _repo_root()
    universe_cfg = load_universe("medica", repo_root=repo_root, validate_worlds=False)

    kernel_a = tmp_path / "kernel_a"
    kernel_b = tmp_path / "kernel_b"

    out_a = kernel_a / "runs" / "evolve_world_test"
    out_b = kernel_b / "runs" / "evolve_world_test"

    result_a = evolve_world(
        universe_cfg=universe_cfg,
        repo_root=repo_root,
        kernel_dir=kernel_a,
        world_id="outora_library",
        objective_id="realism_perf_v1",
        swarm_id="speculate_vote",
        generations=2,
        population_size=5,
        seed=123,
        output_dir=out_a,
        reuse_existing_candidates=False,
        evaluator=_stub_world_evaluator,
    )

    result_b = evolve_world(
        universe_cfg=universe_cfg,
        repo_root=repo_root,
        kernel_dir=kernel_b,
        world_id="outora_library",
        objective_id="realism_perf_v1",
        swarm_id="speculate_vote",
        generations=2,
        population_size=5,
        seed=123,
        output_dir=out_b,
        reuse_existing_candidates=False,
        evaluator=_stub_world_evaluator,
    )

    history_a = result_a.get("history") or []
    history_b = result_b.get("history") or []
    assert len(history_a) == len(history_b) == 2

    for gen_idx in range(2):
        entry_a = history_a[gen_idx]
        entry_b = history_b[gen_idx]
        assert entry_a["selected_run_id"] == entry_b["selected_run_id"]

        runs_a = [c["run_id"] for c in entry_a.get("candidates") or []]
        runs_b = [c["run_id"] for c in entry_b.get("candidates") or []]
        assert runs_a == runs_b

    assert (out_a / "evolve_world.json").exists()
    assert (
        json.loads((out_a / "evolve_world.json").read_text(encoding="utf-8"))["schema_version"]
        == "cyntra.evolve_world.v1"
    )
