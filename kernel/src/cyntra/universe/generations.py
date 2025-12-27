from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from cyntra.evolve.pareto import pareto_frontier
from cyntra.universe.run_context import read_run_context


@dataclass(frozen=True)
class UniverseGenerationIndexRecord:
    universe_id: str
    run_id: str
    world_id: str | None
    objective_id: str | None
    kind: str
    generation: int | None = None
    bench: str | None = None
    seed: int | None = None
    population_size: int | None = None
    generated_at: str | None = None
    objectives: dict[str, str] | None = None
    frontier: list[dict[str, Any]] | None = None
    artifacts: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "universe_id": self.universe_id,
            "run_id": self.run_id,
            "world_id": self.world_id,
            "objective_id": self.objective_id,
            "kind": self.kind,
            "generation": self.generation,
            "bench": self.bench,
            "seed": self.seed,
            "population_size": self.population_size,
            "generated_at": self.generated_at,
            "objectives": self.objectives,
            "frontier": self.frontier,
            "artifacts": self.artifacts,
        }


def _read_json_dict(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None
    return raw


def _collect_artifacts(run_dir: Path) -> dict[str, str]:
    artifacts: dict[str, str] = {}
    candidates = {
        "evolve_world": "evolve_world.json",
        "evolve_run": "evolve_run.json",
        "evolve_loop": "evolve_loop.json",
        "frontier": "frontier.json",
    }
    for key, rel_path in candidates.items():
        if (run_dir / rel_path).exists():
            artifacts[key] = rel_path
    if (run_dir / "evals").is_dir():
        artifacts["evals_dir"] = "evals"
    return artifacts


def _normalize_frontier(raw: object) -> list[dict[str, Any]] | None:
    if not isinstance(raw, list):
        return None
    items: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            items.append(item)
    return items


def build_generations_index(
    *,
    universe_id: str,
    runs_dir: Path,
    output_path: Path,
) -> tuple[Path, int]:
    runs_dir = runs_dir.resolve()
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    records: list[UniverseGenerationIndexRecord] = []

    if runs_dir.exists():
        for run_dir in sorted((p for p in runs_dir.iterdir() if p.is_dir()), key=lambda p: p.name):
            ctx = read_run_context(run_dir)
            if ctx is None or ctx.universe_id != universe_id:
                continue

            evolve_world_path = run_dir / "evolve_world.json"
            evolve_loop_path = run_dir / "evolve_loop.json"
            evolve_run_path = run_dir / "evolve_run.json"

            if evolve_world_path.exists():
                data = _read_json_dict(evolve_world_path) or {}
                history = data.get("history")
                objectives = (
                    data.get("objectives") if isinstance(data.get("objectives"), dict) else None
                )
                if isinstance(history, list):
                    for entry in history:
                        if not isinstance(entry, dict):
                            continue
                        generation = (
                            entry.get("generation")
                            if isinstance(entry.get("generation"), int)
                            else None
                        )

                        frontier = None
                        if objectives:
                            candidate_items: list[dict[str, Any]] = []
                            candidates = entry.get("candidates")
                            if isinstance(candidates, list):
                                for candidate in candidates:
                                    if not isinstance(candidate, dict):
                                        continue
                                    run_id = candidate.get("run_id")
                                    metrics = candidate.get("metrics")
                                    if not isinstance(run_id, str) or not isinstance(metrics, dict):
                                        continue
                                    merged: dict[str, Any] = {"run_id": run_id}
                                    for key, value in metrics.items():
                                        if isinstance(key, str):
                                            merged[key] = value
                                    candidate_items.append(merged)

                            if candidate_items:
                                frontier = pareto_frontier(candidate_items, objectives)

                        records.append(
                            UniverseGenerationIndexRecord(
                                universe_id=universe_id,
                                run_id=run_dir.name,
                                world_id=ctx.world_id,
                                objective_id=ctx.objective_id,
                                kind="evolve_world",
                                generation=generation,
                                bench=None,
                                seed=data.get("seed")
                                if isinstance(data.get("seed"), int)
                                else None,
                                population_size=data.get("population_size")
                                if isinstance(data.get("population_size"), int)
                                else None,
                                generated_at=data.get("generated_at")
                                if isinstance(data.get("generated_at"), str)
                                else None,
                                objectives=objectives,
                                frontier=frontier,
                                artifacts=_collect_artifacts(run_dir),
                            )
                        )

                continue
            if evolve_loop_path.exists():
                data = _read_json_dict(evolve_loop_path) or {}
                history = data.get("history")
                if isinstance(history, list):
                    for entry in history:
                        if not isinstance(entry, dict):
                            continue
                        generation = (
                            entry.get("generation")
                            if isinstance(entry.get("generation"), int)
                            else None
                        )
                        frontier = _normalize_frontier(entry.get("frontier"))
                        records.append(
                            UniverseGenerationIndexRecord(
                                universe_id=universe_id,
                                run_id=run_dir.name,
                                world_id=ctx.world_id,
                                objective_id=ctx.objective_id,
                                kind="evolve_loop",
                                generation=generation,
                                bench=data.get("bench")
                                if isinstance(data.get("bench"), str)
                                else None,
                                seed=data.get("seed")
                                if isinstance(data.get("seed"), int)
                                else None,
                                population_size=data.get("population_size")
                                if isinstance(data.get("population_size"), int)
                                else None,
                                generated_at=data.get("generated_at")
                                if isinstance(data.get("generated_at"), str)
                                else None,
                                objectives=data.get("objectives")
                                if isinstance(data.get("objectives"), dict)
                                else None,
                                frontier=frontier,
                                artifacts=_collect_artifacts(run_dir),
                            )
                        )
                continue

            if evolve_run_path.exists():
                data = _read_json_dict(evolve_run_path) or {}
                frontier_json = _read_json_dict(run_dir / "frontier.json") or {}
                frontier_items = _normalize_frontier(frontier_json.get("items"))
                records.append(
                    UniverseGenerationIndexRecord(
                        universe_id=universe_id,
                        run_id=run_dir.name,
                        world_id=ctx.world_id,
                        objective_id=ctx.objective_id,
                        kind="evolve_run",
                        generation=0,
                        bench=data.get("bench") if isinstance(data.get("bench"), str) else None,
                        seed=data.get("seed") if isinstance(data.get("seed"), int) else None,
                        population_size=None,
                        generated_at=data.get("generated_at")
                        if isinstance(data.get("generated_at"), str)
                        else None,
                        objectives=data.get("objectives")
                        if isinstance(data.get("objectives"), dict)
                        else None,
                        frontier=frontier_items,
                        artifacts=_collect_artifacts(run_dir),
                    )
                )

    records.sort(key=lambda rec: (rec.run_id, rec.generation if rec.generation is not None else -1))

    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.to_dict(), ensure_ascii=False, sort_keys=True) + "\n")
    tmp_path.replace(output_path)

    return output_path, len(records)
