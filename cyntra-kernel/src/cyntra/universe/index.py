from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from cyntra.universe.run_context import read_run_context


@dataclass(frozen=True)
class UniverseRunIndexRecord:
    run_id: str
    universe_id: str
    world_id: str | None
    objective_id: str | None
    swarm_id: str | None
    issue_id: str | None
    label: str | None = None
    started_ms: int | None = None
    ended_ms: int | None = None
    duration_ms: int | None = None
    exit_code: int | None = None
    command: str | None = None
    artifacts: dict[str, str] = field(default_factory=dict)
    fab_gate: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "universe_id": self.universe_id,
            "world_id": self.world_id,
            "objective_id": self.objective_id,
            "swarm_id": self.swarm_id,
            "issue_id": self.issue_id,
            "label": self.label,
            "started_ms": self.started_ms,
            "ended_ms": self.ended_ms,
            "duration_ms": self.duration_ms,
            "exit_code": self.exit_code,
            "command": self.command,
            "artifacts": self.artifacts,
            "fab_gate": self.fab_gate,
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


def _read_run_meta(run_dir: Path) -> tuple[str | None, int | None, str | None]:
    raw = _read_json_dict(run_dir / "run_meta.json")
    if raw is None:
        return None, None, None
    label = raw.get("label") if isinstance(raw.get("label"), str) else None
    started_ms = raw.get("started_ms") if isinstance(raw.get("started_ms"), int) else None
    command = raw.get("command") if isinstance(raw.get("command"), str) else None
    return label, started_ms, command


def _read_job_result(run_dir: Path) -> tuple[int | None, int | None]:
    raw = _read_json_dict(run_dir / "job_result.json")
    if raw is None:
        return None, None
    ended_ms = raw.get("ended_ms") if isinstance(raw.get("ended_ms"), int) else None
    exit_code = raw.get("exit_code") if isinstance(raw.get("exit_code"), int) else None
    return ended_ms, exit_code


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


def _parse_timestamp_segment_to_ms(raw: str) -> int | None:
    if not raw or len(raw) != 16 or not raw.endswith("Z"):
        return None
    try:
        dt = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None
    return int(dt.timestamp() * 1000)


def _infer_started_ms(run_dir: Path, run_id: str, started_ms: int | None) -> int | None:
    if started_ms is not None:
        return started_ms

    if run_id.startswith("run_"):
        parts = run_id.split("_", 2)
        if len(parts) >= 2 and parts[1].isdigit():
            try:
                return int(parts[1])
            except Exception:
                return None

    stamp = run_id.split("_")[-1]
    stamp_ms = _parse_timestamp_segment_to_ms(stamp)
    if stamp_ms is not None:
        return stamp_ms

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

    return None


def _collect_artifacts(run_dir: Path) -> dict[str, str]:
    artifacts: dict[str, str] = {}
    candidates = {
        "run_meta": "run_meta.json",
        "job_result": "job_result.json",
        "terminal_log": "terminal.log",
        "manifest": "manifest.json",
        "proof": "proof.json",
        "gate_verdict": str(Path("verdict") / "gate_verdict.json"),
        "critic_report": str(Path("critics") / "report.json"),
        "render_result": str(Path("render") / "render_result.json"),
        "evolve_run": "evolve_run.json",
        "evolve_loop": "evolve_loop.json",
        "evolve_world": "evolve_world.json",
        "frontier": "frontier.json",
    }

    for key, rel_path in candidates.items():
        if (run_dir / rel_path).exists():
            artifacts[key] = rel_path

    dir_candidates = {
        "render_dir": "render",
        "artifacts_dir": "artifacts",
        "stages_dir": "stages",
        "evals_dir": "evals",
    }
    for key, rel_path in dir_candidates.items():
        if (run_dir / rel_path).is_dir():
            artifacts[key] = rel_path

    return artifacts


def _read_fab_gate_summary(run_dir: Path) -> dict[str, Any] | None:
    verdict = _read_json_dict(run_dir / "verdict" / "gate_verdict.json")
    if verdict is None:
        return None

    gate_config_id = verdict.get("gate_config_id") if isinstance(verdict.get("gate_config_id"), str) else None
    asset_id = verdict.get("asset_id") if isinstance(verdict.get("asset_id"), str) else None
    verdict_value = verdict.get("verdict") if isinstance(verdict.get("verdict"), str) else None
    iteration_index = verdict.get("iteration_index") if isinstance(verdict.get("iteration_index"), int) else None

    overall: float | None = None
    threshold: float | None = None
    margin: float | None = None
    scores = verdict.get("scores")
    if isinstance(scores, dict):
        overall_raw = scores.get("overall")
        threshold_raw = scores.get("threshold")
        margin_raw = scores.get("margin")
        overall = float(overall_raw) if isinstance(overall_raw, (int, float)) else None
        threshold = float(threshold_raw) if isinstance(threshold_raw, (int, float)) else None
        margin = float(margin_raw) if isinstance(margin_raw, (int, float)) else None

    failures = verdict.get("failures")
    hard_failures = 0
    soft_failures = 0
    if isinstance(failures, dict):
        hard = failures.get("hard")
        soft = failures.get("soft")
        if isinstance(hard, list):
            hard_failures = len(hard)
        if isinstance(soft, list):
            soft_failures = len(soft)

    floor_violations = verdict.get("floor_violations")
    floor_violations_count = len(floor_violations) if isinstance(floor_violations, list) else None

    return {
        "gate_config_id": gate_config_id,
        "asset_id": asset_id,
        "verdict": verdict_value,
        "iteration_index": iteration_index,
        "scores": {
            "overall": overall,
            "threshold": threshold,
            "margin": margin,
        },
        "failures": {
            "hard": hard_failures,
            "soft": soft_failures,
        },
        "floor_violations": floor_violations_count,
    }


