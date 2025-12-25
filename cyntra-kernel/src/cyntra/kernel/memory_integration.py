"""
Memory Integration Layer

Bridges MemoryHooks with the kernel lifecycle:
- Instantiates memory hooks per workcell
- Parses telemetry for tool_use observations
- Extracts gate results from verification
- Manages session lifecycle
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog

from cyntra.memory import MemoryDB, MemoryHooks
from cyntra.adapters.telemetry import read_telemetry_events

if TYPE_CHECKING:
    from cyntra.adapters.base import PatchProof
    from cyntra.state.models import Issue

logger = structlog.get_logger()

# Default memory database path
DEFAULT_MEMORY_DB_PATH = Path(".cyntra/memory/cyntra-mem.db")


class KernelMemoryBridge:
    """
    Integrates memory hooks with kernel lifecycle.

    Usage:
        bridge = KernelMemoryBridge(db_path=".cyntra/memory/cyntra-mem.db")

        # Before dispatch
        context = bridge.on_workcell_start(workcell_id, issue, manifest)
        manifest["memory_context"] = context

        # After dispatch
        bridge.on_dispatch_complete(workcell_id, workcell_path, proof)

        # After verification
        for gate, result in verification["gates"].items():
            bridge.on_gate_result(gate, result["passed"], ...)

        # At end
        bridge.on_workcell_end(workcell_id, status)
    """

    def __init__(self, db_path: Path | str | None = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_MEMORY_DB_PATH
        self.hooks = MemoryHooks(db_path=self.db_path)
        self._active_sessions: dict[str, str] = {}  # workcell_id -> session_id

    def on_workcell_start(
        self,
        workcell_id: str,
        issue: Issue,
        manifest: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Called before dispatch. Creates memory session and returns context.

        Args:
            workcell_id: Unique workcell identifier
            issue: Issue being worked on
            manifest: Task manifest

        Returns:
            Memory context dict for injection into agent prompt
        """
        domain = self._infer_domain(manifest)
        job_type = manifest.get("job_type", "code")
        toolchain = manifest.get("toolchain")

        context = self.hooks.workcell_start(
            workcell_id=workcell_id,
            issue_id=str(issue.id),
            domain=domain,
            job_type=job_type,
            toolchain=toolchain,
        )

        # Track session
        if self.hooks._session_id:
            self._active_sessions[workcell_id] = self.hooks._session_id

        logger.info(
            "Memory session started",
            workcell_id=workcell_id,
            issue_id=issue.id,
            domain=domain,
            patterns_available=len(context.get("patterns", [])),
            warnings_available=len(context.get("warnings", [])),
        )

        return context

    def on_dispatch_complete(
        self,
        workcell_id: str,
        workcell_path: Path,
        proof: PatchProof | None,
    ) -> None:
        """
        Called after adapter execution. Parses telemetry for observations.

        Args:
            workcell_id: Workcell identifier
            workcell_path: Path to workcell directory
            proof: Execution proof (may be None on failure)
        """
        if workcell_id not in self._active_sessions:
            logger.warning(
                "on_dispatch_complete called without active session",
                workcell_id=workcell_id,
            )
            return

        # Parse telemetry.jsonl for tool observations
        telemetry_path = workcell_path / "telemetry.jsonl"
        if telemetry_path.exists():
            self._ingest_telemetry(telemetry_path)

        logger.debug(
            "Dispatch telemetry processed",
            workcell_id=workcell_id,
            telemetry_exists=telemetry_path.exists(),
        )

    def on_gate_result(
        self,
        gate_name: str,
        passed: bool,
        score: float | None = None,
        fail_codes: list[str] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        """
        Called for each gate result from verifier.

        Args:
            gate_name: Name of the quality gate
            passed: Whether gate passed
            score: Optional numeric score
            fail_codes: List of failure codes
            details: Additional gate details
        """
        self.hooks.gate_result(
            gate_name=gate_name,
            passed=passed,
            score=score,
            fail_codes=fail_codes,
            details=details,
        )

    def on_workcell_end(
        self,
        workcell_id: str,
        status: str,
    ) -> dict[str, Any]:
        """
        Called at end of workcell lifecycle.

        Args:
            workcell_id: Workcell identifier
            status: Final status ("success", "failed", etc.)

        Returns:
            Session summary with patterns and observations
        """
        if workcell_id not in self._active_sessions:
            logger.warning(
                "on_workcell_end called without active session",
                workcell_id=workcell_id,
            )
            return {"success": False, "error": "No active session"}

        result = self.hooks.workcell_end(status=status)
        self._active_sessions.pop(workcell_id, None)

        logger.info(
            "Memory session ended",
            workcell_id=workcell_id,
            status=status,
            observation_count=result.get("observation_count", 0),
        )

        return result

    def _ingest_telemetry(self, telemetry_path: Path) -> None:
        """Parse telemetry.jsonl and create tool_use observations."""
        events = read_telemetry_events(telemetry_path)

        for event in events:
            event_type = event.get("type")

            try:
                if event_type == "file_write":
                    self.hooks.tool_use(
                        tool_name="Write",
                        tool_args={"path": event.get("path")},
                        result="File written",
                        file_refs=[event.get("path")] if event.get("path") else None,
                    )

                elif event_type == "file_read":
                    # Skip reads - too noisy, low value
                    pass

                elif event_type == "bash_command":
                    self.hooks.tool_use(
                        tool_name="Bash",
                        tool_args={"command": event.get("command", "")[:200]},
                        result=(
                            event.get("output", "")[:500] if "output" in event else ""
                        ),
                    )

                elif event_type == "tool_call":
                    tool = event.get("tool", "unknown")
                    args = event.get("args", {})

                    # Extract file refs from common args
                    file_refs = []
                    if "path" in args:
                        file_refs.append(args["path"])
                    elif "file_path" in args:
                        file_refs.append(args["file_path"])

                    self.hooks.tool_use(
                        tool_name=tool,
                        tool_args=args,
                        result="",  # Result comes in tool_result event
                        file_refs=file_refs if file_refs else None,
                    )

                elif event_type == "tool_result":
                    # Tool results are paired with tool_call, skip separate handling
                    pass

                elif event_type == "error":
                    # Record errors as discoveries
                    error_msg = event.get("error", "Unknown error")
                    self.hooks.add_discovery(
                        discovery=f"Error encountered: {error_msg[:200]}",
                        context=event.get("context"),
                    )

            except Exception as e:
                logger.warning(
                    "Failed to process telemetry event",
                    event_type=event_type,
                    error=str(e),
                )

    def _infer_domain(self, manifest: dict[str, Any]) -> str:
        """Infer domain from manifest job_type."""
        job_type = manifest.get("job_type", "code")

        if "fab" in job_type.lower():
            if "asset" in job_type.lower():
                return "fab_asset"
            elif "world" in job_type.lower():
                return "fab_world"
            return "fab_asset"  # default fab domain

        return "code"

    def get_context_for_prompt_injection(
        self,
        domain: str | None = None,
        max_patterns: int = 5,
        max_warnings: int = 5,
    ) -> str:
        """
        Generate markdown context block for prompt injection.

        Args:
            domain: Optional domain filter
            max_patterns: Max successful patterns to include
            max_warnings: Max warnings/anti-patterns to include

        Returns:
            Markdown string for injection into system prompt
        """
        context = self.hooks.db.get_context_for_injection(
            domain=domain,
            max_observations=50,
            max_tokens=2000,
        )

        lines = []

        # Extract patterns from summaries
        patterns = []
        warnings = []

        for summary in context.get("summaries", []):
            if summary.get("patterns"):
                try:
                    p = (
                        json.loads(summary["patterns"])
                        if isinstance(summary["patterns"], str)
                        else summary["patterns"]
                    )
                    patterns.extend(p[:3])
                except (json.JSONDecodeError, TypeError):
                    pass

            if summary.get("anti_patterns"):
                try:
                    ap = (
                        json.loads(summary["anti_patterns"])
                        if isinstance(summary["anti_patterns"], str)
                        else summary["anti_patterns"]
                    )
                    warnings.extend(ap[:3])
                except (json.JSONDecodeError, TypeError):
                    pass

        # Format as markdown
        if warnings:
            lines.append("### Avoid These Patterns")
            for w in warnings[:max_warnings]:
                lines.append(f"- {w}")
            lines.append("")

        if patterns:
            lines.append("### Successful Approaches")
            for p in patterns[:max_patterns]:
                lines.append(f"- {p}")
            lines.append("")

        if not lines:
            return ""

        return "## Learned Context\n\n" + "\n".join(lines)

    def close(self) -> None:
        """Close database connection."""
        self.hooks.close()
