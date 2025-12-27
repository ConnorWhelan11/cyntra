from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import structlog

from cyntra.planner.time_utils import parse_rfc3339_to_ms

logger = structlog.get_logger()


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to read JSON", path=str(path), error=str(exc))
        return None
    return data if isinstance(data, dict) else None


def _safe_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(v) for v in value if isinstance(v, str) and v]


def _domain(job_type: str, tags: list[str]) -> str:
    if job_type == "fab-world":
        return "fab_world"
    if any(t.startswith("asset:") for t in tags):
        return "fab_asset"
    return "code"


def _extract_gate_summaries(verification: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    gates: list[dict[str, Any]] = []
    fail_codes: list[str] = []

    raw_gates = verification.get("gates")
    if isinstance(raw_gates, dict):
        for name, result in raw_gates.items():
            if not isinstance(result, dict):
                continue
            passed = bool(result.get("passed", False))
            score_raw = result.get("score")
            score = float(score_raw) if isinstance(score_raw, (int, float)) else None
            gates.append({"name": str(name), "passed": passed, "score": score})

            raw_fail_codes = result.get("fail_codes")
            if isinstance(raw_fail_codes, list):
                for code in raw_fail_codes:
                    if isinstance(code, str) and code:
                        fail_codes.append(code)

    blocking = verification.get("blocking_failures")
    if isinstance(blocking, list):
        for code in blocking:
            if isinstance(code, str) and code:
                fail_codes.append(code)

    # Dedupe while preserving order.
    seen: set[str] = set()
    deduped: list[str] = []
    for code in fail_codes:
        if code in seen:
            continue
        seen.add(code)
        deduped.append(code)

    return gates, deduped


def build_archive_run_summary(workcell_archive_dir: Path) -> dict[str, Any] | None:
    """
    Build a `run_summary.v1` record from a workcell archive directory.

    Prefers `rollout.json` when present, otherwise falls back to `manifest.json` + `proof.json`.
    """
    rollout = _read_json(workcell_archive_dir / "rollout.json")
    if rollout:
        return _build_run_summary_from_rollout(rollout, workcell_archive_dir)

    manifest = _read_json(workcell_archive_dir / "manifest.json") or {}
    proof = _read_json(workcell_archive_dir / "proof.json")
    if not proof:
        return None

    issue = manifest.get("issue") if isinstance(manifest.get("issue"), dict) else {}
    tags = _safe_str_list(issue.get("tags"))

    job_type = str(manifest.get("job_type") or "code")
    domain = _domain(job_type, tags)

    metadata = proof.get("metadata") if isinstance(proof.get("metadata"), dict) else {}
    started_at = metadata.get("started_at")
    started_ms = parse_rfc3339_to_ms(str(started_at)) if started_at else None
    if started_ms is None:
        completed_at = metadata.get("completed_at")
        started_ms = parse_rfc3339_to_ms(str(completed_at)) if completed_at else None
    if started_ms is None:
        started_ms = int(workcell_archive_dir.stat().st_mtime * 1000)

    duration_ms_raw = metadata.get("duration_ms")
    duration_ms = int(duration_ms_raw) if isinstance(duration_ms_raw, (int, float)) else 0

    verification = proof.get("verification") if isinstance(proof.get("verification"), dict) else {}
    all_passed = bool(verification.get("all_passed", False))
    proof_status = str(proof.get("status") or "failed").lower()
    if proof_status == "timeout":
        status = "timeout"
    elif proof_status in {"success", "partial"} and all_passed:
        status = "success"
    else:
        status = "failed"

    gate_summaries, fail_codes = _extract_gate_summaries(verification)

    action_executed = _action_executed_from_manifest(manifest)

    result: dict[str, Any] = {
        "run_id": str(
            proof.get("workcell_id") or manifest.get("workcell_id") or workcell_archive_dir.name
        ),
        "started_ms": started_ms,
        "job_type": job_type,
        "domain": domain,
        "action_executed": action_executed,
        "outcome": {
            "status": status,
            "fail_codes": fail_codes,
            "gates": gate_summaries,
        },
        "runtime": {"duration_ms": duration_ms},
    }

    if tags:
        result["tags"] = tags
    issue_id = issue.get("id")
    if isinstance(issue_id, str) and issue_id:
        result["issue_id"] = issue_id

    cost_usd = metadata.get("cost_usd")
    if isinstance(cost_usd, (int, float)):
        result["cost_usd_est"] = float(cost_usd)

    tokens_used = metadata.get("tokens_used")
    if isinstance(tokens_used, int):
        # v1 stores tokens in/out, but many adapters only provide an aggregate.
        result["tokens_in"] = tokens_used
        result["tokens_out"] = None

    return result


def _build_run_summary_from_rollout(
    rollout: dict[str, Any],
    archive_dir: Path,
) -> dict[str, Any] | None:
    if rollout.get("schema_version") != "cyntra.rollout.v1":
        return None

    started_ms = None
    metadata = rollout.get("metadata")
    if isinstance(metadata, dict):
        started_at = metadata.get("started_at")
        if isinstance(started_at, str):
            started_ms = parse_rfc3339_to_ms(started_at)
    if started_ms is None:
        started_ms = int(archive_dir.stat().st_mtime * 1000)

    job_type = str(rollout.get("job_type") or "code")

    # Infer tags from the manifest if present.
    manifest = _read_json(archive_dir / "manifest.json") or {}
    issue = manifest.get("issue") if isinstance(manifest.get("issue"), dict) else {}
    tags = _safe_str_list(issue.get("tags"))

    domain = _domain(job_type, tags)

    outcomes = rollout.get("outcomes") if isinstance(rollout.get("outcomes"), dict) else {}
    verification = (
        outcomes.get("verification") if isinstance(outcomes.get("verification"), dict) else {}
    )
    all_passed = bool(verification.get("all_passed", False))
    status = "success" if all_passed else "failed"

    gates: list[dict[str, Any]] = []
    fail_codes: list[str] = []
    # rollouts store blocking_failures but not per-gate scores yet; fall back to manifest/proof for that.
    blocking = verification.get("blocking_failures")
    if isinstance(blocking, list):
        fail_codes = [str(c) for c in blocking if isinstance(c, str) and c]

    scores = rollout.get("scores") if isinstance(rollout.get("scores"), dict) else {}
    duration_ms_raw = scores.get("duration_ms")
    duration_ms = int(duration_ms_raw) if isinstance(duration_ms_raw, int) else 0

    action_executed = _action_executed_from_manifest(manifest)

    result: dict[str, Any] = {
        "run_id": str(rollout.get("workcell_id") or archive_dir.name),
        "started_ms": started_ms,
        "job_type": job_type,
        "domain": domain,
        "action_executed": action_executed,
        "outcome": {"status": status, "fail_codes": fail_codes, "gates": gates},
        "runtime": {"duration_ms": duration_ms},
    }

    if tags:
        result["tags"] = tags
    issue_id = rollout.get("issue_id")
    if isinstance(issue_id, str) and issue_id:
        result["issue_id"] = issue_id

    cost_usd = scores.get("cost_usd")
    if isinstance(cost_usd, (int, float)):
        result["cost_usd_est"] = float(cost_usd)

    return result


def _action_executed_from_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    # Prefer explicit executed plan when available.
    planner = manifest.get("planner") if isinstance(manifest.get("planner"), dict) else {}
    executed = (
        planner.get("executed_plan") if isinstance(planner.get("executed_plan"), dict) else None
    )
    if executed:
        swarm = executed.get("swarm_id_executed")
        max_candidates = executed.get("max_candidates_executed")
        timeout_seconds = executed.get("timeout_seconds_executed")
        max_iterations = executed.get("max_iterations_executed")
        return {
            "swarm_id": str(swarm) if swarm is not None else None,
            "max_candidates": int(max_candidates) if isinstance(max_candidates, int) else None,
            "max_minutes": int(int(timeout_seconds) / 60)
            if isinstance(timeout_seconds, int)
            else None,
            "max_iterations": int(max_iterations) if isinstance(max_iterations, int) else None,
        }

    swarm_id = "speculate_vote" if bool(manifest.get("speculate_mode")) else "serial_handoff"

    max_candidates = 1 if swarm_id == "serial_handoff" else None
    control = manifest.get("control") if isinstance(manifest.get("control"), dict) else {}
    if max_candidates is None:
        raw_parallelism = control.get("speculate_parallelism")
        if isinstance(raw_parallelism, int) and raw_parallelism > 0:
            max_candidates = raw_parallelism

    # No durable timeout/iterations yet (v1 will log this under planner.executed_plan).
    return {
        "swarm_id": swarm_id,
        "max_candidates": max_candidates,
        "max_minutes": None,
        "max_iterations": None,
    }


def build_world_run_summary(run_dir: Path, *, repo_root: Path) -> dict[str, Any] | None:
    """
    Build a `run_summary.v1` record from a fab-world run directory (`.cyntra/runs/*`).
    """
    manifest = _read_json(run_dir / "manifest.json")
    if not manifest:
        return None

    from cyntra.universe import load_universe, read_run_context

    context = read_run_context(run_dir)
    if context is None:
        return None

    started_ms = None
    created_at = manifest.get("created_at")
    if isinstance(created_at, str):
        started_ms = parse_rfc3339_to_ms(created_at)
    if started_ms is None:
        started_ms = int(run_dir.stat().st_mtime * 1000)

    stages = manifest.get("stages") if isinstance(manifest.get("stages"), list) else []
    duration_ms = 0
    status = "success"
    fail_codes: list[str] = []
    for stage in stages:
        if not isinstance(stage, dict):
            continue
        stage_duration = stage.get("duration_ms")
        if isinstance(stage_duration, int):
            duration_ms += stage_duration
        stage_status = stage.get("status")
        if stage_status != "success":
            status = "failed"
            stage_id = stage.get("id")
            if isinstance(stage_id, str) and stage_id:
                fail_codes.append(f"stage_failed:{stage_id}")

    universe_id = context.universe_id
    world_id = context.world_id
    objective_id = context.objective_id
    swarm_id = context.swarm_id

    population_size = None
    if universe_id and swarm_id:
        try:
            universe_cfg = load_universe(universe_id, repo_root=repo_root, validate_worlds=False)
        except Exception:
            universe_cfg = None
        if universe_cfg and isinstance(universe_cfg.swarms, dict):
            swarms = universe_cfg.swarms.get("swarms")
            if isinstance(swarms, dict):
                swarm_cfg = swarms.get(swarm_id)
                if isinstance(swarm_cfg, dict):
                    raw_pop = swarm_cfg.get("population_size")
                    if isinstance(raw_pop, int) and raw_pop > 0:
                        population_size = raw_pop

    result: dict[str, Any] = {
        "run_id": str(manifest.get("run_id") or run_dir.name),
        "started_ms": started_ms,
        "job_type": "fab-world",
        "domain": "fab_world",
        "action_executed": {
            "swarm_id": swarm_id,
            "max_candidates": population_size,
            "max_minutes": None,
            "max_iterations": None,
        },
        "outcome": {"status": status, "fail_codes": fail_codes, "gates": []},
        "runtime": {"duration_ms": duration_ms},
        "universe_id": universe_id,
        "world_id": world_id,
        "objective_id": objective_id,
    }

    return result


def iter_archive_run_summaries(archives_dir: Path) -> Iterable[dict[str, Any]]:
    if not archives_dir.exists():
        return
    for child in sorted(archives_dir.iterdir()):
        if not child.is_dir():
            continue
        summary = build_archive_run_summary(child)
        if summary:
            yield summary


def iter_world_run_summaries(runs_dir: Path, *, repo_root: Path) -> Iterable[dict[str, Any]]:
    if not runs_dir.exists():
        return
    for child in sorted(runs_dir.iterdir()):
        if not child.is_dir():
            continue
        summary = build_world_run_summary(child, repo_root=repo_root)
        if summary:
            yield summary
