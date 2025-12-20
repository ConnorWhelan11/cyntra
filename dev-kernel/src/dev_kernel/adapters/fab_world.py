"""
Fab World Adapter - Execute deterministic world builds in workcells.

This adapter runs the local `fab-world` pipeline (implemented in `dev_kernel.fab.world`)
inside a workcell sandbox, producing a build manifest and optional gate results.

Note: workcells are isolation sandboxes; not every toolchain is an LLM agent.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import structlog

from dev_kernel.adapters.base import CostEstimate, PatchProof, ToolchainAdapter

logger = structlog.get_logger()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class WorldBuildResult:
    world_id: str
    run_id: str
    run_dir: Path
    manifest_path: Path
    manifest: dict[str, Any] | None


class FabWorldAdapter(ToolchainAdapter):
    """
    Adapter that builds a Fab World (non-LLM toolchain).

    Expected manifest shape (Dispatcher):
        manifest["world_config"] = {
          "world_path": "fab/worlds/outora_library",
          "seed": 42,
          "param_overrides": {"lighting.preset": "cosmic"},
          "quality_gates": ["fab/gates/interior_library_v001.yaml", ...],
        }
    """

    name = "fab-world"
    supports_mcp = False
    supports_streaming = False

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = config or {}
        self._available: bool | None = None

    @property
    def available(self) -> bool:
        if self._available is None:
            self._available = True
        return self._available

    async def health_check(self) -> bool:
        return True

    def estimate_cost(self, manifest: dict) -> CostEstimate:
        return CostEstimate(estimated_tokens=0, estimated_cost_usd=0.0, model="local")

    def execute_sync(
        self,
        manifest: dict,
        workcell_path: Path,
        timeout_seconds: int = 1800,
    ) -> PatchProof:
        return asyncio.run(
            self.execute(
                manifest=manifest,
                workcell_path=workcell_path,
                timeout=timedelta(seconds=timeout_seconds),
            )
        )

    async def execute(
        self,
        manifest: dict,
        workcell_path: Path,
        timeout: timedelta,
    ) -> PatchProof:
        started_at = _utc_now()
        workcell_id = str(manifest.get("workcell_id", "unknown"))
        issue_id = str((manifest.get("issue") or {}).get("id", "unknown"))

        logs_dir = workcell_path / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = logs_dir / "fab-world-stdout.log"
        stderr_path = logs_dir / "fab-world-stderr.log"

        world_config = manifest.get("world_config") or {}
        world_path = str(world_config.get("world_path") or "fab/worlds/outora_library")
        seed = int(world_config.get("seed") or 42)
        param_overrides = world_config.get("param_overrides") or {}

        run_dir = workcell_path / ".glia-fab" / "runs" / "fab-world"
        run_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            "python",
            "-m",
            "dev_kernel.fab.world",
            "build",
            "--world",
            str((workcell_path / world_path).resolve()),
            "--output",
            str(run_dir.resolve()),
            "--seed",
            str(seed),
        ]
        for key, value in param_overrides.items():
            serialized = value
            if not isinstance(value, str):
                serialized = json.dumps(value)
            cmd.extend(["--param", f"{key}={serialized}"])

        logger.info(
            "fab-world build starting",
            workcell_id=workcell_id,
            issue_id=issue_id,
            world_path=world_path,
            seed=seed,
            run_dir=str(run_dir),
        )

        result = self._run_cmd(
            cmd=cmd,
            cwd=workcell_path / "dev-kernel",
            timeout=timeout,
            stdout_path=stdout_path,
            stderr_path=stderr_path,
        )

        build_result = self._load_build_result(run_dir)
        completed_at = _utc_now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        status = "success" if result.returncode == 0 else "failed"
        verification = self._build_verification(status=status, build_result=build_result)

        patch: dict[str, Any] = {
            "files_modified": [],
            "diff_stats": {"files_changed": 0, "insertions": 0, "deletions": 0},
            "forbidden_path_violations": [],
        }
        artifacts: dict[str, Any] = {
            "run_dir": str(build_result.run_dir),
            "manifest_path": str(build_result.manifest_path),
        }
        if build_result.manifest:
            artifacts["world_id"] = build_result.manifest.get("world_id")
            artifacts["run_id"] = build_result.manifest.get("run_id")
            artifacts["final_outputs"] = build_result.manifest.get("final_outputs", [])

        return PatchProof(
            schema_version="1.0.0",
            workcell_id=workcell_id,
            issue_id=issue_id,
            status=status,
            patch=patch,
            verification=verification,
            metadata={
                "toolchain": self.name,
                "model": "local",
                "started_at": started_at.isoformat().replace("+00:00", "Z"),
                "completed_at": completed_at.isoformat().replace("+00:00", "Z"),
                "duration_ms": duration_ms,
                "exit_code": result.returncode,
            },
            commands_executed=[
                {
                    "command": " ".join(cmd),
                    "exit_code": result.returncode,
                    "duration_ms": duration_ms,
                    "stdout_path": str(stdout_path),
                    "stderr_path": str(stderr_path),
                }
            ],
            artifacts=artifacts,
            confidence=0.9 if status == "success" else 0.2,
            risk_classification="low",
        )

    def _build_verification(self, *, status: str, build_result: WorldBuildResult) -> dict[str, Any]:
        verification: dict[str, Any] = {
            "gates": {},
            "all_passed": status == "success",
            "blocking_failures": [],
        }

        manifest = build_result.manifest or {}
        stages = manifest.get("stages") if isinstance(manifest, dict) else None
        if not isinstance(stages, list):
            return verification

        validate_stage = None
        for stage in stages:
            if isinstance(stage, dict) and stage.get("id") == "validate":
                validate_stage = stage
                break

        metadata = validate_stage.get("metadata") if isinstance(validate_stage, dict) else None
        gates = metadata.get("gates") if isinstance(metadata, dict) else None
        if not isinstance(gates, list):
            return verification

        gate_results: dict[str, Any] = {}
        blocking: list[str] = []
        all_passed = True
        for gate in gates:
            if not isinstance(gate, dict):
                continue
            name = gate.get("gate")
            if not isinstance(name, str) or not name:
                continue
            passed = gate.get("passed")
            if passed is not True:
                all_passed = False
            if passed is False:
                blocking.append(name)

            # Preserve any structured hints (next_actions) for kernel repair flow.
            gate_results[name] = dict(gate)

        verification["gates"] = gate_results
        verification["blocking_failures"] = blocking
        verification["all_passed"] = status == "success" and all_passed and not blocking
        return verification

    def _run_cmd(
        self,
        *,
        cmd: list[str],
        cwd: Path,
        timeout: timedelta,
        stdout_path: Path,
        stderr_path: Path,
    ) -> subprocess.CompletedProcess[str]:
        timeout_seconds = max(int(timeout.total_seconds()), 1)
        try:
            completed = subprocess.run(
                cmd,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as e:
            stdout_path.write_text(e.stdout or "")
            stderr_path.write_text((e.stderr or "") + "\nTIMEOUT\n")
            return subprocess.CompletedProcess(cmd, returncode=124, stdout=e.stdout or "", stderr=e.stderr or "")

        stdout_path.write_text(completed.stdout or "")
        stderr_path.write_text(completed.stderr or "")
        return completed

    def _load_build_result(self, run_dir: Path) -> WorldBuildResult:
        manifest_path = run_dir / "manifest.json"
        manifest: dict[str, Any] | None = None
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text())
            except Exception:
                manifest = None
        world_id = str((manifest or {}).get("world_id", "unknown"))
        run_id = str((manifest or {}).get("run_id", "unknown"))
        return WorldBuildResult(
            world_id=world_id,
            run_id=run_id,
            run_dir=run_dir,
            manifest_path=manifest_path,
            manifest=manifest,
        )
