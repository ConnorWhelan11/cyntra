"""
Kernel-backed evaluation harness for prompt evolution.

This integrates with the Cyntra kernel primitives (WorkcellManager, Dispatcher,
Verifier) to score a prompt genome on a set of benchmark cases.

Bench contract (kernel mode):
- `cases`: list of either:
  - issue id strings (loaded from Beads), or
  - dicts with an `issue` object (inline issue), or
  - dicts with `issue_id` (loaded from Beads)
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from cyntra.kernel.config import KernelConfig
from cyntra.kernel.dispatcher import Dispatcher
from cyntra.kernel.verifier import Verifier
from cyntra.state.manager import StateManager
from cyntra.state.models import Issue
from cyntra.workcell.manager import WorkcellManager


def _diff_lines(patch: Any) -> int:
    if not isinstance(patch, dict):
        return 0
    diff_stats = patch.get("diff_stats")
    if not isinstance(diff_stats, dict):
        return 0
    try:
        insertions = int(diff_stats.get("insertions") or 0)
        deletions = int(diff_stats.get("deletions") or 0)
    except (TypeError, ValueError):
        return 0
    return insertions + deletions


def _issue_from_inline(data: dict[str, Any]) -> Issue:
    payload = dict(data)
    payload.setdefault("status", "ready")
    return Issue.from_dict(payload)


def resolve_bench_issues(config: KernelConfig, bench: dict[str, Any]) -> list[Issue]:
    """
    Resolve bench cases into Issue objects.

    - Inline issues are accepted as either:
      - `{"issue": {...}}` case dicts, or
      - a case dict that is itself an inline issue payload (common for `cyntra.benches.*`).
    - Beads issues are loaded by id (case string, `issue_id`, or `issue` string).
    """
    cases = bench.get("cases")
    if cases is None:
        cases = bench.get("issues")
    if cases is None:
        raise ValueError("Bench must define `cases` (or legacy `issues`).")
    if not isinstance(cases, list):
        raise TypeError("Bench `cases` must be a list.")

    state = StateManager(config)
    graph = None

    resolved: list[Issue] = []
    for case in cases:
        if isinstance(case, str):
            issue_id = case
            if graph is None:
                graph = state.load_beads_graph()
            issue = next((i for i in graph.issues if i.id == issue_id), None)
            if not issue:
                raise ValueError(f"Bench issue not found in Beads: {issue_id}")
            resolved.append(issue)
            continue

        if not isinstance(case, dict):
            raise TypeError("Bench case must be a string or dict.")

        inline_issue = case.get("issue")
        if isinstance(inline_issue, dict):
            resolved.append(_issue_from_inline(inline_issue))
            continue

        issue_id = case.get("issue_id") or case.get("issue")
        if isinstance(issue_id, str) and issue_id.strip():
            if graph is None:
                graph = state.load_beads_graph()
            issue = next((i for i in graph.issues if i.id == issue_id), None)
            if not issue:
                raise ValueError(f"Bench issue not found in Beads: {issue_id}")
            resolved.append(issue)
            continue

        # Fall back to treating the case dict as an inline issue payload.
        # This is the common format for `cyntra.benches.*` suites.
        if "id" in case or "title" in case:
            resolved.append(_issue_from_inline(case))
            continue

        raise ValueError(
            "Bench case dict must include `issue` (inline dict), `issue_id`, or be an inline issue payload."
        )

    return resolved


@dataclass(frozen=True)
class CaseResult:
    issue_id: str
    title: str
    workcell_id: str | None
    toolchain: str | None
    status: str
    verified: bool
    cost_usd: float | None
    duration_ms: int | None
    diff_lines: int
    error: str | None = None


def aggregate_case_results(results: list[CaseResult]) -> dict[str, Any]:
    total = len(results)
    passed = sum(1 for r in results if r.verified)

    cost_values = [r.cost_usd for r in results if isinstance(r.cost_usd, (int, float))]
    duration_values = [r.duration_ms for r in results if isinstance(r.duration_ms, int)]
    diff_values = [r.diff_lines for r in results]

    metrics: dict[str, Any] = {
        "cases_total": total,
        "cases_passed": passed,
        "cases_failed": total - passed,
        "pass_rate": (passed / total) if total else 0.0,
        "avg_diff_lines": (sum(diff_values) / total) if total else 0.0,
    }

    # Common aliases used in evolve objectives/frontiers.
    metrics["quality"] = metrics["pass_rate"]

    if cost_values:
        metrics["avg_cost_usd"] = float(sum(cost_values) / len(cost_values))
        metrics["cost"] = metrics["avg_cost_usd"]
    if duration_values:
        metrics["avg_duration_ms"] = int(sum(duration_values) / len(duration_values))

    return metrics


async def evaluate_genome_on_issues(
    config: KernelConfig,
    issues: list[Issue],
    *,
    prompt_genome: dict[str, Any],
    toolchain_override: str | None = None,
    keep_workcells: bool = False,
    max_cases: int | None = None,
) -> tuple[list[CaseResult], dict[str, Any]]:
    """
    Evaluate a prompt genome by running the kernel dispatcher+verifier on cases.

    NOTE: This creates and tears down git worktrees. Use with care.
    """
    workcells = WorkcellManager(config, config.repo_root)
    dispatcher = Dispatcher(config)
    verifier = Verifier(config)

    genome_id = str(prompt_genome.get("genome_id") or "").strip()
    sampling_cfg = (
        prompt_genome.get("sampling") if isinstance(prompt_genome.get("sampling"), dict) else {}
    )
    temperature = sampling_cfg.get("temperature")
    top_p = sampling_cfg.get("top_p")
    sampling_override = {
        "temperature": float(temperature) if isinstance(temperature, (int, float)) else None,
        "top_p": float(top_p) if isinstance(top_p, (int, float)) else None,
    }

    case_results: list[CaseResult] = []

    for idx, issue in enumerate(issues):
        if max_cases is not None and idx >= max_cases:
            break

        workcell_path = workcells.create(issue.id, speculate_tag="bench")
        try:
            overrides: dict[str, Any] = {"toolchain_config": {"sampling": sampling_override}}
            if genome_id:
                overrides["toolchain_config"]["prompt_genome_id"] = genome_id

            dispatch = await dispatcher.dispatch_async(
                issue,
                workcell_path,
                toolchain_override=toolchain_override,
                manifest_overrides=overrides,
            )

            proof = dispatch.proof
            verified = False
            status = "error"
            toolchain = dispatch.toolchain if dispatch else None
            cost_usd = None
            duration_ms = None
            diff_lines = 0

            if proof is not None:
                status = proof.status
                verified = verifier.verify(proof, workcell_path)

                metadata = proof.metadata if isinstance(proof.metadata, dict) else {}
                if "cost_usd" in metadata:
                    try:
                        cost_usd = float(metadata.get("cost_usd"))  # type: ignore[arg-type]
                    except (TypeError, ValueError):
                        cost_usd = None
                if "duration_ms" in metadata:
                    try:
                        duration_ms = int(metadata.get("duration_ms"))  # type: ignore[arg-type]
                    except (TypeError, ValueError):
                        duration_ms = None

                diff_lines = _diff_lines(proof.patch)

            case_results.append(
                CaseResult(
                    issue_id=issue.id,
                    title=issue.title,
                    workcell_id=dispatch.workcell_id if dispatch else None,
                    toolchain=toolchain,
                    status=status,
                    verified=verified,
                    cost_usd=cost_usd,
                    duration_ms=duration_ms,
                    diff_lines=diff_lines,
                )
            )

        except Exception as exc:  # noqa: BLE001 (bench harness should be resilient)
            case_results.append(
                CaseResult(
                    issue_id=issue.id,
                    title=issue.title,
                    workcell_id=workcell_path.name,
                    toolchain=toolchain_override,
                    status="error",
                    verified=False,
                    cost_usd=None,
                    duration_ms=None,
                    diff_lines=0,
                    error=str(exc),
                )
            )
        finally:
            if not keep_workcells:
                # Always archive logs to `.cyntra/archives` for bench inspection.
                workcells.cleanup(workcell_path, keep_logs=True)

    metrics = aggregate_case_results(case_results)
    return case_results, metrics


def evaluate_genome_on_issues_sync(
    config: KernelConfig,
    issues: list[Issue],
    *,
    prompt_genome: dict[str, Any],
    toolchain_override: str | None = None,
    keep_workcells: bool = False,
    max_cases: int | None = None,
) -> tuple[list[CaseResult], dict[str, Any]]:
    return asyncio.run(
        evaluate_genome_on_issues(
            config,
            issues,
            prompt_genome=prompt_genome,
            toolchain_override=toolchain_override,
            keep_workcells=keep_workcells,
            max_cases=max_cases,
        )
    )
