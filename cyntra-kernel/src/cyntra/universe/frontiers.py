from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from cyntra.evolve.pareto import pareto_frontier
from cyntra.universe.config import UniverseConfig
from cyntra.universe.run_context import read_run_context


def _schemas_dir() -> Path:
    # cyntra-kernel/src/cyntra/universe/frontiers.py -> cyntra-kernel/
    return Path(__file__).resolve().parents[3] / "schemas" / "cyntra"


def _load_schema(name: str) -> dict[str, Any]:
    path = _schemas_dir() / name
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_frontiers(payload: dict[str, Any]) -> None:
    try:
        import jsonschema
    except ImportError:
        return
    schema = _load_schema("universe_world_frontiers.schema.json")
    jsonschema.validate(instance=payload, schema=schema)


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


def _parse_iso_to_ms(raw: object) -> int | None:
    if not isinstance(raw, str) or not raw:
        return None
    candidate = raw.strip()
    if candidate.endswith("Z"):
        candidate = candidate.removesuffix("Z") + "+00:00"
    try:
        dt = datetime.fromisoformat(candidate)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _infer_started_ms(run_dir: Path, run_id: str) -> int | None:
    meta = _read_json_dict(run_dir / "run_meta.json")
    if meta is not None and isinstance(meta.get("started_ms"), int):
        return meta["started_ms"]

    manifest = _read_json_dict(run_dir / "manifest.json")
    if manifest is not None:
        created_ms = _parse_iso_to_ms(manifest.get("created_at"))
        if created_ms is not None:
            return created_ms

    verdict = _read_json_dict(run_dir / "verdict" / "gate_verdict.json")
    if verdict is not None:
        timing = verdict.get("timing")
        if isinstance(timing, dict):
            started_at = _parse_iso_to_ms(timing.get("started_at"))
            if started_at is not None:
                return started_at

    if run_id.startswith("run_"):
        parts = run_id.split("_", 2)
        if len(parts) >= 2 and parts[1].isdigit():
            try:
                return int(parts[1])
            except Exception:
                return None

    return None


