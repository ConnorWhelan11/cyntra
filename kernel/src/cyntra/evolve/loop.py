"""
Evolution loop for prompt genome optimization.

This is Cyntra-native (not DSPy/GEPA):
- Mutate prompt genomes
- Evaluate on a bench (either custom `evaluate_genome()` or kernel-backed cases)
- Select survivors using Pareto fronts + crowding distance
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from cyntra.evolve.genome import create_genome, load_genome, save_genome
from cyntra.evolve.kernel_eval import evaluate_genome_on_issues_sync, resolve_bench_issues
from cyntra.evolve.mutation import mutate_genome
from cyntra.evolve.pareto import pareto_frontier
from cyntra.evolve.selection import select_survivors
from cyntra.kernel.config import KernelConfig

logger = structlog.get_logger()


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _as_objectives(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    objectives: dict[str, str] = {}
    for key, direction in raw.items():
        if not isinstance(key, str):
            continue
        direction_s = str(direction).strip().lower()
        if direction_s not in ("max", "min"):
            continue
        objectives[key] = direction_s
    return objectives


def resolve_base_genome(
    bench: dict[str, Any],
    *,
    base_genome_path: Path | None = None,
) -> dict[str, Any]:
    if base_genome_path is not None:
        return load_genome(base_genome_path)

    base = bench.get("base_genome")
    if isinstance(base, dict):
        return dict(base)

    return create_genome(
        domain=str(bench.get("domain") or "code"),
        toolchain=str(bench.get("toolchain") or "codex"),
        system_prompt=str(bench.get("system_prompt") or ""),
        instruction_blocks=bench.get("instruction_blocks") or [],
        tool_use_rules=bench.get("tool_use_rules") or [],
        sampling=bench.get("sampling") or {},
        metadata={"bench": bench.get("name") or "bench"},
    )


@dataclass(frozen=True)
class GenomeEval:
    genome_id: str
    generation: int
    parent_id: str | None
    metrics: dict[str, Any]
    eval_path: str | None = None


def _eval_key(metrics: dict[str, Any]) -> dict[str, Any]:
    """Flatten metrics for selection items."""
    return metrics


def evaluate_genome(
    config: KernelConfig,
    bench: dict[str, Any],
    genome: dict[str, Any],
    *,
    toolchain_override: str | None,
    keep_workcells: bool,
    max_cases: int | None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """
    Evaluate a genome and return (metrics, optional detail payload).

    If `bench["evaluate_genome"]` is provided, it's used directly (sync).
    Otherwise the bench must define `cases` and will be evaluated via kernel.
    """
    custom = bench.get("evaluate_genome")
    if callable(custom):
        metrics = custom(genome)
        if not isinstance(metrics, dict):
            raise TypeError("bench.evaluate_genome() must return a dict of metrics")
        return metrics, None

    issues = resolve_bench_issues(config, bench)
    case_results, metrics = evaluate_genome_on_issues_sync(
        config,
        issues,
        prompt_genome=genome,
        toolchain_override=toolchain_override,
        keep_workcells=keep_workcells,
        max_cases=max_cases,
    )
    detail = {
        "case_results": [r.__dict__ for r in case_results],
        "metrics": metrics,
    }
    return metrics, detail


def run_evolution_loop(
    *,
    config: KernelConfig,
    bench: dict[str, Any],
    prompts_root: Path,
    run_dir: Path,
    generations: int = 3,
    population_size: int = 6,
    seed: int | None = None,
    objectives: dict[str, str] | None = None,
    base_genome_path: Path | None = None,
    toolchain_override: str | None = None,
    keep_workcells: bool = False,
    max_cases: int | None = None,
) -> dict[str, Any]:
    """
    Run a Cyntra-native prompt evolution loop.

    Outputs:
    - `run_dir/evolve_loop.json`: summary + per-genome eval file references
    - `run_dir/evals/<genome_id>.json`: optional per-case detail (kernel mode)
    - `run_dir/frontier.json`: Pareto frontier of evaluated genomes
    - `prompts/<domain>/<toolchain>/<genome_id>.yaml`: genomes (optional, in-repo)
    """
    if generations <= 0:
        raise ValueError("generations must be >= 1")
    if population_size <= 0:
        raise ValueError("population_size must be >= 1")

    run_dir.mkdir(parents=True, exist_ok=True)
    evals_dir = run_dir / "evals"
    evals_dir.mkdir(parents=True, exist_ok=True)

    rng = random.Random(seed)

    base_genome = resolve_base_genome(bench, base_genome_path=base_genome_path)
    saved_base_path = save_genome(base_genome, prompts_root)

    eval_cache: dict[str, GenomeEval] = {}
    genome_by_id: dict[str, dict[str, Any]] = {str(base_genome["genome_id"]): base_genome}

    def ensure_population(seed_genome: dict[str, Any]) -> list[dict[str, Any]]:
        population: list[dict[str, Any]] = [seed_genome]
        attempts = 0
        while len(population) < population_size and attempts < population_size * 50:
            child = mutate_genome(seed_genome, rng)
            cid = str(child.get("genome_id"))
            attempts += 1
            if cid in genome_by_id:
                continue
            genome_by_id[cid] = child
            population.append(child)
        return population

    population = ensure_population(base_genome)

    history: list[dict[str, Any]] = []

    for generation in range(generations):
        logger.info(
            "Evolution generation",
            generation=generation,
            population=len(population),
        )

        evaluated: list[GenomeEval] = []

        for genome in population:
            genome_id = str(genome.get("genome_id"))
            if genome_id in eval_cache:
                evaluated.append(eval_cache[genome_id])
                continue

            save_genome(genome, prompts_root)

            metrics, detail = evaluate_genome(
                config,
                bench,
                genome,
                toolchain_override=toolchain_override,
                keep_workcells=keep_workcells,
                max_cases=max_cases,
            )

            eval_path = None
            if detail is not None:
                eval_file = evals_dir / f"{genome_id}.json"
                eval_file.write_text(json.dumps(detail, indent=2))
                eval_path = str(eval_file.relative_to(run_dir))

            record = GenomeEval(
                genome_id=genome_id,
                generation=generation,
                parent_id=genome.get("parent_id"),
                metrics=metrics,
                eval_path=eval_path,
            )
            eval_cache[genome_id] = record
            evaluated.append(record)

        # Selection step
        objectives_used = objectives or _as_objectives(bench.get("objectives")) or {}
        selection_items: list[dict[str, Any]] = []
        for ev in evaluated:
            selection_items.append(
                {
                    "genome_id": ev.genome_id,
                    "generation": ev.generation,
                    **_eval_key(ev.metrics),
                }
            )

        survivors_items = select_survivors(selection_items, objectives_used, k=population_size)
        survivor_ids = [str(i.get("genome_id")) for i in survivors_items]
        survivors = [genome_by_id[sid] for sid in survivor_ids if sid in genome_by_id]

        frontier_items = pareto_frontier(selection_items, objectives_used)

        history.append(
            {
                "generation": generation,
                "population": [g.get("genome_id") for g in population],
                "evaluated": [
                    {
                        "genome_id": ev.genome_id,
                        "parent_id": ev.parent_id,
                        "metrics": ev.metrics,
                        "eval_path": ev.eval_path,
                    }
                    for ev in evaluated
                ],
                "frontier": frontier_items,
                "survivors": survivor_ids,
            }
        )

        if generation == generations - 1:
            population = survivors
            break

        # Spawn next generation from survivors (elitism: keep survivors, fill with mutants).
        next_population: list[dict[str, Any]] = list(survivors)
        attempts = 0
        while len(next_population) < population_size and attempts < population_size * 200:
            parent = rng.choice(survivors)
            child = mutate_genome(parent, rng)
            cid = str(child.get("genome_id"))
            attempts += 1
            if cid in genome_by_id:
                continue
            genome_by_id[cid] = child
            next_population.append(child)
        population = next_population

    final_objectives = objectives or _as_objectives(bench.get("objectives")) or {}
    all_selection_items = []
    for ev in eval_cache.values():
        all_selection_items.append({"genome_id": ev.genome_id, **_eval_key(ev.metrics)})
    final_frontier = pareto_frontier(all_selection_items, final_objectives)

    frontier_path = run_dir / "frontier.json"
    frontier_path.write_text(
        json.dumps(
            {
                "schema_version": "cyntra.frontier.v1",
                "generated_at": _utc_now(),
                "objectives": final_objectives,
                "items": final_frontier,
            },
            indent=2,
        )
    )

    payload = {
        "schema_version": "cyntra.evolve_loop.v1",
        "run_id": run_dir.name,
        "generated_at": _utc_now(),
        "bench": bench.get("name") or bench.get("bench") or "bench",
        "base_genome_path": str(saved_base_path),
        "seed": seed,
        "generations": generations,
        "population_size": population_size,
        "objectives": final_objectives,
        "history": history,
    }
    (run_dir / "evolve_loop.json").write_text(json.dumps(payload, indent=2))

    return payload
