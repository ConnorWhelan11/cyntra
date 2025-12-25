from __future__ import annotations

import json
from pathlib import Path

from cyntra.universe import RunContext, load_universe, read_run_context, write_run_context
from cyntra.universe.generations import build_generations_index
from cyntra.universe.index import build_runs_index, update_runs_index


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_load_universe_medica_smoke() -> None:
    repo_root = _repo_root()
    cfg = load_universe("medica", repo_root=repo_root, validate_worlds=True)
    assert cfg.universe_id == "medica"
    assert cfg.get_world("outora_library") is not None


def test_run_context_roundtrip(tmp_path: Path) -> None:
    run_dir = tmp_path / "run_001"
    ctx = RunContext(
        universe_id="medica",
        world_id="outora_library",
        objective_id="realism_perf_v1",
        swarm_id="speculate_vote",
        issue_id="42",
    )
    path = write_run_context(run_dir, ctx)
    assert path.exists()

    loaded = read_run_context(run_dir)
    assert loaded is not None
    assert loaded.universe_id == "medica"
    assert loaded.world_id == "outora_library"
    assert loaded.objective_id == "realism_perf_v1"
    assert loaded.swarm_id == "speculate_vote"
    assert loaded.issue_id == "42"


def test_universe_runs_index_rebuild_filters_by_universe(tmp_path: Path) -> None:
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()

    run_a = runs_dir / "run_a"
    run_b = runs_dir / "run_b"

    write_run_context(run_a, RunContext(universe_id="medica", world_id="w1"))
    write_run_context(run_b, RunContext(universe_id="other", world_id="w2"))

    (run_a / "run_meta.json").write_text(
        json.dumps({"label": "a", "started_ms": 123, "command": "do a"}) + "\n",
        encoding="utf-8",
    )

    output_path = tmp_path / "universes" / "medica" / "index" / "runs.jsonl"
    out_path, count = build_runs_index(
        universe_id="medica",
        runs_dir=runs_dir,
        output_path=output_path,
    )

    assert out_path == output_path.resolve()
    assert count == 1

    lines = out_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["run_id"] == "run_a"
    assert record["universe_id"] == "medica"
    assert record["world_id"] == "w1"
    assert record["label"] == "a"
    assert record["started_ms"] == 123
    assert record["command"] == "do a"
    assert record["artifacts"]["run_meta"] == "run_meta.json"
    assert record["fab_gate"] is None


def test_universe_runs_index_update_upserts_and_removes(tmp_path: Path) -> None:
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()
    output_path = tmp_path / "universes" / "medica" / "index" / "runs.jsonl"

    run_a = runs_dir / "run_a"
    write_run_context(run_a, RunContext(universe_id="medica", world_id="w1"))
    (run_a / "run_meta.json").write_text(
        json.dumps({"label": "a", "started_ms": 123, "command": "do a"}),
        encoding="utf-8",
    )

    out_path, changed = update_runs_index(
        universe_id="medica",
        runs_dir=runs_dir,
        output_path=output_path,
        run_id="run_a",
    )
    assert changed is True
    assert out_path.exists()
    assert len(out_path.read_text(encoding="utf-8").strip().splitlines()) == 1

    # Change the run's universe: update should remove from the medica index.
    write_run_context(run_a, RunContext(universe_id="other", world_id="w1"))
    _, changed = update_runs_index(
        universe_id="medica",
        runs_dir=runs_dir,
        output_path=output_path,
        run_id="run_a",
    )
    assert changed is True
    assert out_path.read_text(encoding="utf-8").strip() == ""


def test_universe_runs_index_update_noop_does_not_create_file(tmp_path: Path) -> None:
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()
    output_path = tmp_path / "universes" / "medica" / "index" / "runs.jsonl"

    run_b = runs_dir / "run_b"
    write_run_context(run_b, RunContext(universe_id="other", world_id="w2"))

    _, changed = update_runs_index(
        universe_id="medica",
        runs_dir=runs_dir,
        output_path=output_path,
        run_id="run_b",
    )
    assert changed is False
    assert not output_path.exists()


def test_universe_generations_index_rebuild(tmp_path: Path) -> None:
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()

    evo_loop = runs_dir / "evolve_loop_20250101T000000Z"
    write_run_context(evo_loop, RunContext(universe_id="medica", world_id=None, objective_id="obj"))
    (evo_loop / "evolve_loop.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.evolve_loop.v1",
                "run_id": evo_loop.name,
                "generated_at": "2025-01-01T00:00:00Z",
                "bench": "toy",
                "seed": 1,
                "population_size": 2,
                "objectives": {"quality": "max"},
                "history": [
                    {
                        "generation": 0,
                        "frontier": [{"genome_id": "gen_a", "quality": 1.0}],
                    },
                    {
                        "generation": 1,
                        "frontier": [{"genome_id": "gen_b", "quality": 1.1}],
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    (evo_loop / "frontier.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.frontier.v1",
                "items": [{"genome_id": "gen_b", "quality": 1.1}],
            }
        ),
        encoding="utf-8",
    )

    evo_run = runs_dir / "evolve_gen_a"
    write_run_context(evo_run, RunContext(universe_id="medica", world_id=None, objective_id="obj"))
    (evo_run / "evolve_run.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.evolve_run.v1",
                "run_id": evo_run.name,
                "generated_at": "2025-01-01T00:00:00Z",
                "bench": "toy",
                "objectives": {"quality": "max"},
            }
        ),
        encoding="utf-8",
    )
    (evo_run / "frontier.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.frontier.v1",
                "items": [{"genome_id": "gen_a", "quality": 1.0}],
            }
        ),
        encoding="utf-8",
    )

    output_path = tmp_path / "universes" / "medica" / "index" / "generations.jsonl"
    out_path, count = build_generations_index(
        universe_id="medica",
        runs_dir=runs_dir,
        output_path=output_path,
    )

    assert out_path == output_path.resolve()
    assert count == 3

    items = [json.loads(line) for line in out_path.read_text(encoding="utf-8").strip().splitlines()]
    kinds = {(item["run_id"], item["kind"], item["generation"]) for item in items}
    assert (evo_loop.name, "evolve_loop", 0) in kinds
    assert (evo_loop.name, "evolve_loop", 1) in kinds
    assert (evo_run.name, "evolve_run", 0) in kinds
