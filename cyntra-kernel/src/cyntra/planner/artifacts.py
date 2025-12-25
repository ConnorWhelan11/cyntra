from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cyntra.planner.action_space import NA, ActionSpace, BudgetBin
from cyntra.planner.constants import (
    DK_PRIORITIES,
    DK_RISKS,
    DK_SIZES,
    SCHEMA_EXECUTED_PLAN_V1,
    SCHEMA_PLANNER_ACTION_V1,
    SCHEMA_PLANNER_INPUT_V1,
)
from cyntra.planner.dataset import hash_planner_input
from cyntra.planner.keywords import extract_keywords
from cyntra.planner.run_summaries import iter_archive_run_summaries, iter_world_run_summaries
from cyntra.planner.similar_runs import SimilarRunsQuery, select_similar_runs
from cyntra.planner.time_utils import ms_to_rfc3339
from cyntra.state.models import Issue


def _utc_now_ms() -> int:
    return int(datetime.now(UTC).timestamp() * 1000)


def _clamp_enum(value: str, allowed: tuple[str, ...], default: str) -> str:
    return value if value in allowed else default


def _map_to_bin(value: int | None, bins: tuple[BudgetBin, ...]) -> BudgetBin:
    if value is None:
        return NA
    candidates = [b for b in bins if isinstance(b, int)]
    if not candidates:
        return NA
    if value in candidates:
        return value
    candidates.sort()
    return min(candidates, key=lambda b: (abs(b - value), b))


def _bin_count(value: int) -> str:
    if value <= 0:
        return "0"
    if value <= 2:
        return "1_2"
    if value <= 5:
        return "3_5"
    return "6_plus"


def system_state_snapshot(
    *,
    active_workcells: int,
    queue_depth: int | None,
    available_toolchains: list[str],
    now_ms: int | None = None,
) -> dict[str, Any]:
    now_ms = now_ms or _utc_now_ms()
    hour = datetime.fromtimestamp(now_ms / 1000.0, tz=UTC).hour

    return {
        "active_workcells_bin": _bin_count(active_workcells),
        "queue_depth_bin": _bin_count(queue_depth or 0) if queue_depth is not None else None,
        "available_toolchains": list(available_toolchains),
        "toolchain_health": None,
        "hour_bucket": f"{hour:02d}",
        "budget_remaining_bin": None,
    }


def collect_history_candidates(
    *,
    repo_root: Path,
    include_world: bool = True,
) -> list[dict[str, Any]]:
    repo_root = repo_root.resolve()
    archives_dir = repo_root / ".cyntra" / "archives"
    runs_dir = repo_root / ".cyntra" / "runs"

    candidates: list[dict[str, Any]] = []
    candidates.extend(list(iter_archive_run_summaries(archives_dir)))
    if include_world:
        candidates.extend(list(iter_world_run_summaries(runs_dir, repo_root=repo_root)))

    candidates = [c for c in candidates if isinstance(c.get("started_ms"), int)]
    candidates.sort(key=lambda r: (int(r["started_ms"]), str(r.get("run_id") or "")))
    return candidates


def build_planner_input_v1(
    *,
    issue: Issue,
    job_type: str,
    universe_id: str,
    universe_defaults: dict[str, Any],
    action_space: ActionSpace,
    history_candidates: list[dict[str, Any]],
    system_state: dict[str, Any] | None,
    now_ms: int | None = None,
    n_similar: int = 8,
) -> dict[str, Any]:
    now_ms = now_ms or _utc_now_ms()

    dk_priority = _clamp_enum(issue.dk_priority, DK_PRIORITIES, "P2")
    dk_risk = _clamp_enum(issue.dk_risk, DK_RISKS, "medium")
    dk_size = _clamp_enum(issue.dk_size, DK_SIZES, "M")

    query = SimilarRunsQuery(
        job_type=job_type,
        started_ms=now_ms,
        tags=list(issue.tags or []),
        world_id=None,
        objective_id=None,
    )
    similar = select_similar_runs(query, history_candidates, n=n_similar)

    return {
        "schema_version": SCHEMA_PLANNER_INPUT_V1,
        "created_at": ms_to_rfc3339(now_ms),
        "universe_id": universe_id,
        "job_type": job_type,
        "universe_defaults": universe_defaults,
        "issue": {
            "issue_id": issue.id,
            "dk_priority": dk_priority,
            "dk_risk": dk_risk,
            "dk_size": dk_size,
            "dk_tool_hint": issue.dk_tool_hint,
            "dk_attempts": int(issue.dk_attempts),
            "tags": list(issue.tags or []),
            "title": issue.title,
            "keywords": extract_keywords(f"{issue.title}\n{issue.description or ''}", max_keywords=16),
        },
        "history": {"last_n_similar_runs": similar},
        "action_space": action_space.to_dict(),
        "system_state": system_state,
    }


