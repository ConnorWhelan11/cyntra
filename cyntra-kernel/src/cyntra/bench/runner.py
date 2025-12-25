"""
Bench harness utilities.
"""

from __future__ import annotations

import copy
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from cyntra.kernel.config import KernelConfig

logger = structlog.get_logger()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def prepare_bench_config(
    *,
    base_config: KernelConfig,
    bench_dir: Path,
    max_concurrent: int | None = None,
) -> KernelConfig:
    """
    Create an isolated KernelConfig rooted at `bench_dir` for bench execution.
    """
    config = copy.deepcopy(base_config)

    config.kernel_dir = bench_dir
    config.logs_dir = bench_dir / "logs"
    config.archives_dir = bench_dir / "archives"
    config.state_dir = bench_dir / "state"
    config.workcells_dir = bench_dir / "workcells"
    config.beads_path = bench_dir / "beads"

    if max_concurrent is not None:
        config.max_concurrent_workcells = int(max_concurrent)

    # Ensure directories exist before running.
    config.kernel_dir.mkdir(parents=True, exist_ok=True)
    config.logs_dir.mkdir(parents=True, exist_ok=True)
    config.archives_dir.mkdir(parents=True, exist_ok=True)
    config.state_dir.mkdir(parents=True, exist_ok=True)
    config.workcells_dir.mkdir(parents=True, exist_ok=True)
    config.beads_path.mkdir(parents=True, exist_ok=True)

    return config


def _bench_cases(bench: dict[str, Any]) -> list[dict[str, Any]]:
    raw_cases = bench.get("cases") or bench.get("tasks") or []
    if not isinstance(raw_cases, list):
        return []
    return [c for c in raw_cases if isinstance(c, dict)]


def _sanitize_sampling(sampling: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(sampling, dict):
        return {}
    temperature = sampling.get("temperature")
    top_p = sampling.get("top_p")
    return {
        "temperature": float(temperature) if isinstance(temperature, (int, float)) else None,
        "top_p": float(top_p) if isinstance(top_p, (int, float)) else None,
    }


def write_bench_beads(
    *,
    bench: dict[str, Any],
    beads_dir: Path,
    toolchain: str | None,
    prompt_genome_id: str | None,
    sampling: dict[str, Any] | None,
    apply_patch: bool = False,
) -> list[str]:
    """
    Write a minimal Beads graph for a bench into `beads_dir`.

    Returns the created issue IDs in order.
    """
    beads_dir.mkdir(parents=True, exist_ok=True)

    issues_path = beads_dir / "issues.jsonl"
    deps_path = beads_dir / "deps.jsonl"
    deps_path.write_text("")

    now = _utc_now()
    issues: list[dict[str, Any]] = []
    ids: list[str] = []

    sampling_cfg = _sanitize_sampling(sampling) if sampling else {}

    for index, case in enumerate(_bench_cases(bench), start=1):
        issue_id = str(case.get("id") or case.get("issue_id") or case.get("case_id") or f"{index}")
        title = str(case.get("title") or f"Bench case {issue_id}")

        description = case.get("description")
        if not isinstance(description, str):
            description = ""

        issue: dict[str, Any] = {
            "id": issue_id,
            "title": title,
            "status": "open",
            "created": now,
            "updated": now,
            "description": description,
            "acceptance_criteria": case.get("acceptance_criteria") or [],
            "context_files": case.get("context_files") or [],
            "tags": case.get("tags") or ["bench"],
            "dk_priority": case.get("dk_priority") or "P3",
            "dk_risk": case.get("dk_risk") or "low",
            "dk_size": case.get("dk_size") or "XS",
            "dk_max_attempts": int(case.get("dk_max_attempts") or 1),
            "dk_estimated_tokens": int(case.get("dk_estimated_tokens") or 4000),
            "dk_forbidden_paths": case.get("dk_forbidden_paths") or [],
            "dk_apply_patch": bool(case.get("dk_apply_patch") if "dk_apply_patch" in case else apply_patch),
        }

        if toolchain:
            issue["dk_tool_hint"] = toolchain

        if prompt_genome_id:
            issue["dk_prompt_genome_id"] = prompt_genome_id

        if sampling_cfg and any(v is not None for v in sampling_cfg.values()):
            issue["dk_sampling"] = sampling_cfg

        quality_gates = case.get("quality_gates") or case.get("gates") or {}
        if isinstance(quality_gates, dict) and quality_gates:
            issue["dk_quality_gates"] = quality_gates

        issues.append(issue)
        ids.append(issue_id)

    with open(issues_path, "w", encoding="utf-8") as f:
        for issue in issues:
            f.write(json.dumps(issue) + "\n")

    return ids


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def write_bench_report(
    *,
    bench: dict[str, Any],
    bench_dir: Path,
    toolchain: str | None,
    prompt_genome_id: str | None,
    sampling: dict[str, Any] | None,
) -> Path:
    archives_dir = bench_dir / "archives"
    items: list[dict[str, Any]] = []

    passed = 0
    failed = 0

    for archive in sorted([p for p in archives_dir.iterdir() if p.is_dir()]):
        manifest = _read_json(archive / "manifest.json") or {}
        proof = _read_json(archive / "proof.json") or {}
        rollout = _read_json(archive / "rollout.json") or {}

        issue_id = (
            str((manifest.get("issue") or {}).get("id"))
            or str(proof.get("issue_id"))
            or "unknown"
        )

        all_passed = None
        duration_ms = None
        cost_usd = None
        diff_lines = None
        status = proof.get("status")

        if isinstance(rollout, dict) and rollout:
            verification = rollout.get("outcomes", {}).get("verification", {})
            if isinstance(verification, dict):
                all_passed = bool(verification.get("all_passed", False))
            scores = rollout.get("scores") if isinstance(rollout.get("scores"), dict) else {}
            duration_ms = scores.get("duration_ms")
            cost_usd = scores.get("cost_usd")
            diff_lines = scores.get("diff_lines")

        if all_passed is True:
            passed += 1
        elif all_passed is False:
            failed += 1

        items.append(
            {
                "workcell_id": archive.name,
                "issue_id": issue_id,
                "status": status,
                "all_passed": all_passed,
                "duration_ms": duration_ms,
                "cost_usd": cost_usd,
                "diff_lines": diff_lines,
                "archive_path": str(archive),
            }
        )

    report = {
        "schema_version": "cyntra.bench_report.v1",
        "bench": bench.get("name") or bench.get("id") or "bench",
        "generated_at": _utc_now(),
        "toolchain": toolchain,
        "prompt_genome_id": prompt_genome_id,
        "sampling": _sanitize_sampling(sampling) if sampling else {"temperature": None, "top_p": None},
        "summary": {
            "total_archives": len(items),
            "passed": passed,
            "failed": failed,
        },
        "items": items,
    }

    out_path = bench_dir / "bench_report.json"
    out_path.write_text(json.dumps(report, indent=2))
    return out_path


def write_bench_config_snapshot(config: KernelConfig, bench_dir: Path) -> None:
    """Write a debug snapshot of the bench config (best-effort)."""
    snapshot = asdict(config)
    (bench_dir / "bench_config.json").write_text(json.dumps(snapshot, indent=2, default=str))