def build_runs_index(
    *,
    universe_id: str,
    runs_dir: Path,
    output_path: Path,
) -> tuple[Path, int]:
    runs_dir = runs_dir.resolve()
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    records: list[UniverseRunIndexRecord] = []
    if runs_dir.exists():
        for run_dir in sorted((p for p in runs_dir.iterdir() if p.is_dir()), key=lambda p: p.name):
            ctx = read_run_context(run_dir)
            if ctx is None or ctx.universe_id != universe_id:
                continue
            label, started_ms, command = _read_run_meta(run_dir)
            ended_ms, exit_code = _read_job_result(run_dir)
            inferred_started_ms = _infer_started_ms(run_dir, run_dir.name, started_ms)
            duration_ms: int | None = None
            if inferred_started_ms is not None and ended_ms is not None:
                duration_ms = max(0, ended_ms - inferred_started_ms)

            records.append(
                UniverseRunIndexRecord(
                    run_id=run_dir.name,
                    universe_id=ctx.universe_id,
                    world_id=ctx.world_id,
                    objective_id=ctx.objective_id,
                    swarm_id=ctx.swarm_id,
                    issue_id=ctx.issue_id,
                    label=label,
                    started_ms=inferred_started_ms,
                    ended_ms=ended_ms,
                    duration_ms=duration_ms,
                    exit_code=exit_code,
                    command=command,
                    artifacts=_collect_artifacts(run_dir),
                    fab_gate=_read_fab_gate_summary(run_dir),
                )
            )

    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.to_dict(), ensure_ascii=False, sort_keys=True) + "\n")
    tmp_path.replace(output_path)

    return output_path, len(records)


def update_runs_index(
    *,
    universe_id: str,
    runs_dir: Path,
    output_path: Path,
    run_id: str,
) -> tuple[Path, bool]:
    """
    Incrementally update `.jsonl` run index for a single run.

    If the run has no `context.json` (or doesn't match `universe_id`), any existing
    index entry for `run_id` is removed.
    """
    runs_dir = runs_dir.resolve()
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    run_dir = (runs_dir / run_id).resolve()
    if not run_dir.exists() or not run_dir.is_dir():
        raise FileNotFoundError(f"Run not found: {run_dir}")

    ctx = read_run_context(run_dir)
    record: UniverseRunIndexRecord | None = None
    if ctx is not None and ctx.universe_id == universe_id:
        label, started_ms, command = _read_run_meta(run_dir)
        ended_ms, exit_code = _read_job_result(run_dir)
        inferred_started_ms = _infer_started_ms(run_dir, run_id, started_ms)
        duration_ms: int | None = None
        if inferred_started_ms is not None and ended_ms is not None:
            duration_ms = max(0, ended_ms - inferred_started_ms)
        record = UniverseRunIndexRecord(
            run_id=run_id,
            universe_id=ctx.universe_id,
            world_id=ctx.world_id,
            objective_id=ctx.objective_id,
            swarm_id=ctx.swarm_id,
            issue_id=ctx.issue_id,
            label=label,
            started_ms=inferred_started_ms,
            ended_ms=ended_ms,
            duration_ms=duration_ms,
            exit_code=exit_code,
            command=command,
            artifacts=_collect_artifacts(run_dir),
            fab_gate=_read_fab_gate_summary(run_dir),
        )

    existing: list[dict[str, Any]] = []
    removed = False
    if output_path.exists():
        for line in output_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
            except Exception:
                continue
            if not isinstance(raw, dict):
                continue
            if raw.get("run_id") == run_id:
                removed = True
                continue
            existing.append(raw)

    changed = removed or record is not None
    if not changed:
        return output_path, False

    if record is not None:
        existing.append(record.to_dict())

    existing.sort(key=lambda item: str(item.get("run_id") or ""))

    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        for item in existing:
            handle.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
    tmp_path.replace(output_path)

    return output_path, changed
