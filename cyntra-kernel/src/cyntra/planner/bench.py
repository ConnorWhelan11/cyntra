from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from cyntra.bench.runner import prepare_bench_config
from cyntra.kernel.config import KernelConfig
from cyntra.kernel.dispatcher import Dispatcher, DispatchResult
from cyntra.kernel.routing import speculate_parallelism, speculate_toolchains
from cyntra.kernel.verifier import Verifier
from cyntra.planner.action_space import NA, ActionSpace, ActionTuple, valid_actions
from cyntra.planner.artifacts import planner_manifest_bundle
from cyntra.planner.candidates import select_candidate_actions
from cyntra.planner.time_utils import ms_to_rfc3339
from cyntra.state.models import Issue
from cyntra.workcell.manager import WorkcellManager

logger = structlog.get_logger()


def _utc_now_ms() -> int:
    return int(datetime.now(UTC).timestamp() * 1000)


@dataclass(frozen=True)
class CandidateOutcome:
    action: ActionTuple
    verified: bool
    status: str
    duration_ms: int | None
    cost_usd: float | None
    workcell_id: str | None
    details: dict[str, Any]


def _duration_ms(proof: Any) -> int | None:
    if proof is None:
        return None
    metadata = getattr(proof, "metadata", None)
    if not isinstance(metadata, dict):
        return None
    value = metadata.get("duration_ms")
    if isinstance(value, int):
        return value
    return None


def _cost_usd(proof: Any) -> float | None:
    if proof is None:
        return None
    metadata = getattr(proof, "metadata", None)
    if not isinstance(metadata, dict):
        return None
    value = metadata.get("cost_usd")
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _best_outcome(outcomes: list[CandidateOutcome]) -> CandidateOutcome | None:
    if not outcomes:
        return None

    # Prefer verified.
    verified = [o for o in outcomes if o.verified]
    pool = verified if verified else outcomes

    def _key(o: CandidateOutcome) -> tuple[int, int, float, str]:
        # Lower is better.
        duration = o.duration_ms if isinstance(o.duration_ms, int) else 2**31 - 1
        cost = o.cost_usd if isinstance(o.cost_usd, (int, float)) else 1e9
        return (
            0 if o.verified else 1,
            duration,
            float(cost),
            json.dumps(o.action, sort_keys=True),
        )

    return min(pool, key=_key)


@dataclass(frozen=True)
class BenchConfig:
    universe_id: str
    universe_defaults: dict[str, Any]
    action_space: ActionSpace
    k: int
    seed: int
    now_ms: int
    history_candidates: list[dict[str, Any]]
    system_state: dict[str, Any] | None = None
    sampling: dict[str, float] = field(
        default_factory=lambda: {"temperature": 0.0, "top_p": 1.0}
    )