def _iso_z(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


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


def _extract_fab_metrics(run_dir: Path) -> dict[str, float | int]:
    verdict = _read_json_dict(run_dir / "verdict" / "gate_verdict.json") or {}
    metrics: dict[str, float | int] = {}

    scores = verdict.get("scores")
    if isinstance(scores, dict):
        overall = scores.get("overall")
        if isinstance(overall, (int, float)):
            metrics["overall"] = float(overall)
        by_critic = scores.get("by_critic")
        if isinstance(by_critic, dict):
            for name, value in by_critic.items():
                if not isinstance(name, str) or not name:
                    continue
                if isinstance(value, (int, float)):
                    metrics[f"critic_{name}"] = float(value)

    failures = verdict.get("failures")
    if isinstance(failures, dict):
        hard = failures.get("hard")
        soft = failures.get("soft")
        if isinstance(hard, list):
            metrics["hard_failures"] = len(hard)
        if isinstance(soft, list):
            metrics["soft_failures"] = len(soft)

    floor_violations = verdict.get("floor_violations")
    if isinstance(floor_violations, list):
        metrics["floor_violations"] = len(floor_violations)

    timing = verdict.get("timing")
    if isinstance(timing, dict):
        duration_ms = timing.get("duration_ms")
        if isinstance(duration_ms, int):
            metrics["duration_ms"] = duration_ms

    return metrics


@dataclass(frozen=True)
class _WorldRun:
    run_id: str
    world_id: str
    objective_id: str
    started_ms: int | None
    metrics: dict[str, float | int]


def build_world_frontiers(
    *,
    universe_cfg: UniverseConfig,
    runs_dir: Path,
    output_dir: Path,
    world_id: str,
) -> tuple[Path, int]:
    """
    Rebuild `.cyntra/universes/<universe_id>/frontiers/<world_id>.json` by scanning `.cyntra/runs/`.

    The output contains a list of objective-scoped Pareto frontiers for the world.
    """
    runs_dir = runs_dir.resolve()
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    universe_id = universe_cfg.universe_id

    world_runs: list[_WorldRun] = []
    if runs_dir.exists():
        for run_dir in (p for p in runs_dir.iterdir() if p.is_dir()):
            ctx = read_run_context(run_dir)
            if ctx is None or ctx.universe_id != universe_id or ctx.world_id != world_id:
                continue
            objective_id = str(ctx.objective_id or "").strip()
            if not objective_id:
                continue

            run_id = run_dir.name
            started_ms = _infer_started_ms(run_dir, run_id)
            metrics = _extract_fab_metrics(run_dir)
            if not metrics:
                continue
            world_runs.append(
                _WorldRun(
                    run_id=run_id,
                    world_id=world_id,
                    objective_id=objective_id,
                    started_ms=started_ms,
                    metrics=metrics,
                )
            )

    objective_ids = sorted({r.objective_id for r in world_runs})
    if not objective_ids:
        default_obj = str(universe_cfg.defaults.get("objective_id") or "").strip()
        if default_obj:
            objective_ids = [default_obj]

    max_started_ms: int | None = None
    started = [r.started_ms for r in world_runs if r.started_ms is not None]
    if started:
        max_started_ms = max(started)

    objective_frontiers: list[dict[str, Any]] = []

    for objective_id in objective_ids:
        directions = _objective_directions(universe_cfg, objective_id)
        if not directions:
            directions = {"overall": "max"}

        metrics = sorted(directions.keys())

        candidates: list[dict[str, Any]] = []
        for run in world_runs:
            if run.objective_id != objective_id:
                continue
            values: dict[str, float | int] = {}
            missing = False
            for metric in metrics:
                value = run.metrics.get(metric)
                if not isinstance(value, (int, float)):
                    missing = True
                    break
                values[metric] = value
            if missing:
                continue
            candidates.append(
                {
                    "run_id": run.run_id,
                    "started_ms": run.started_ms,
                    **values,
                }
            )

        # Deterministic ordering for stable frontier selection.
        candidates.sort(key=lambda item: (item.get("started_ms") or 0, str(item.get("run_id") or "")))

        frontier_items = pareto_frontier(candidates, directions)
        points = [
            {
                "run_id": item.get("run_id"),
                "values": {metric: item.get(metric) for metric in metrics},
            }
            for item in frontier_items
            if isinstance(item.get("run_id"), str)
        ]

        objective_frontiers.append(
            {
                "objective_id": objective_id,
                "metrics": metrics,
                "objectives": directions,
                "points": points,
            }
        )

    payload: dict[str, Any] = {
        "schema_version": "1.0",
        "universe_id": universe_id,
        "world_id": world_id,
        "generated_at": _iso_z(max_started_ms),
        "frontiers": objective_frontiers,
    }
    _validate_frontiers(payload)

    output_path = output_dir / f"{world_id}.json"
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    point_count = sum(len(entry.get("points") or []) for entry in objective_frontiers)
    return output_path, point_count


def build_frontiers_store(
    *,
    universe_cfg: UniverseConfig,
    runs_dir: Path,
    output_dir: Path,
    world_ids: list[str] | None = None,
) -> tuple[list[Path], int]:
    """
    Rebuild world frontier files for a universe.

    Returns:
        (paths_written, total_points)
    """
    if world_ids is None:
        world_ids = [w.world_id for w in universe_cfg.enabled_worlds()]

    out_paths: list[Path] = []
    total_points = 0
    for world_id in world_ids:
        path, points = build_world_frontiers(
            universe_cfg=universe_cfg,
            runs_dir=runs_dir,
            output_dir=output_dir,
            world_id=world_id,
        )
        out_paths.append(path)
        total_points += points

    return out_paths, total_points

