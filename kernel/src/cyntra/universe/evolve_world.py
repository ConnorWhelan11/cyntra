from __future__ import annotations

import hashlib
import json
import os
import random
from collections.abc import Callable
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from cyntra.universe.config import UniverseConfig, UniverseLoadError
from cyntra.universe.run_context import RunContext, read_run_context, write_run_context


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _schemas_dir() -> Path:
    # kernel/src/cyntra/universe/evolve_world.py -> kernel/
    return Path(__file__).resolve().parents[3] / "schemas" / "cyntra"


def _load_schema(name: str) -> dict[str, Any]:
    return json.loads((_schemas_dir() / name).read_text(encoding="utf-8"))


def _validate_with_schema(data: dict[str, Any], schema_name: str) -> None:
    try:
        import jsonschema
    except ImportError:
        return
    try:
        jsonschema.validate(instance=data, schema=_load_schema(schema_name))
    except Exception as exc:
        raise UniverseLoadError(f"Schema validation failed ({schema_name}): {exc}") from exc


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


def _load_yaml_dict(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        raise UniverseLoadError(f"Failed to load YAML: {path}") from exc
    if not isinstance(raw, dict):
        raise UniverseLoadError(f"Expected a mapping at top-level: {path}")
    return dict(raw)


def _get_by_dotpath(root: dict[str, Any], key: str) -> Any:
    current: Any = root
    for part in key.split("."):
        if not isinstance(current, dict):
            raise KeyError(key)
        current = current[part]
    return current


@dataclass(frozen=True)
class GenomeGene:
    key: str
    kind: str
    values: tuple[Any, ...]

    def mutate(self, current: Any, rng: random.Random) -> Any:
        if self.kind != "enum":
            raise ValueError(f"Unsupported gene kind: {self.kind}")
        candidates = [v for v in self.values if v != current]
        if not candidates:
            return current
        return rng.choice(candidates)


@dataclass(frozen=True)
class WorldGenomeSurface:
    genome_id: str
    world_id: str
    world_config_id: str | None
    genes: tuple[GenomeGene, ...]
    per_candidate_mutations: int = 1

    @property
    def gene_keys(self) -> tuple[str, ...]:
        return tuple(g.key for g in self.genes)


def load_world_genome_surface(*, world_yaml: Path) -> WorldGenomeSurface:
    """
    Load a Fab World genome surface.

    Resolution order:
      1) `fab/worlds/<world_id>/genome.yaml` (sibling to world.yaml)
      2) Derived from `world.yaml:parameters.schema` (enum-only)
    """
    from cyntra.fab.world_config import load_world_config

    world_config = load_world_config(world_yaml)
    world_dir = world_config.world_dir
    genome_path = world_dir / "genome.yaml"

    if genome_path.exists():
        raw = _load_yaml_dict(genome_path)
        _validate_with_schema(raw, "world_genome_surface.schema.json")
        if str(raw.get("schema_version") or "").strip() != "1.0":
            raise UniverseLoadError(f'World genome schema_version must be "1.0": {genome_path}')

        genome_id = str(raw.get("genome_id") or "").strip()
        if not genome_id:
            raise UniverseLoadError(f"World genome missing `genome_id`: {genome_path}")

        world_id = str(raw.get("world_id") or "").strip()
        if not world_id:
            raise UniverseLoadError(f"World genome missing `world_id`: {genome_path}")
        if world_id != world_config.world_id:
            raise UniverseLoadError(
                f"World genome world_id mismatch: expected {world_config.world_id}, got {world_id} ({genome_path})"
            )

        world_config_id = raw.get("world_config_id")
        world_config_id_s = (
            str(world_config_id).strip() if isinstance(world_config_id, str) else None
        )

        genes_raw = raw.get("genes")
        if not isinstance(genes_raw, list) or not genes_raw:
            raise UniverseLoadError(f"World genome missing `genes` list: {genome_path}")

        genes: list[GenomeGene] = []
        for entry in genes_raw:
            if not isinstance(entry, dict):
                continue
            key = str(entry.get("key") or "").strip()
            kind = str(entry.get("kind") or "").strip()
            values_raw = entry.get("values")
            if not key or not kind:
                continue
            if not isinstance(values_raw, list) or not values_raw:
                continue
            genes.append(GenomeGene(key=key, kind=kind, values=tuple(values_raw)))

        mutation_cfg = raw.get("mutation") if isinstance(raw.get("mutation"), dict) else {}
        per_candidate = mutation_cfg.get("per_candidate", 1)
        per_candidate_int = int(per_candidate) if isinstance(per_candidate, int) else 1
        per_candidate_int = max(1, per_candidate_int)

        if not genes:
            raise UniverseLoadError(f"World genome had no valid genes: {genome_path}")

        return WorldGenomeSurface(
            genome_id=genome_id,
            world_id=world_id,
            world_config_id=world_config_id_s,
            genes=tuple(genes),
            per_candidate_mutations=per_candidate_int,
        )

    # Derive from world.yaml parameters.schema (enum-only).
    params_schema = world_config.parameters.get("schema")
    derived: list[GenomeGene] = []
    if isinstance(params_schema, dict):
        for key in sorted(params_schema.keys()):
            entry = params_schema.get(key)
            if not isinstance(entry, dict):
                continue
            if str(entry.get("type") or "").strip() != "enum":
                continue
            values_raw = entry.get("values")
            if not isinstance(values_raw, list) or not values_raw:
                continue
            derived.append(GenomeGene(key=key, kind="enum", values=tuple(values_raw)))

    if not derived:
        raise UniverseLoadError(
            f"No genome surface found and no enum schema in world.yaml: {world_yaml}"
        )

    return WorldGenomeSurface(
        genome_id=f"{world_config.world_id}_derived_surface_v1",
        world_id=world_config.world_id,
        world_config_id=str(world_config.world_config_id or "").strip() or None,
        genes=tuple(derived),
        per_candidate_mutations=1,
    )


def _candidate_hash(overrides: dict[str, Any]) -> str:
    canonical = json.dumps(overrides, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return digest[:12]


def _objective_directions(universe_cfg: UniverseConfig, objective_id: str) -> dict[str, str]:
    objectives_doc = universe_cfg.objectives or {}
    objectives = objectives_doc.get("objectives")
    if not isinstance(objectives, dict):
        return {}

    raw_obj = objectives.get(objective_id)
    if not isinstance(raw_obj, dict):
        return {}

    raw_metrics = raw_obj.get("metrics") or raw_obj.get("objectives") or {}
    if not isinstance(raw_metrics, dict):
        return {}

    directions: dict[str, str] = {}
    for key, direction in raw_metrics.items():
        if not isinstance(key, str) or not key:
            continue
        if not isinstance(direction, str):
            continue
        normalized = direction.strip().lower()
        if normalized in ("max", "min"):
            directions[key] = normalized
    return directions


def _extract_gate_metrics(run_dir: Path) -> tuple[bool, dict[str, float | int]]:
    verdict = _read_json_dict(run_dir / "verdict" / "gate_verdict.json") or {}
    metrics: dict[str, float | int] = {}

    verdict_value = verdict.get("verdict")
    passed = isinstance(verdict_value, str) and verdict_value.strip().lower() == "pass"

    scores = verdict.get("scores")
    if isinstance(scores, dict):
        overall = scores.get("overall")
        if isinstance(overall, (int, float)):
            metrics["overall"] = float(overall)

    timing = verdict.get("timing")
    if isinstance(timing, dict):
        duration_ms = timing.get("duration_ms")
        if isinstance(duration_ms, int):
            metrics["duration_ms"] = duration_ms

    failures = verdict.get("failures")
    if isinstance(failures, dict):
        hard = failures.get("hard")
        soft = failures.get("soft")
        if isinstance(hard, list):
            metrics["hard_failures"] = len(hard)
        if isinstance(soft, list):
            metrics["soft_failures"] = len(soft)

    return passed, metrics


def _sort_key_for_objectives(
    metrics: dict[str, float | int], directions: dict[str, str]
) -> tuple[Any, ...]:
    key_parts: list[Any] = []
    # Preserve objective ordering as declared in objectives.yaml (insertion order).
    for metric, direction in directions.items():
        value = metrics.get(metric)
        if not isinstance(value, (int, float)):
            key_parts.append(float("inf") if direction == "min" else float("-inf"))
            continue
        key_parts.append(value if direction == "min" else -float(value))
    return tuple(key_parts)


def _select_best_candidate(
    candidates: list[dict[str, Any]],
    *,
    directions: dict[str, str],
    require_pass: bool,
    mode: str,
) -> dict[str, Any] | None:
    eligible = []
    for item in candidates:
        if require_pass and not bool(item.get("passed")):
            continue
        if not isinstance(item.get("metrics"), dict):
            continue
        eligible.append(item)

    if not eligible:
        return None

    if mode == "gate_score_max":

        def sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
            metrics = item.get("metrics") or {}
            overall = metrics.get("overall")
            duration_ms = metrics.get("duration_ms")
            overall_key = -float(overall) if isinstance(overall, (int, float)) else float("inf")
            duration_key = (
                float(duration_ms) if isinstance(duration_ms, (int, float)) else float("inf")
            )
            return (overall_key, duration_key, str(item.get("run_id") or ""))

        return sorted(eligible, key=sort_key)[0]

    # Default: objective-aware lexicographic ordering (stable + deterministic).
    def obj_key(item: dict[str, Any]) -> tuple[Any, ...]:
        metrics = item.get("metrics") or {}
        return (_sort_key_for_objectives(metrics, directions), str(item.get("run_id") or ""))

    return sorted(eligible, key=obj_key)[0]


def _resolve_swarm(universe_cfg: UniverseConfig, swarm_id: str) -> dict[str, Any]:
    swarms_doc = universe_cfg.swarms or {}
    swarms = swarms_doc.get("swarms")
    if not isinstance(swarms, dict):
        raise UniverseLoadError(
            f"Universe swarms.yaml missing `swarms` mapping (universe={universe_cfg.universe_id})"
        )
    swarm = swarms.get(swarm_id)
    if not isinstance(swarm, dict):
        raise UniverseLoadError(
            f"Swarm not found: {swarm_id} (universe={universe_cfg.universe_id})"
        )
    return dict(swarm)


def _frontier_best_parent(
    *,
    universe_cfg: UniverseConfig,
    kernel_dir: Path,
    world_id: str,
    objective_id: str,
    directions: dict[str, str],
) -> str | None:
    frontier_path = (
        kernel_dir / "universes" / universe_cfg.universe_id / "frontiers" / f"{world_id}.json"
    )
    payload = _read_json_dict(frontier_path)
    if payload is None:
        return None
    frontiers = payload.get("frontiers")
    if not isinstance(frontiers, list):
        return None

    points: list[dict[str, Any]] = []
    for entry in frontiers:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("objective_id") or "") != objective_id:
            continue
        pts = entry.get("points")
        if isinstance(pts, list):
            for pt in pts:
                if isinstance(pt, dict):
                    points.append(pt)

    if not points:
        return None

    scored: list[tuple[tuple[Any, ...], str]] = []
    for pt in points:
        run_id = pt.get("run_id")
        values = pt.get("values")
        if not isinstance(run_id, str) or not isinstance(values, dict):
            continue
        key = _sort_key_for_objectives(values, directions)
        scored.append((key, run_id))

    if not scored:
        return None

    scored.sort(key=lambda item: (item[0], item[1]))
    return scored[0][1]


@contextmanager
def _temporary_env(overrides: dict[str, str]):
    if not overrides:
        yield
        return
    previous = {k: os.environ.get(k) for k in overrides}
    try:
        os.environ.update(overrides)
        yield
    finally:
        for key, prior in previous.items():
            if prior is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = prior


CandidateEvaluator = Callable[[Path, dict[str, Any], int], bool]


def evolve_world(
    *,
    universe_cfg: UniverseConfig,
    repo_root: Path,
    kernel_dir: Path,
    world_id: str,
    objective_id: str,
    swarm_id: str,
    generations: int,
    population_size: int | None,
    seed: int | None,
    output_dir: Path,
    reuse_existing_candidates: bool = True,
    evaluator: CandidateEvaluator | None = None,
) -> dict[str, Any]:
    """
    Deterministic world evolution loop (v1).

    - Mutates a declared genome surface (Fab World `genome.yaml`)
    - Evaluates candidates via the world pipeline + gates
    - Selects winners deterministically based on swarm selection config
    - Updates universe-scoped frontier after completion
    """
    from cyntra.fab.world_config import load_world_config
    from cyntra.fab.world_runner import run_world
    from cyntra.universe.policy import universe_env_overrides

    if generations <= 0:
        raise ValueError("generations must be >= 1")

    world_ref = universe_cfg.get_world(world_id)
    if world_ref is None:
        raise UniverseLoadError(f"World not found in universe registry: {world_id}")

    world_yaml = world_ref.resolved_path(repo_root)
    world_config = load_world_config(world_yaml)

    if seed is None:
        seed = int(world_config.get_determinism_config().get("seed", 42))

    swarm = _resolve_swarm(universe_cfg, swarm_id)
    swarm_type = str(swarm.get("type") or "parallel_compete").strip()

    if population_size is None:
        pop_raw = swarm.get("population_size") or swarm.get("population")
        if isinstance(pop_raw, int) and pop_raw > 0:
            population_size = pop_raw
        elif swarm_type == "serial_handoff":
            population_size = 1
        else:
            population_size = 3

    selection_cfg = swarm.get("selection") if isinstance(swarm.get("selection"), dict) else {}
    selection_mode = str(selection_cfg.get("mode") or "objectives").strip()
    require_pass = bool(selection_cfg.get("require_all_gates_pass", True))

    directions = _objective_directions(universe_cfg, objective_id) or {"overall": "max"}

    genome_surface = load_world_genome_surface(world_yaml=world_yaml)
    gene_keys = genome_surface.gene_keys

    # Establish parent values (evidence-driven if a frontier already exists).
    parent_from_run: str | None = _frontier_best_parent(
        universe_cfg=universe_cfg,
        kernel_dir=kernel_dir,
        world_id=world_id,
        objective_id=objective_id,
        directions=directions,
    )

    defaults_params = world_config.resolve_parameters({})
    parent_values: dict[str, Any] = {}
    if parent_from_run:
        manifest = _read_json_dict(kernel_dir / "runs" / parent_from_run / "manifest.json") or {}
        params = manifest.get("params")
        if isinstance(params, dict):
            for key in gene_keys:
                with suppress(KeyError):
                    parent_values[key] = _get_by_dotpath(params, key)

    for key in gene_keys:
        if key in parent_values:
            continue
        try:
            parent_values[key] = _get_by_dotpath(defaults_params, key)
        except KeyError as exc:
            raise UniverseLoadError(f"Genome gene key missing from world defaults: {key}") from exc

    rng = random.Random(seed)

    output_dir.mkdir(parents=True, exist_ok=True)
    write_run_context(
        output_dir,
        RunContext(
            universe_id=universe_cfg.universe_id,
            world_id=world_id,
            objective_id=objective_id,
            swarm_id=swarm_id,
            issue_id=None,
        ),
    )

    env_overrides = universe_env_overrides(universe_cfg)

    stage_order = world_config.get_stage_order()
    eval_until_stage: str | None = None
    for stage_id in reversed(stage_order):
        stage = world_config.get_stage(stage_id) or {}
        if str(stage.get("type") or "").strip() == "gate":
            eval_until_stage = stage_id
            break
    if eval_until_stage is None:
        for stage_id in reversed(stage_order):
            if "export" in stage_id.lower():
                eval_until_stage = stage_id
                break

    def default_evaluator(run_dir: Path, overrides: dict[str, Any], world_seed: int) -> bool:
        return run_world(
            world_path=world_yaml,
            output_dir=run_dir,
            seed=world_seed,
            param_overrides=overrides,
            until_stage=eval_until_stage,
            prune_intermediates=True,
        )

    eval_fn = evaluator or default_evaluator

    history: list[dict[str, Any]] = []

    for generation in range(generations):
        # Generate candidate population deterministically.
        candidates: list[dict[str, Any]] = []
        seen: set[str] = set()
        attempts = 0
        max_attempts = max(50, population_size * 25)

        while len(candidates) < population_size and attempts < max_attempts:
            attempts += 1
            overrides = dict(parent_values)
            mutated: dict[str, dict[str, Any]] = {}

            for _ in range(genome_surface.per_candidate_mutations):
                gene = rng.choice(genome_surface.genes)
                current = overrides.get(gene.key)
                new_value = gene.mutate(current, rng)
                if new_value == current:
                    continue
                mutated[gene.key] = {"from": current, "to": new_value}
                overrides[gene.key] = new_value

            if not mutated:
                continue

            digest = _candidate_hash(overrides)
            if digest in seen:
                continue
            seen.add(digest)

            run_id = f"evo_{universe_cfg.universe_id}_{world_id}_seed{seed}_g{generation}_c{len(candidates)}_{digest}"
            run_dir = kernel_dir / "runs" / run_id

            candidates.append(
                {
                    "run_id": run_id,
                    "run_dir": str(run_dir),
                    "digest": digest,
                    "overrides": overrides,
                    "delta": mutated,
                }
            )

        # Evaluate candidates (deterministic seed + optional reuse).
        evaluated: list[dict[str, Any]] = []

        with _temporary_env(env_overrides):
            for item in candidates:
                run_id = str(item["run_id"])
                run_dir = Path(str(item["run_dir"]))
                overrides = item.get("overrides")
                if not isinstance(overrides, dict):
                    continue

                verdict_path = run_dir / "verdict" / "gate_verdict.json"
                if reuse_existing_candidates and verdict_path.exists():
                    passed, metrics = _extract_gate_metrics(run_dir)
                    evaluated.append({**item, "passed": passed, "metrics": metrics, "reused": True})
                    continue

                if run_dir.exists() and verdict_path.exists():
                    raise UniverseLoadError(
                        "Candidate run already has a verdict but reuse is disabled "
                        f"(refuse to overwrite): {run_dir}"
                    )

                if run_dir.exists() and not verdict_path.exists():
                    existing_ctx = read_run_context(run_dir)
                    if (
                        existing_ctx is None
                        or existing_ctx.universe_id != universe_cfg.universe_id
                        or existing_ctx.world_id != world_id
                    ):
                        raise UniverseLoadError(
                            "Candidate run dir already exists without a verdict, but it does not match the "
                            f"expected universe/world (refuse to overwrite): {run_dir}"
                        )

                write_run_context(
                    run_dir,
                    RunContext(
                        universe_id=universe_cfg.universe_id,
                        world_id=world_id,
                        objective_id=objective_id,
                        swarm_id=swarm_id,
                        issue_id=None,
                    ),
                )

                success = eval_fn(run_dir, overrides, seed)
                passed, metrics = _extract_gate_metrics(run_dir)
                evaluated.append(
                    {
                        **item,
                        "success": bool(success),
                        "passed": passed,
                        "metrics": metrics,
                        "reused": False,
                    }
                )

        selected = _select_best_candidate(
            evaluated,
            directions=directions,
            require_pass=require_pass,
            mode=selection_mode,
        )

        selected_run_id = str(selected.get("run_id")) if isinstance(selected, dict) else None
        if selected is not None and isinstance(selected.get("overrides"), dict):
            parent_values = dict(selected["overrides"])

        history.append(
            {
                "generation": generation,
                "population_size": population_size,
                "parent_run_id": parent_from_run,
                "candidates": [
                    {
                        "run_id": str(item.get("run_id")),
                        "digest": str(item.get("digest")),
                        "overrides": item.get("overrides"),
                        "delta": item.get("delta"),
                        "passed": bool(item.get("passed")),
                        "metrics": item.get("metrics") or {},
                        "reused": bool(item.get("reused")),
                    }
                    for item in evaluated
                ],
                "selected_run_id": selected_run_id,
                "selection": {
                    "mode": selection_mode,
                    "require_all_gates_pass": require_pass,
                },
            }
        )

        parent_from_run = selected_run_id

    payload: dict[str, Any] = {
        "schema_version": "cyntra.evolve_world.v1",
        "run_id": output_dir.name,
        "generated_at": _utc_now(),
        "universe_id": universe_cfg.universe_id,
        "world_id": world_id,
        "objective_id": objective_id,
        "swarm_id": swarm_id,
        "seed": seed,
        "generations": generations,
        "population_size": population_size,
        "objectives": directions,
        "genome_id": genome_surface.genome_id,
        "genes": list(genome_surface.gene_keys),
        "history": history,
    }

    _validate_with_schema(payload, "evolve_world.schema.json")
    (output_dir / "evolve_world.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    return payload