def _canonical_json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def bench_config_hash(bench_cfg: BenchConfig, *, toolchain_override: str | None) -> str:
    payload = {
        "schema_version": "cyntra.planner_best_of_k_config.v1",
        "universe_id": bench_cfg.universe_id,
        "universe_defaults": bench_cfg.universe_defaults,
        "action_space": bench_cfg.action_space.to_dict(),
        "k": bench_cfg.k,
        "seed": bench_cfg.seed,
        "sampling": bench_cfg.sampling,
        "toolchain_override": toolchain_override,
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


async def run_best_of_k_bench(
    *,
    base_config: KernelConfig,
    bench_dir: Path,
    issues: list[Issue],
    bench_cfg: BenchConfig,
    max_cases: int | None = None,
    toolchain_override: str | None = None,
) -> dict[str, Any]:
    """
    Execute a best-of-K outcome bench for code issues.

    This is the label generator described in the training spec section 9.
    """
    config = prepare_bench_config(base_config=base_config, bench_dir=bench_dir)
    workcells = WorkcellManager(config, config.repo_root)
    dispatcher = Dispatcher(config)
    verifier = Verifier(config)

    bench_dir.mkdir(parents=True, exist_ok=True)
    results_dir = bench_dir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    all_records: list[dict[str, Any]] = []
    cfg_hash = bench_config_hash(bench_cfg, toolchain_override=toolchain_override)

    for idx, issue in enumerate(issues):
        if max_cases is not None and idx >= max_cases:
            break

        job_type = "fab-world" if "asset:world" in (issue.tags or []) else "code"
        if job_type != "code":
            all_records.append(
                {
                    "issue_id": issue.id,
                    "title": issue.title,
                    "job_type": job_type,
                    "skipped": True,
                    "skip_reason": "best-of-k bench currently supports only code issues",
                }
            )
            continue
        valid = valid_actions(job_type, bench_cfg.action_space)

        baseline_swarm = str(bench_cfg.universe_defaults.get("swarm_id") or "serial_handoff")
        if baseline_swarm not in bench_cfg.action_space.swarm_ids:
            baseline_swarm = (
                bench_cfg.action_space.swarm_ids[0]
                if bench_cfg.action_space.swarm_ids
                else "serial_handoff"
            )
        baseline_candidates = 1 if baseline_swarm == "serial_handoff" else NA
        baseline_action: ActionTuple = (baseline_swarm, baseline_candidates, NA, NA)
        candidates = select_candidate_actions(valid, k=bench_cfg.k, seed=bench_cfg.seed + idx, baseline=baseline_action)

        outcomes: list[CandidateOutcome] = []
        for action in candidates:
            outcome = await _run_candidate_action(
                workcells=workcells,
                dispatcher=dispatcher,
                verifier=verifier,
                issue=issue,
                job_type=job_type,
                universe_id=bench_cfg.universe_id,
                universe_defaults=bench_cfg.universe_defaults,
                action_space=bench_cfg.action_space,
                action=action,
                now_ms=bench_cfg.now_ms,
                toolchain_override=toolchain_override,
                history_candidates=bench_cfg.history_candidates,
                system_state=bench_cfg.system_state,
                sampling=bench_cfg.sampling,
                bench_dir=bench_dir,
            )
            outcomes.append(outcome)

        winner = _best_outcome(outcomes)
        record = {
            "bench_config_hash": cfg_hash,
            "issue_id": issue.id,
            "title": issue.title,
            "job_type": job_type,
            "candidates": [o.__dict__ for o in outcomes],
            "winner": winner.__dict__ if winner else None,
        }
        all_records.append(record)

    out_path = results_dir / "best_of_k.json"
    out_path.write_text(json.dumps(all_records, indent=2, sort_keys=True) + "\n")

    report = {
        "schema_version": "cyntra.planner_best_of_k_bench.v1",
        "generated_at": ms_to_rfc3339(bench_cfg.now_ms),
        "bench_dir": str(bench_dir),
        "bench_config_hash": cfg_hash,
        "k": bench_cfg.k,
        "seed": bench_cfg.seed,
        "sampling": bench_cfg.sampling,
        "case_count": len(all_records),
        "results_path": str(out_path),
    }
    (bench_dir / "bench_report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return report


async def _run_candidate_action(
    *,
    workcells: WorkcellManager,
    dispatcher: Dispatcher,
    verifier: Verifier,
    issue: Issue,
    job_type: str,
    universe_id: str,
    universe_defaults: dict[str, Any],
    action_space: ActionSpace,
    action: ActionTuple,
    now_ms: int,
    toolchain_override: str | None,
    history_candidates: list[dict[str, Any]],
    system_state: dict[str, Any] | None,
    sampling: dict[str, float] | None,
    bench_dir: Path,
) -> CandidateOutcome:
    swarm_id, max_candidates_bin, max_minutes_bin, max_iterations_bin = action

    timeout_seconds = None
    if isinstance(max_minutes_bin, int):
        timeout_seconds = int(max_minutes_bin) * 60

    if swarm_id == "speculate_vote":
        return await _run_speculate_vote(
            workcells=workcells,
            dispatcher=dispatcher,
            verifier=verifier,
            issue=issue,
            job_type=job_type,
            universe_id=universe_id,
            universe_defaults=universe_defaults,
            action_space=action_space,
            action=action,
            now_ms=now_ms,
            toolchain_override=toolchain_override,
            timeout_seconds=timeout_seconds,
            history_candidates=history_candidates,
            system_state=system_state,
            sampling=sampling,
            bench_dir=bench_dir,
        )

    # serial_handoff (or unknown swarm fallback)
    workcell_path = workcells.create(issue.id, speculate_tag="bench")
    try:
        toolchain = toolchain_override or dispatcher._route_toolchain(issue)

        tc_cfg = dispatcher.config.toolchains.get(toolchain)
        tc_timeout = int(getattr(tc_cfg, "timeout_seconds", 1800)) if tc_cfg is not None else 1800
        effective_timeout = timeout_seconds or tc_timeout

        planner_bundle = planner_manifest_bundle(
            issue=issue,
            job_type=job_type,
            universe_id=universe_id,
            universe_defaults=universe_defaults,
            action_space=action_space,
            history_candidates=history_candidates,
            system_state=system_state,
            swarm_id=swarm_id,
            max_candidates=1,
            timeout_seconds=effective_timeout,
            max_iterations=None if max_iterations_bin == NA else int(max_iterations_bin),
            now_ms=now_ms,
            requested_max_candidates_bin=max_candidates_bin,
            requested_max_minutes_bin=max_minutes_bin,
            requested_max_iterations_bin=max_iterations_bin,
        )
        if timeout_seconds is not None:
            planner_bundle["timeout_seconds_override"] = timeout_seconds

        manifest_overrides: dict[str, Any] = {"planner": planner_bundle}
        if sampling:
            manifest_overrides["toolchain_config"] = {"sampling": sampling}
            manifest_overrides["control"] = {"sampling": sampling}

        dispatch = await dispatcher.dispatch_async(
            issue,
            workcell_path,
            toolchain_override=toolchain,
            speculate_tag="bench",
            manifest_overrides=manifest_overrides,
        )
        verified = bool(dispatch.proof and verifier.verify(dispatch.proof, workcell_path))
        verification = dispatch.proof.verification if dispatch.proof and isinstance(dispatch.proof.verification, dict) else None
        archive_path = str((bench_dir / "archives" / workcell_path.name).resolve())

        return CandidateOutcome(
            action=action,
            verified=verified,
            status=dispatch.proof.status if dispatch.proof else "error",
            duration_ms=_duration_ms(dispatch.proof),
            cost_usd=_cost_usd(dispatch.proof),
            workcell_id=dispatch.workcell_id,
            details={"toolchain": toolchain, "archive_path": archive_path, "verification": verification},
        )
    finally:
        workcells.cleanup(workcell_path, keep_logs=True)


async def _run_speculate_vote(
    *,
    workcells: WorkcellManager,
    dispatcher: Dispatcher,
    verifier: Verifier,
    issue: Issue,
    job_type: str,
    universe_id: str,
    universe_defaults: dict[str, Any],
    action_space: ActionSpace,
    action: ActionTuple,
    now_ms: int,
    toolchain_override: str | None,
    timeout_seconds: int | None,
    history_candidates: list[dict[str, Any]],
    system_state: dict[str, Any] | None,
    sampling: dict[str, float] | None,
    bench_dir: Path,
) -> CandidateOutcome:
    swarm_id, max_candidates_bin, max_minutes_bin, max_iterations_bin = action

    candidates = speculate_toolchains(dispatcher.config, issue)
    if not candidates:
        candidates = list(dispatcher.config.toolchain_priority)

    available = set(dispatcher.get_available_toolchains())
    candidates = [c for c in candidates if c in available]
    if not candidates:
        candidates = list(dispatcher.config.toolchain_priority)[:1]

    if isinstance(max_candidates_bin, int) and max_candidates_bin > 0:
        parallelism = int(max_candidates_bin)
    else:
        parallelism = dispatcher.controller.speculate_parallelism(
            issue, speculate_parallelism(dispatcher.config, issue)
        )
    parallelism = min(max(1, parallelism), len(candidates))
    toolchains = candidates[:parallelism]

    proofs: list[Any] = []
    results: list[tuple[str, DispatchResult]] = []
    run_details: list[dict[str, Any]] = []

    for toolchain in toolchains:
        tag = f"spec-{toolchain}"
        path = workcells.create(issue.id, speculate_tag=tag)
        archive_path = str((bench_dir / "archives" / path.name).resolve())
        try:
            tc_cfg = dispatcher.config.toolchains.get(toolchain)
            tc_timeout = int(getattr(tc_cfg, "timeout_seconds", 1800)) if tc_cfg is not None else 1800
            effective_timeout = timeout_seconds or tc_timeout

            planner_bundle = planner_manifest_bundle(
                issue=issue,
                job_type=job_type,
                universe_id=universe_id,
                universe_defaults=universe_defaults,
                action_space=action_space,
                history_candidates=history_candidates,
                system_state=system_state,
                swarm_id=swarm_id,
                max_candidates=parallelism,
                timeout_seconds=effective_timeout,
                max_iterations=None if max_iterations_bin == NA else int(max_iterations_bin),
                now_ms=now_ms,
                requested_max_candidates_bin=max_candidates_bin,
                requested_max_minutes_bin=max_minutes_bin,
                requested_max_iterations_bin=max_iterations_bin,
            )
            if timeout_seconds is not None:
                planner_bundle["timeout_seconds_override"] = timeout_seconds

            manifest_overrides: dict[str, Any] = {"planner": planner_bundle}
            if sampling:
                manifest_overrides["toolchain_config"] = {"sampling": sampling}
                manifest_overrides["control"] = {"sampling": sampling}

            executed_toolchain = toolchain_override or toolchain
            dispatch = await dispatcher.dispatch_async(
                issue,
                path,
                speculate_tag=tag,
                toolchain_override=executed_toolchain,
                manifest_overrides=manifest_overrides,
            )

            verified = bool(dispatch.proof and verifier.verify(dispatch.proof, path))
            verification = (
                dispatch.proof.verification
                if dispatch.proof and isinstance(dispatch.proof.verification, dict)
                else None
            )

            run_details.append(
                {
                    "requested_toolchain": toolchain,
                    "executed_toolchain": executed_toolchain,
                    "workcell_id": dispatch.workcell_id,
                    "archive_path": archive_path,
                    "status": dispatch.proof.status if dispatch.proof else "error",
                    "verified": verified,
                    "duration_ms": _duration_ms(dispatch.proof),
                    "cost_usd": _cost_usd(dispatch.proof),
                    "verification": verification,
                }
            )

            results.append((toolchain, dispatch))
            if dispatch.proof:
                proofs.append(dispatch.proof)
        finally:
            workcells.cleanup(path, keep_logs=True)

    winner_proof = verifier.vote(proofs) if proofs else None
    winner_dispatch: DispatchResult | None = None
    winner_toolchain: str | None = None
    if winner_proof:
        for toolchain, dispatch in results:
            if dispatch.proof and dispatch.proof.workcell_id == winner_proof.workcell_id:
                winner_dispatch = dispatch
                winner_toolchain = toolchain
                break
    if winner_dispatch is None:
        for toolchain, dispatch in results:
            if dispatch.proof:
                winner_dispatch = dispatch
                winner_toolchain = toolchain
                break

    winner_verification = (
        winner_dispatch.proof.verification
        if winner_dispatch and winner_dispatch.proof and isinstance(winner_dispatch.proof.verification, dict)
        else None
    )
    winner_verified = bool(winner_verification and winner_verification.get("all_passed", False))

    durations = [_duration_ms(r.proof) for _, r in results if r.proof]
    duration_values = [d for d in durations if d is not None]
    duration_max = max(duration_values, default=None)
    duration_sum = sum(duration_values, start=0) if duration_values else None

    costs = [_cost_usd(r.proof) for _, r in results if r.proof]
    cost_values = [c for c in costs if c is not None]
    cost_sum = sum(cost_values, start=0.0) if cost_values else None

    winner_archive_path = None
    if winner_dispatch and winner_dispatch.workcell_id:
        winner_archive_path = str((bench_dir / "archives" / winner_dispatch.workcell_id).resolve())

    return CandidateOutcome(
        action=action,
        verified=winner_verified,
        status=winner_dispatch.proof.status if winner_dispatch and winner_dispatch.proof else "error",
        duration_ms=duration_max,
        cost_usd=cost_sum,
        workcell_id=winner_dispatch.workcell_id if winner_dispatch else None,
        details={
            "toolchains": toolchains,
            "winner_toolchain": winner_toolchain,
            "winner_archive_path": winner_archive_path,
            "verification": winner_verification,
            "runs": run_details,
            "duration_ms_max": duration_max,
            "duration_ms_sum": duration_sum,
            "cost_usd_sum": cost_sum,
        },
    )