def build_planner_action_v1(
    *,
    swarm_id: str,
    max_candidates: int | None,
    max_minutes: int | None,
    max_iterations: int | None,
    action_space: ActionSpace,
    planner_input: dict[str, Any],
    now_ms: int | None = None,
    checkpoint_id: str = "baseline_heuristic_v0",
) -> dict[str, Any]:
    now_ms = now_ms or _utc_now_ms()
    input_hash = hash_planner_input(planner_input)

    return {
        "schema_version": SCHEMA_PLANNER_ACTION_V1,
        "created_at": ms_to_rfc3339(now_ms),
        "swarm_id": swarm_id,
        "budgets": {
            "max_candidates_bin": _map_to_bin(max_candidates, action_space.max_candidates_bins),
            "max_minutes_bin": _map_to_bin(max_minutes, action_space.max_minutes_bins),
            "max_iterations_bin": _map_to_bin(max_iterations, action_space.max_iterations_bins),
        },
        "confidence": 1.0,
        "abstain_to_default": False,
        "reason": None,
        "model": {"checkpoint_id": checkpoint_id},
        "input_hash": input_hash,
    }


def build_planner_action_from_bins_v1(
    *,
    swarm_id: str,
    max_candidates_bin: BudgetBin,
    max_minutes_bin: BudgetBin,
    max_iterations_bin: BudgetBin,
    planner_input: dict[str, Any],
    now_ms: int | None = None,
    checkpoint_id: str = "baseline_heuristic_v0",
) -> dict[str, Any]:
    now_ms = now_ms or _utc_now_ms()
    input_hash = hash_planner_input(planner_input)

    return {
        "schema_version": SCHEMA_PLANNER_ACTION_V1,
        "created_at": ms_to_rfc3339(now_ms),
        "swarm_id": swarm_id,
        "budgets": {
            "max_candidates_bin": max_candidates_bin,
            "max_minutes_bin": max_minutes_bin,
            "max_iterations_bin": max_iterations_bin,
        },
        "confidence": 1.0,
        "abstain_to_default": False,
        "reason": None,
        "model": {"checkpoint_id": checkpoint_id},
        "input_hash": input_hash,
    }


def build_executed_plan_v1(
    *,
    swarm_id: str,
    max_candidates: int | None,
    timeout_seconds: int | None,
    max_iterations: int | None,
    fallback_applied: bool = False,
    fallback_reason: str | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_EXECUTED_PLAN_V1,
        "swarm_id_executed": swarm_id,
        "max_candidates_executed": max_candidates,
        "timeout_seconds_executed": timeout_seconds,
        "max_iterations_executed": max_iterations,
        "fallback_applied": fallback_applied,
        "fallback_reason": fallback_reason,
    }


def planner_manifest_bundle(
    *,
    issue: Issue,
    job_type: str,
    universe_id: str,
    universe_defaults: dict[str, Any],
    action_space: ActionSpace,
    history_candidates: list[dict[str, Any]],
    system_state: dict[str, Any] | None,
    swarm_id: str,
    max_candidates: int | None,
    timeout_seconds: int | None,
    max_iterations: int | None,
    now_ms: int | None = None,
    requested_max_candidates_bin: BudgetBin | None = None,
    requested_max_minutes_bin: BudgetBin | None = None,
    requested_max_iterations_bin: BudgetBin | None = None,
) -> dict[str, Any]:
    now_ms = now_ms or _utc_now_ms()
    planner_input = build_planner_input_v1(
        issue=issue,
        job_type=job_type,
        universe_id=universe_id,
        universe_defaults=universe_defaults,
        action_space=action_space,
        history_candidates=history_candidates,
        system_state=system_state,
        now_ms=now_ms,
    )
    if (
        requested_max_candidates_bin is not None
        or requested_max_minutes_bin is not None
        or requested_max_iterations_bin is not None
    ):
        candidates_bin = (
            requested_max_candidates_bin
            if requested_max_candidates_bin is not None
            else _map_to_bin(max_candidates, action_space.max_candidates_bins)
        )
        minutes_bin = (
            requested_max_minutes_bin
            if requested_max_minutes_bin is not None
            else _map_to_bin(
                int(timeout_seconds / 60) if isinstance(timeout_seconds, int) else None,
                action_space.max_minutes_bins,
            )
        )
        iterations_bin = (
            requested_max_iterations_bin
            if requested_max_iterations_bin is not None
            else _map_to_bin(max_iterations, action_space.max_iterations_bins)
        )
        planner_action = build_planner_action_from_bins_v1(
            swarm_id=swarm_id,
            max_candidates_bin=candidates_bin,
            max_minutes_bin=minutes_bin,
            max_iterations_bin=iterations_bin,
            planner_input=planner_input,
            now_ms=now_ms,
        )
    else:
        planner_action = build_planner_action_v1(
            swarm_id=swarm_id,
            max_candidates=max_candidates,
            max_minutes=int(timeout_seconds / 60) if isinstance(timeout_seconds, int) else None,
            max_iterations=max_iterations,
            action_space=action_space,
            planner_input=planner_input,
            now_ms=now_ms,
        )
    executed_plan = build_executed_plan_v1(
        swarm_id=swarm_id,
        max_candidates=max_candidates,
        timeout_seconds=timeout_seconds,
        max_iterations=max_iterations,
        fallback_applied=False,
        fallback_reason=None,
    )

    return {
        "planner_input": planner_input,
        "planner_action": planner_action,
        "executed_plan": executed_plan,
        # Optional enforcement knobs (v1). Keep null unless explicitly overridden.
        "timeout_seconds_override": None,
    }
