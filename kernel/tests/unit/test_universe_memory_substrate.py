from __future__ import annotations

import json
from pathlib import Path

from cyntra.universe import RunContext, load_universe, write_run_context
from cyntra.universe.frontiers import build_world_frontiers
from cyntra.universe.patterns import build_patterns_store


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_universe_patterns_store_emits_evidence_runs(tmp_path: Path) -> None:
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()

    # Two matching-universe runs with repeated tool sequences.
    run_1 = runs_dir / "run_1"
    write_run_context(run_1, RunContext(universe_id="medica", world_id="w1", objective_id="obj"))
    (run_1 / "run_meta.json").write_text(json.dumps({"started_ms": 1000}), encoding="utf-8")
    (run_1 / "job_result.json").write_text(json.dumps({"exit_code": 0}), encoding="utf-8")
    (run_1 / "tools.jsonl").write_text(
        "\n".join(
            [
                json.dumps({"tool": "Read"}),
                json.dumps({"tool": "Edit"}),
                json.dumps({"tool": "Bash"}),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    run_2 = runs_dir / "run_2"
    write_run_context(run_2, RunContext(universe_id="medica", world_id="w1", objective_id="obj"))
    (run_2 / "run_meta.json").write_text(json.dumps({"started_ms": 2000}), encoding="utf-8")
    (run_2 / "job_result.json").write_text(json.dumps({"exit_code": 0}), encoding="utf-8")
    (run_2 / "tools.jsonl").write_text(
        "\n".join(
            [
                json.dumps({"tool": "Read"}),
                json.dumps({"tool": "Edit"}),
                json.dumps({"tool": "Bash"}),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    # Different universe run (ignored).
    run_other = runs_dir / "run_other"
    write_run_context(run_other, RunContext(universe_id="other", world_id="w1", objective_id="obj"))

    output_path = tmp_path / "universes" / "medica" / "patterns" / "patterns.jsonl"
    out_path, count = build_patterns_store(
        universe_id="medica",
        runs_dir=runs_dir,
        output_path=output_path,
        min_frequency=2,
        max_evidence_runs=5,
    )

    assert out_path == output_path.resolve()
    assert count >= 1

    records = [
        json.loads(line)
        for line in out_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert records
    for record in records:
        assert record["universe_id"] == "medica"
        assert record["evidence_runs"]
        assert isinstance(record["evidence_runs"], list)
        assert record["last_updated_at"]


def test_universe_patterns_store_emits_fab_fail_code_antipatterns(tmp_path: Path) -> None:
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()

    for idx, started_ms in enumerate((1000, 2000), start=1):
        run_dir = runs_dir / f"run_fail_{idx}"
        write_run_context(
            run_dir, RunContext(universe_id="medica", world_id="w1", objective_id="obj")
        )
        (run_dir / "run_meta.json").write_text(
            json.dumps({"started_ms": started_ms}), encoding="utf-8"
        )
        (run_dir / "verdict").mkdir()
        (run_dir / "verdict" / "gate_verdict.json").write_text(
            json.dumps(
                {
                    "verdict": "fail",
                    "scores": {"overall": 0.1, "by_critic": {}},
                    "failures": {"hard": ["HARD_FAIL_CODE"], "soft": []},
                    "timing": {"duration_ms": 10},
                }
            ),
            encoding="utf-8",
        )

    output_path = tmp_path / "universes" / "medica" / "patterns" / "patterns.jsonl"
    _, _ = build_patterns_store(
        universe_id="medica",
        runs_dir=runs_dir,
        output_path=output_path,
        min_frequency=2,
        max_evidence_runs=5,
    )

    records = [
        json.loads(line)
        for line in output_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    anti = [r for r in records if r.get("pattern_type") == "fab_fail_code"]
    assert anti
    assert anti[0]["signature"] == "HARD_FAIL_CODE"
    assert anti[0]["evidence_runs"]


def test_universe_world_frontiers_builds_pareto_set(tmp_path: Path) -> None:
    repo_root = _repo_root()
    universe_cfg = load_universe("medica", repo_root=repo_root, validate_worlds=False)

    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()

    def _make_run(name: str, started_ms: int, overall: float, duration_ms: int) -> None:
        run_dir = runs_dir / name
        write_run_context(
            run_dir,
            RunContext(
                universe_id="medica",
                world_id="outora_library",
                objective_id="realism_perf_v1",
            ),
        )
        (run_dir / "run_meta.json").write_text(
            json.dumps({"started_ms": started_ms}), encoding="utf-8"
        )
        (run_dir / "verdict").mkdir()
        (run_dir / "verdict" / "gate_verdict.json").write_text(
            json.dumps(
                {
                    "verdict": "pass",
                    "scores": {"overall": overall, "by_critic": {}},
                    "failures": {"hard": [], "soft": []},
                    "timing": {"duration_ms": duration_ms},
                }
            ),
            encoding="utf-8",
        )

    _make_run("run_a", 1000, 0.9, 1000)
    _make_run("run_b", 2000, 0.8, 500)
    _make_run("run_c", 3000, 0.7, 1500)  # dominated by run_a (better overall + faster)

    output_dir = tmp_path / "universes" / "medica" / "frontiers"
    out_path, total_points = build_world_frontiers(
        universe_cfg=universe_cfg,
        runs_dir=runs_dir,
        output_dir=output_dir,
        world_id="outora_library",
    )

    assert out_path.exists()
    assert total_points == 2

    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert payload["schema_version"] == "1.0"
    assert payload["universe_id"] == "medica"
    assert payload["world_id"] == "outora_library"
    assert payload["frontiers"]

    frontier = payload["frontiers"][0]
    assert frontier["objective_id"] == "realism_perf_v1"
    assert len(frontier["points"]) == 2
    run_ids = {p["run_id"] for p in frontier["points"]}
    assert run_ids == {"run_a", "run_b"}
