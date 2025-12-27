"""
Rollout builder for Cyntra.

Produces a normalized rollout.json from manifest + proof + telemetry.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from cyntra.rollouts.store import rollout_path

logger = structlog.get_logger()


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON", path=str(path))
        return None


def _relative_path(path: Path, base: Path) -> str:
    try:
        return path.relative_to(base).as_posix()
    except ValueError:
        return str(path)


def _summarize_telemetry(path: Path) -> tuple[dict[str, int], str | None]:
    summary = {"Read": 0, "Write": 0, "Bash": 0, "Blender": 0}

    if not path.exists():
        return summary, "missing"
    if path.stat().st_size == 0:
        return summary, "empty"

    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type")
                if event_type == "file_read":
                    summary["Read"] += 1
                elif event_type == "file_write":
                    summary["Write"] += 1
                elif event_type in ("bash_command", "bash_output"):
                    summary["Bash"] += 1
                elif event_type == "tool_call":
                    tool = str(event.get("tool") or "").lower()
                    if any(token in tool for token in ("blender", "bpy", "sverchok")):
                        summary["Blender"] += 1
    except OSError as exc:
        logger.warning("Failed to read telemetry", path=str(path), error=str(exc))

    return summary, None


def _build_file_changes(proof: dict[str, Any] | None) -> list[dict[str, Any]]:
    patch = (proof or {}).get("patch") if isinstance(proof, dict) else None
    files = patch.get("files_modified") if isinstance(patch, dict) else None
    if not isinstance(files, list):
        return []

    return [{"path": str(path), "kind": "modified"} for path in files if path]


def _diff_lines(patch: dict[str, Any] | None) -> int:
    if not isinstance(patch, dict):
        return 0
    diff_stats = patch.get("diff_stats")
    if not isinstance(diff_stats, dict):
        return 0
    insertions = int(diff_stats.get("insertions") or 0)
    deletions = int(diff_stats.get("deletions") or 0)
    return insertions + deletions


def build_rollout(workcell_path: Path) -> dict[str, Any] | None:
    """
    Build a rollout object from workcell artifacts.

    Returns the rollout dict, or None if required inputs are missing.
    """
    manifest_path = workcell_path / "manifest.json"
    proof_path = workcell_path / "proof.json"
    telemetry_path = workcell_path / "telemetry.jsonl"

    manifest = _read_json(manifest_path) or {}
    proof = _read_json(proof_path)

    if not proof:
        logger.warning("Missing proof.json; skipping rollout", workcell=str(workcell_path))
        return None

    issue_id = str(proof.get("issue_id") or (manifest.get("issue") or {}).get("id") or "unknown")
    workcell_id = str(proof.get("workcell_id") or manifest.get("workcell_id") or workcell_path.name)
    rollout_id = f"ro_{workcell_id}"

    job_type = str(manifest.get("job_type") or "code")

    toolchain = (
        manifest.get("toolchain") or (proof.get("metadata") or {}).get("toolchain") or "unknown"
    )
    toolchain_config = manifest.get("toolchain_config") or {}
    if not isinstance(toolchain_config, dict):
        toolchain_config = {}

    model = toolchain_config.get("model") or (proof.get("metadata") or {}).get("model")

    summary, telemetry_missing = _summarize_telemetry(telemetry_path)

    verification = proof.get("verification") if isinstance(proof.get("verification"), dict) else {}
    all_passed = bool(verification.get("all_passed", False))
    blocking = verification.get("blocking_failures") or []
    if not isinstance(blocking, list):
        blocking = []

    patch = proof.get("patch") if isinstance(proof.get("patch"), dict) else {}
    diff_lines = _diff_lines(patch)

    scores: dict[str, Any] = {
        "risk": proof.get("risk_classification") or "unknown",
        "diff_lines": diff_lines,
    }
    metadata = proof.get("metadata") if isinstance(proof.get("metadata"), dict) else {}
    if "cost_usd" in metadata:
        scores["cost_usd"] = metadata.get("cost_usd")
    if "duration_ms" in metadata:
        scores["duration_ms"] = metadata.get("duration_ms")

    policy: dict[str, Any] = {
        "toolchain": toolchain,
        "prompt_genome_id": None,
        "sampling": {"temperature": None, "top_p": None},
        "speculate": {
            "enabled": bool(manifest.get("speculate_mode")),
            "parallelism": None,
            "tag": manifest.get("speculate_tag"),
        },
    }
    if model:
        policy["model"] = model

    prompt_genome_id = toolchain_config.get("prompt_genome_id")
    if isinstance(prompt_genome_id, str) and prompt_genome_id.strip():
        policy["prompt_genome_id"] = prompt_genome_id.strip()

    sampling_cfg = toolchain_config.get("sampling")
    if isinstance(sampling_cfg, dict):
        temperature = sampling_cfg.get("temperature")
        top_p = sampling_cfg.get("top_p")
        policy["sampling"] = {
            "temperature": float(temperature) if isinstance(temperature, (int, float)) else None,
            "top_p": float(top_p) if isinstance(top_p, (int, float)) else None,
        }

    inputs: dict[str, Any] = {
        "manifest_path": _relative_path(manifest_path, workcell_path),
        "repo_commit_base": patch.get("base_commit"),
    }
    if patch.get("head_commit"):
        inputs["repo_commit_head"] = patch.get("head_commit")

    trajectory: dict[str, Any] = {
        "telemetry_path": _relative_path(telemetry_path, workcell_path),
        "tool_summary": summary,
        "file_changes": _build_file_changes(proof),
    }
    if telemetry_missing:
        trajectory["telemetry_missing_reason"] = telemetry_missing

    commands = proof.get("commands_executed")
    if isinstance(commands, list):
        trajectory["commands_executed"] = commands

    rollout: dict[str, Any] = {
        "schema_version": "cyntra.rollout.v1",
        "rollout_id": rollout_id,
        "workcell_id": workcell_id,
        "issue_id": issue_id,
        "job_type": job_type,
        "policy": policy,
        "inputs": inputs,
        "trajectory": trajectory,
        "outcomes": {
            "verification": {
                "all_passed": all_passed,
                "blocking_failures": blocking,
            }
        },
        "scores": scores,
        "generated_at": _utc_now(),
    }

    planner = manifest.get("planner")
    if isinstance(planner, dict) and planner:
        rollout["planner"] = planner

    # Optional fab artifacts if present in proof
    artifacts = proof.get("artifacts")
    if isinstance(artifacts, dict) and artifacts:
        rollout["artifacts"] = artifacts

    return rollout


def write_rollout(workcell_path: Path) -> Path | None:
    """
    Build and persist rollout.json for a workcell.

    Returns the rollout path if written.
    """
    rollout = build_rollout(workcell_path)
    if rollout is None:
        return None

    path = rollout_path(workcell_path)
    try:
        path.write_text(json.dumps(rollout, indent=2))
        logger.debug("Persisted rollout", path=str(path))
        return path
    except OSError as exc:
        logger.warning("Failed to write rollout", path=str(path), error=str(exc))
        return None
