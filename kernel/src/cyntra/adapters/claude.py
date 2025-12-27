"""
Claude Code Adapter - Anthropic Claude Code toolchain integration.

https://github.com/anthropics/claude-code
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

import structlog

from cyntra.adapters.base import CostEstimate, PatchProof, ToolchainAdapter
from cyntra.adapters.telemetry import TelemetryWriter, resolve_kernel_events_path

logger = structlog.get_logger()

CLAUDE_SONNET_4_5 = "claude-sonnet-4-5-20250929"
CLAUDE_OPUS_4_5 = "claude-opus-4-5-20251101"
CLAUDE_HAIKU_4_5 = "claude-haiku-4-5-20251001"


def _utc_now() -> datetime:
    """Get current UTC time as timezone-aware datetime."""
    return datetime.now(UTC)


class ClaudeAdapter(ToolchainAdapter):
    """
    Adapter for Claude Code CLI.

    Claude Code is an agentic coding tool that can:
    - Understand and navigate codebases
    - Make changes across multiple files
    - Run commands and verify changes
    """

    name = "claude"
    supports_mcp = True
    supports_streaming = True
    _mirror_event_types = {
        "started",
        "prompt_sent",
        "response_chunk",
        "response_complete",
        "tool_call",
        "tool_result",
        "file_read",
        "file_write",
        "bash_command",
        "bash_output",
        "thinking",
        "completed",
        "error",
    }

    def __init__(self, config: dict | None = None) -> None:
        self.config = config or {}
        self.executable = str(self.config.get("path") or "claude")
        self.env = dict(self.config.get("env") or {})
        # Keep a stable default ("opus") and allow pinning via config.
        self.default_model = self.config.get("model", "opus")
        ultrathink = self.config.get("ultrathink")
        if ultrathink is None:
            ultrathink = self.config.get("extended_thinking")
        self.ultrathink = True if ultrathink is None else bool(ultrathink)
        self.skip_permissions = self.config.get("skip_permissions", True)
        self._available: bool | None = None

    @property
    def available(self) -> bool:
        """Check if claude CLI is available."""
        if self._available is None:
            if "/" in self.executable:
                self._available = Path(self.executable).exists()
            else:
                self._available = shutil.which(self.executable) is not None
        return self._available

    def execute_sync(
        self,
        manifest: dict,
        workcell_path: Path,
        timeout_seconds: int = 1800,
    ) -> PatchProof:
        """
        Execute task synchronously using Claude CLI.
        """
        started_at = _utc_now()
        workcell_id = manifest.get("workcell_id", "unknown")
        issue_id = manifest.get("issue", {}).get("id", "unknown")

        # Ensure logs directory exists
        logs_dir = workcell_path / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)

        # Build and write prompt
        prompt = self._build_prompt(manifest, workcell_path)
        prompt_file = workcell_path / "prompt.md"
        prompt_file.write_text(prompt)

        # Get configuration
        toolchain_config = manifest.get("toolchain_config", {}) or {}
        model = toolchain_config.get("model", self.default_model)

        # Build command
        cmd = self._build_command(prompt_file, model)

        logger.info(
            "Executing Claude",
            workcell_id=workcell_id,
            issue_id=issue_id,
            model=model,
        )

        try:
            result = subprocess.run(
                cmd,
                cwd=workcell_path,
                capture_output=True,
                text=True,
                env={**os.environ, **self.env} if self.env else None,
                timeout=timeout_seconds,
            )

            completed_at = _utc_now()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            # Save logs
            self._save_logs(logs_dir, result.stdout, result.stderr)

            # Parse and return proof
            proof = self._parse_output(
                stdout=result.stdout,
                stderr=result.stderr,
                exit_code=result.returncode,
                manifest=manifest,
                workcell_path=workcell_path,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
            )

            # Write proof to file
            proof_path = workcell_path / "proof.json"
            proof_path.write_text(json.dumps(proof.to_dict(), indent=2))

            logger.info(
                "Claude execution completed",
                workcell_id=workcell_id,
                status=proof.status,
                duration_ms=duration_ms,
            )

            return proof

        except subprocess.TimeoutExpired:
            logger.error(
                "Claude execution timed out",
                workcell_id=workcell_id,
                timeout=timeout_seconds,
            )
            return self._create_timeout_proof(manifest, started_at)

        except Exception as e:
            logger.error(
                "Claude execution failed",
                workcell_id=workcell_id,
                error=str(e),
            )
            return self._create_error_proof(manifest, started_at, str(e))

    async def execute(
        self,
        manifest: dict,
        workcell_path: Path,
        timeout: timedelta,
    ) -> PatchProof:
        """Execute task asynchronously using Claude CLI."""
        started_at = _utc_now()
        workcell_id = manifest.get("workcell_id", "unknown")
        issue_id = manifest.get("issue", {}).get("id", "unknown")

        # Ensure logs directory exists
        logs_dir = workcell_path / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)

        # Build and write prompt
        prompt = self._build_prompt(manifest, workcell_path)
        prompt_file = workcell_path / "prompt.md"
        prompt_file.write_text(prompt)

        # Get configuration
        toolchain_config = manifest.get("toolchain_config", {}) or {}
        model = toolchain_config.get("model", self.default_model)

        # Initialize telemetry
        telemetry_path = workcell_path / "telemetry.jsonl"
        telemetry = TelemetryWriter(
            telemetry_path,
            context={
                "issue_id": issue_id,
                "workcell_id": workcell_id,
                "toolchain": self.name,
                "model": model,
            },
            mirror_path=resolve_kernel_events_path(workcell_path),
            mirror_event_types=self._mirror_event_types,
        )

        # Build command
        cmd = self._build_command(prompt_file, model)

        logger.info(
            "Executing Claude (async)",
            workcell_id=workcell_id,
            model=model,
        )

        # Emit start event
        telemetry.started(
            toolchain=self.name,
            model=model,
            issue_id=issue_id,
            workcell_id=workcell_id,
            prompt_genome_id=toolchain_config.get("prompt_genome_id")
            if isinstance(toolchain_config, dict)
            else None,
            sampling=toolchain_config.get("sampling")
            if isinstance(toolchain_config, dict)
            else None,
        )
        telemetry.prompt_sent(prompt=prompt)

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=workcell_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, **self.env} if self.env else None,
            )

            # Stream output with telemetry
            stdout, stderr = await self._stream_output_with_telemetry(
                process,
                telemetry,
                timeout.total_seconds(),
            )

            completed_at = _utc_now()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            # Save logs
            self._save_logs(logs_dir, stdout, stderr)

            proof = self._parse_output(
                stdout=stdout,
                stderr=stderr,
                exit_code=process.returncode or 0,
                manifest=manifest,
                workcell_path=workcell_path,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
            )

            # Emit completion event
            telemetry.completed(
                status=proof.status,
                exit_code=process.returncode or 0,
                duration_ms=duration_ms,
            )

            # Write proof to file
            proof_path = workcell_path / "proof.json"
            proof_path.write_text(json.dumps(proof.to_dict(), indent=2))

            telemetry.close()
            return proof

        except TimeoutError:
            logger.error("Claude execution timed out", workcell_id=workcell_id)
            telemetry.error("Execution timed out")
            telemetry.close()
            return self._create_timeout_proof(manifest, started_at)

        except Exception as e:
            logger.error("Claude execution failed", workcell_id=workcell_id, error=str(e))
            telemetry.error(str(e))
            telemetry.close()
            return self._create_error_proof(manifest, started_at, str(e))

    async def health_check(self) -> bool:
        """Check if Claude CLI is available."""
        if not self.available:
            return False

        try:
            process = await asyncio.create_subprocess_exec(
                self.executable,
                "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()
            return process.returncode == 0
        except Exception:
            return False

    def health_check_sync(self) -> bool:
        """Check if Claude CLI is available (sync version)."""
        if not self.available:
            return False

        try:
            result = subprocess.run(
                [self.executable, "--version"],
                capture_output=True,
                timeout=10,
            )
            return result.returncode == 0
        except Exception:
            return False

    def estimate_cost(self, manifest: dict) -> CostEstimate:
        """Estimate cost for Claude execution."""
        model = manifest.get("toolchain_config", {}).get("model", self.default_model)
        estimated_tokens = manifest.get("issue", {}).get("dk_estimated_tokens", 50000)

        # Cost per 1M tokens (input + output combined estimate)
        cost_per_1m = {
            # Model aliases (Claude Code CLI)
            "sonnet": 9.0,
            "opus": 45.0,
            "haiku": 0.75,
            # Claude 4.5 (latest)
            CLAUDE_SONNET_4_5: 9.0,
            CLAUDE_OPUS_4_5: 45.0,
            CLAUDE_HAIKU_4_5: 0.75,
            # Claude 4.5 aliases (if supported by the CLI)
            "claude-sonnet-4-5": 9.0,
            "claude-opus-4-5": 45.0,
            "claude-haiku-4-5": 0.75,
            # Claude 4.0
            "claude-sonnet-4-20250514": 9.0,
            "claude-opus-4-20250514": 45.0,
            # Claude 3.x
            "claude-3-5-sonnet-20241022": 9.0,
            "claude-3-opus-20240229": 45.0,
            "claude-3-sonnet-20240229": 9.0,
            "claude-3-haiku-20240307": 0.75,
        }.get(model, 9.0)

        estimated_cost = (estimated_tokens / 1_000_000) * cost_per_1m

        return CostEstimate(
            estimated_tokens=estimated_tokens,
            estimated_cost_usd=estimated_cost,
            model=model,
        )

    def _build_command(self, prompt_file: Path, model: str) -> list[str]:
        """Build the claude command."""
        cmd = [self.executable]

        # Add prompt
        cmd.extend(["--print", f"@{prompt_file}"])

        # Add model if specified
        if model:
            cmd.extend(["--model", model])

        output_format = self.config.get("output_format")
        if output_format:
            cmd.extend(["--output-format", str(output_format)])

        allowed_tools = self.config.get("allowed_tools")
        if isinstance(allowed_tools, list) and allowed_tools:
            cmd.append("--allowedTools")
            cmd.extend([str(t) for t in allowed_tools])

        # Skip permissions for autonomous mode
        if self.skip_permissions:
            cmd.append("--dangerously-skip-permissions")

        extra_args = self.config.get("extra_args")
        if isinstance(extra_args, list):
            cmd.extend([str(a) for a in extra_args])

        return cmd

    def _build_prompt(self, manifest: dict, workcell_path: Path | None = None) -> str:
        prompt = super()._build_prompt(manifest, workcell_path)
        if self.ultrathink and "ultrathink" not in prompt:
            return f"ultrathink\n\n{prompt}"
        return prompt

    async def _stream_output_with_telemetry(
        self,
        process: asyncio.subprocess.Process,
        telemetry: TelemetryWriter,
        timeout_seconds: float,
    ) -> tuple[str, str]:
        """
        Stream process output while emitting telemetry events.

        Returns accumulated stdout and stderr.
        """
        stdout_lines: list[str] = []
        stderr_lines: list[str] = []

        async def read_stdout() -> None:
            """Read stdout line by line."""
            if not process.stdout:
                return
            async for line in process.stdout:
                decoded = line.decode("utf-8", errors="replace")
                stdout_lines.append(decoded)
                # Emit as response chunk (Claude CLI output is mostly LLM responses)
                telemetry.response_chunk(content=decoded.rstrip())

        async def read_stderr() -> None:
            """Read stderr line by line."""
            if not process.stderr:
                return
            async for line in process.stderr:
                decoded = line.decode("utf-8", errors="replace")
                stderr_lines.append(decoded)

        # Run both readers in parallel with timeout
        try:
            await asyncio.wait_for(
                asyncio.gather(read_stdout(), read_stderr(), process.wait()),
                timeout=timeout_seconds,
            )
        except TimeoutError:
            # Kill the process
            process.kill()
            await process.wait()
            raise

        return "".join(stdout_lines), "".join(stderr_lines)

    def _save_logs(self, logs_dir: Path, stdout: str, stderr: str) -> None:
        """Save stdout and stderr to log files."""
        if stdout:
            (logs_dir / "claude-stdout.log").write_text(stdout)
        if stderr:
            (logs_dir / "claude-stderr.log").write_text(stderr)

    def _parse_output(
        self,
        stdout: str,
        stderr: str,
        exit_code: int,
        manifest: dict,
        workcell_path: Path,
        started_at: datetime,
        completed_at: datetime,
        duration_ms: int,
    ) -> PatchProof:
        """Parse Claude output into PatchProof."""
        workcell_id = manifest.get("workcell_id", "unknown")
        issue_id = manifest.get("issue", {}).get("id", "unknown")

        # Try to extract any JSON from output
        claude_output: dict = {}
        if stdout.strip():
            for line in reversed(stdout.strip().split("\n")):
                try:
                    claude_output = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue

        # Get git patch info
        patch_info = self._get_patch_info(workcell_path, manifest)

        # Determine status
        if exit_code == 0:
            status = "success"
            confidence = claude_output.get("confidence", 0.8)
        elif exit_code == 1:
            status = "partial"
            confidence = claude_output.get("confidence", 0.5)
        else:
            status = "failed"
            confidence = claude_output.get("confidence", 0.2)

        return PatchProof(
            schema_version="1.0.0",
            workcell_id=workcell_id,
            issue_id=issue_id,
            status=status,
            patch=patch_info,
            verification={
                "gates": {},
                "all_passed": False,
                "blocking_failures": [],
            },
            metadata={
                "toolchain": self.name,
                "toolchain_version": claude_output.get("version", "unknown"),
                "model": manifest.get("toolchain_config", {}).get("model", self.default_model),
                "prompt_genome_id": (manifest.get("toolchain_config") or {}).get(
                    "prompt_genome_id"
                ),
                "sampling": (manifest.get("toolchain_config") or {}).get("sampling"),
                "started_at": started_at.isoformat().replace("+00:00", "Z"),
                "completed_at": completed_at.isoformat().replace("+00:00", "Z"),
                "duration_ms": duration_ms,
                "exit_code": exit_code,
                "tokens_used": claude_output.get("tokens_used"),
                "cost_usd": claude_output.get("cost"),
            },
            commands_executed=[
                {
                    "command": "claude",
                    "exit_code": exit_code,
                    "duration_ms": duration_ms,
                    "stdout_path": str(workcell_path / "logs" / "claude-stdout.log"),
                    "stderr_path": str(workcell_path / "logs" / "claude-stderr.log"),
                }
            ],
            confidence=confidence,
            risk_classification=self._classify_risk(patch_info),
        )

    def _get_patch_info(self, workcell_path: Path, manifest: dict) -> dict:
        """Get git patch information."""
        # Get base commit
        base_result = subprocess.run(
            ["git", "merge-base", "main", "HEAD"],
            cwd=workcell_path,
            capture_output=True,
            text=True,
        )
        base_commit = base_result.stdout.strip() if base_result.returncode == 0 else ""

        # Get HEAD commit
        head_result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=workcell_path,
            capture_output=True,
            text=True,
        )
        head_commit = head_result.stdout.strip() if head_result.returncode == 0 else ""

        # Get diff stats
        stat_result = subprocess.run(
            ["git", "diff", "--stat", "main...HEAD"],
            cwd=workcell_path,
            capture_output=True,
            text=True,
        )

        files_changed, insertions, deletions = self._parse_diff_stats(stat_result.stdout)

        # Get modified files
        files_result = subprocess.run(
            ["git", "diff", "--name-only", "main...HEAD"],
            cwd=workcell_path,
            capture_output=True,
            text=True,
        )
        files_modified = (
            [f for f in files_result.stdout.strip().split("\n") if f]
            if files_result.returncode == 0 and files_result.stdout.strip()
            else []
        )

        # Check forbidden paths
        forbidden = manifest.get("issue", {}).get("forbidden_paths", [])
        violations = self._check_forbidden_paths(files_modified, forbidden)

        return {
            "branch": manifest.get("branch_name", ""),
            "base_commit": base_commit,
            "head_commit": head_commit,
            "diff_stats": {
                "files_changed": files_changed,
                "insertions": insertions,
                "deletions": deletions,
            },
            "files_modified": files_modified,
            "forbidden_path_violations": violations,
        }

    def _parse_diff_stats(self, stat_output: str) -> tuple[int, int, int]:
        """Parse git diff --stat output."""
        import re

        if not stat_output:
            return 0, 0, 0

        lines = stat_output.strip().split("\n")
        if not lines:
            return 0, 0, 0

        summary = lines[-1]
        files_match = re.search(r"(\d+) files? changed", summary)
        ins_match = re.search(r"(\d+) insertions?", summary)
        del_match = re.search(r"(\d+) deletions?", summary)

        return (
            int(files_match.group(1)) if files_match else 0,
            int(ins_match.group(1)) if ins_match else 0,
            int(del_match.group(1)) if del_match else 0,
        )

    def _check_forbidden_paths(self, files_modified: list[str], forbidden: list[str]) -> list[str]:
        """Check for forbidden path violations."""
        violations = []
        for file in files_modified:
            for pattern in forbidden:
                if pattern.endswith("/"):
                    if file.startswith(pattern):
                        violations.append(file)
                elif pattern.endswith("*"):
                    if file.startswith(pattern[:-1]):
                        violations.append(file)
                else:
                    if file == pattern or file.startswith(pattern + "/"):
                        violations.append(file)
        return violations

    def _classify_risk(self, patch_info: dict) -> str:
        """Classify risk based on changes."""
        if patch_info.get("forbidden_path_violations"):
            return "critical"

        files = patch_info.get("files_modified", [])
        high_risk_patterns = [
            "auth",
            "security",
            "password",
            "secret",
            "key",
            "migration",
            "schema",
            "database",
            "payment",
            "billing",
        ]

        for file in files:
            file_lower = file.lower()
            if any(pattern in file_lower for pattern in high_risk_patterns):
                return "high"

        stats = patch_info.get("diff_stats", {})
        total_changes = stats.get("insertions", 0) + stats.get("deletions", 0)

        if total_changes > 500:
            return "high"
        elif total_changes > 100:
            return "medium"

        return "low"

    def _create_timeout_proof(self, manifest: dict, started_at: datetime) -> PatchProof:
        """Create a proof for timeout case."""
        completed_at = _utc_now()
        return PatchProof(
            schema_version="1.0.0",
            workcell_id=manifest.get("workcell_id", "unknown"),
            issue_id=manifest.get("issue", {}).get("id", "unknown"),
            status="timeout",
            patch={
                "branch": manifest.get("branch_name", ""),
                "base_commit": "",
                "head_commit": "",
                "diff_stats": {"files_changed": 0, "insertions": 0, "deletions": 0},
                "files_modified": [],
                "forbidden_path_violations": [],
            },
            verification={
                "gates": {},
                "all_passed": False,
                "blocking_failures": ["timeout"],
            },
            metadata={
                "toolchain": self.name,
                "started_at": started_at.isoformat().replace("+00:00", "Z"),
                "completed_at": completed_at.isoformat().replace("+00:00", "Z"),
                "error": "Execution timed out",
            },
            confidence=0,
            risk_classification="high",
        )

    def _create_error_proof(self, manifest: dict, started_at: datetime, error: str) -> PatchProof:
        """Create a proof for error case."""
        completed_at = _utc_now()
        return PatchProof(
            schema_version="1.0.0",
            workcell_id=manifest.get("workcell_id", "unknown"),
            issue_id=manifest.get("issue", {}).get("id", "unknown"),
            status="error",
            patch={
                "branch": manifest.get("branch_name", ""),
                "base_commit": "",
                "head_commit": "",
                "diff_stats": {"files_changed": 0, "insertions": 0, "deletions": 0},
                "files_modified": [],
                "forbidden_path_violations": [],
            },
            verification={
                "gates": {},
                "all_passed": False,
                "blocking_failures": ["error"],
            },
            metadata={
                "toolchain": self.name,
                "started_at": started_at.isoformat().replace("+00:00", "Z"),
                "completed_at": completed_at.isoformat().replace("+00:00", "Z"),
                "error": error,
            },
            confidence=0,
            risk_classification="high",
        )
