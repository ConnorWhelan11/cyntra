"""
Transition logger for Cyntra dynamics.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from cyntra.dynamics.state_t1 import (
    bucket_diff_lines,
    bucket_files_touched,
    build_state_t1,
)

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


def _load_telemetry(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError as exc:
        logger.warning("Failed to read telemetry", path=str(path), error=str(exc))
    return events


def _detect_domain(job_type: str) -> str:
    if job_type.startswith("fab-world") or job_type.startswith("fab.world"):
        return "fab_world"
    if job_type.startswith("fab"):
        return "fab_asset"
    return "code"


def _classify_command(command: str) -> str:
    command_lower = command.lower()
    if "pytest" in command_lower:
        return "run_test"
    if "mypy" in command_lower:
        return "run_typecheck"
    if "ruff" in command_lower:
        return "run_lint"
    if "build" in command_lower:
        return "run_build"
    return "bash"


def _phase_from_command(command: str) -> str | None:
    classification = _classify_command(command)
    mapping = {
        "run_test": "test",
        "run_typecheck": "typecheck",
        "run_lint": "lint",
        "run_build": "build",
    }
    return mapping.get(classification)


def _derive_error_class(proof: dict[str, Any] | None) -> str:
    if not isinstance(proof, dict):
        return "unknown"
    status = proof.get("status")
    if status == "timeout":
        return "timeout"
    if status in ("failed", "error"):
        return "error"

    verification = proof.get("verification")
    if isinstance(verification, dict):
        blocking = verification.get("blocking_failures") or []
        if isinstance(blocking, list) and blocking:
            return str(blocking[0])

    return "none"


def _failing_gate(proof: dict[str, Any] | None) -> str:
    if not isinstance(proof, dict):
        return "none"
    verification = proof.get("verification")
    if isinstance(verification, dict):
        blocking = verification.get("blocking_failures") or []
        if isinstance(blocking, list) and blocking:
            return str(blocking[0])
    return "none"


def _extract_patch_stats(proof: dict[str, Any] | None) -> tuple[int, int]:
    if not isinstance(proof, dict):
        return 0, 0
    patch = proof.get("patch")
    if not isinstance(patch, dict):
        return 0, 0
    diff_stats = patch.get("diff_stats")
    if not isinstance(diff_stats, dict):
        return 0, 0
    insertions = int(diff_stats.get("insertions") or 0)
    deletions = int(diff_stats.get("deletions") or 0)
    files = patch.get("files_modified")
    files_touched = len(files) if isinstance(files, list) else 0
    return insertions + deletions, files_touched


def _bucket_temperature(value: Any) -> str | None:
    if not isinstance(value, (int, float)):
        return None
    return f"{float(value):.1f}".rstrip("0").rstrip(".")


def _policy_key(manifest: dict[str, Any] | None, proof: dict[str, Any] | None) -> dict[str, Any]:
    toolchain = None
    if isinstance(manifest, dict):
        toolchain = manifest.get("toolchain")
    if not toolchain and isinstance(proof, dict):
        toolchain = (proof.get("metadata") or {}).get("toolchain")

    prompt_genome_id = None
    temperature_bucket = None
    if isinstance(manifest, dict):
        toolchain_config = manifest.get("toolchain_config") or {}
        if isinstance(toolchain_config, dict):
            candidate = toolchain_config.get("prompt_genome_id")
            if isinstance(candidate, str) and candidate.strip():
                prompt_genome_id = candidate.strip()
            sampling = toolchain_config.get("sampling")
            if isinstance(sampling, dict):
                temperature_bucket = _bucket_temperature(sampling.get("temperature"))
    if prompt_genome_id is None and isinstance(proof, dict):
        candidate = (proof.get("metadata") or {}).get("prompt_genome_id")
        if isinstance(candidate, str) and candidate.strip():
            prompt_genome_id = candidate.strip()
    return {
        "toolchain": toolchain or "unknown",
        "prompt_genome_id": prompt_genome_id,
        "temperature_bucket": temperature_bucket,
    }


def _build_transition(
    *,
    rollout_id: str,
    from_state: dict[str, Any],
    to_state: dict[str, Any],
    transition_kind: str,
    action_label: dict[str, Any],
    context: dict[str, Any],
    timestamp: str,
    observations: dict[str, Any] | None = None,
    index: int = 0,
) -> dict[str, Any]:
    base = {
        "schema_version": "cyntra.transition.v1",
        "rollout_id": rollout_id,
        "from_state": from_state,
        "to_state": to_state,
        "transition_kind": transition_kind,
        "action_label": action_label,
        "context": context,
        "timestamp": timestamp,
        "observations": observations or {},
    }
    seed = json.dumps(
        {
            "rollout_id": rollout_id,
            "from": from_state.get("state_id"),
            "to": to_state.get("state_id"),
            "timestamp": timestamp,
            "action": action_label,
            "index": index,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    transition_id = f"tr_{hashlib.sha256(seed.encode('utf-8')).hexdigest()}"
    return {**base, "transition_id": transition_id}


def _resolve_world_manifest(
    manifest: dict[str, Any] | None, proof: dict[str, Any] | None, workcell_path: Path
) -> dict[str, Any] | None:
    if isinstance(proof, dict):
        artifacts = proof.get("artifacts")
        if isinstance(artifacts, dict):
            manifest_path = artifacts.get("manifest_path")
            if isinstance(manifest_path, str):
                path = Path(manifest_path)
                if not path.is_absolute():
                    path = workcell_path / manifest_path
                manifest_data = _read_json(path)
                if manifest_data:
                    return manifest_data
            run_dir = artifacts.get("run_dir")
            if isinstance(run_dir, str):
                path = Path(run_dir)
                if not path.is_absolute():
                    path = workcell_path / run_dir
                manifest_data = _read_json(path / "manifest.json")
                if manifest_data:
                    return manifest_data

    if isinstance(manifest, dict):
        world_config = manifest.get("world_config") or {}
        if isinstance(world_config, dict):
            run_dir = world_config.get("run_dir")
            if isinstance(run_dir, str):
                path = workcell_path / run_dir
                manifest_data = _read_json(path / "manifest.json")
                if manifest_data:
                    return manifest_data

    return None


def build_transitions(workcell_path: Path) -> list[dict[str, Any]]:
    """
    Build transitions for a workcell or archive directory.
    """
    manifest = _read_json(workcell_path / "manifest.json") or {}
    proof = _read_json(workcell_path / "proof.json") or {}

    if not proof:
        logger.warning("Missing proof.json; skipping transitions", path=str(workcell_path))
        return []

    issue_id = str(proof.get("issue_id") or (manifest.get("issue") or {}).get("id") or "unknown")
    workcell_id = str(proof.get("workcell_id") or manifest.get("workcell_id") or workcell_path.name)
    rollout_id = f"ro_{workcell_id}"

    job_type = str(manifest.get("job_type") or "code")
    domain = _detect_domain(job_type)
    policy = _policy_key(manifest, proof)

    context = {
        "issue_id": issue_id,
        "job_type": job_type,
        "toolchain": policy.get("toolchain"),
        "prompt_genome_id": policy.get("prompt_genome_id"),
        "workcell_id": workcell_id,
    }

    world_manifest = None
    if domain == "fab_world":
        world_manifest = _resolve_world_manifest(manifest, proof, workcell_path)

    if world_manifest:
        return _build_world_transitions(
            rollout_id=rollout_id,
            job_type=job_type,
            policy=policy,
            context=context,
            manifest=world_manifest,
        )

    telemetry_path = workcell_path / "telemetry.jsonl"
    if not telemetry_path.exists():
        telemetry_path = workcell_path / "logs" / "telemetry.jsonl"

    telemetry = _load_telemetry(telemetry_path)

    diff_lines, files_touched = _extract_patch_stats(proof)
    diff_bucket = bucket_diff_lines(diff_lines)
    files_bucket = bucket_files_touched(files_touched)
    failing_gate = _failing_gate(proof)
    error_class = _derive_error_class(proof)

    phase = "plan"
    features = {
        "phase": phase,
        "failing_gate": "none",
        "diff_bucket": diff_bucket,
        "files_touched_bucket": files_bucket,
        "error_class": "none",
    }
    prev_state = build_state_t1(
        domain=domain,
        job_type=job_type,
        features=features,
        policy_key=policy,
    )

    transitions: list[dict[str, Any]] = []

    for index, event in enumerate(telemetry):
        event_type = event.get("type")
        timestamp = event.get("timestamp") or f"index:{index}"

        transition_kind = "tool"
        action_label = {"tool": "Unknown", "command_class": None, "domain": domain}

        if event_type == "file_read":
            action_label["tool"] = "Read"
        elif event_type == "file_write":
            phase = "edit"
            action_label["tool"] = "Write"
        elif event_type == "bash_command":
            command = str(event.get("command") or "")
            action_label["tool"] = "Bash"
            command_class = _classify_command(command)
            action_label["command_class"] = command_class
            maybe_phase = _phase_from_command(command)
            if maybe_phase:
                phase = maybe_phase
                transition_kind = "gate"
        elif event_type == "tool_call":
            tool = str(event.get("tool") or "")
            if "blender" in tool.lower():
                action_label["tool"] = "Blender"
            else:
                action_label["tool"] = "Tool"
        else:
            continue

        features = {
            "phase": phase,
            "failing_gate": "none",
            "diff_bucket": diff_bucket,
            "files_touched_bucket": files_bucket,
            "error_class": "none",
        }
        next_state = build_state_t1(
            domain=domain,
            job_type=job_type,
            features=features,
            policy_key=policy,
        )

        transitions.append(
            _build_transition(
                rollout_id=rollout_id,
                from_state=prev_state,
                to_state=next_state,
                transition_kind=transition_kind,
                action_label=action_label,
                context=context,
                timestamp=timestamp,
                index=index,
            )
        )
        prev_state = next_state

    final_phase = phase
    verification = proof.get("verification")
    if isinstance(verification, dict) and verification.get("all_passed") is True:
        final_phase = "merge"
    elif failing_gate in {"test", "lint", "typecheck", "build"}:
        final_phase = failing_gate

    final_features = {
        "phase": final_phase,
        "failing_gate": failing_gate,
        "diff_bucket": diff_bucket,
        "files_touched_bucket": files_bucket,
        "error_class": error_class,
    }
    final_state = build_state_t1(
        domain=domain,
        job_type=job_type,
        features=final_features,
        policy_key=policy,
    )

    final_timestamp = (proof.get("metadata") or {}).get("completed_at") or _utc_now()
    transitions.append(
        _build_transition(
            rollout_id=rollout_id,
            from_state=prev_state,
            to_state=final_state,
            transition_kind="gate",
            action_label={"tool": "Gate", "command_class": failing_gate, "domain": domain},
            context=context,
            timestamp=final_timestamp,
            observations={"gate": failing_gate},
            index=len(transitions),
        )
    )

    return transitions


def _build_world_transitions(
    *,
    rollout_id: str,
    job_type: str,
    policy: dict[str, Any],
    context: dict[str, Any],
    manifest: dict[str, Any],
) -> list[dict[str, Any]]:
    stages = manifest.get("stages") or []
    seed = None
    determinism = manifest.get("determinism")
    if isinstance(determinism, dict):
        seed = determinism.get("seed")

    prev_state = build_state_t1(
        domain="fab_world",
        job_type=job_type,
        features={"stage": "start", "stage_status": "start", "seed": seed},
        policy_key=policy,
    )

    transitions: list[dict[str, Any]] = []

    for index, stage in enumerate(stages):
        if not isinstance(stage, dict):
            continue
        stage_id = str(stage.get("id") or "unknown")
        status = str(stage.get("status") or "unknown")
        timestamp = stage.get("started_at") or f"stage:{index}"

        next_state = build_state_t1(
            domain="fab_world",
            job_type=job_type,
            features={"stage": stage_id, "stage_status": status, "seed": seed},
            policy_key=policy,
        )

        transitions.append(
            _build_transition(
                rollout_id=rollout_id,
                from_state=prev_state,
                to_state=next_state,
                transition_kind="stage",
                action_label={"tool": "stage", "command_class": stage_id, "domain": "fab_world"},
                context=context,
                timestamp=timestamp,
                observations={"status": status, "duration_ms": stage.get("duration_ms")},
                index=index,
            )
        )

        prev_state = next_state

    if not transitions:
        final_state = build_state_t1(
            domain="fab_world",
            job_type=job_type,
            features={"stage": "complete", "stage_status": "unknown", "seed": seed},
            policy_key=policy,
        )
        transitions.append(
            _build_transition(
                rollout_id=rollout_id,
                from_state=prev_state,
                to_state=final_state,
                transition_kind="stage",
                action_label={"tool": "stage", "command_class": "complete", "domain": "fab_world"},
                context=context,
                timestamp=_utc_now(),
                index=0,
            )
        )

    return transitions
