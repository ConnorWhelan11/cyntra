"""
Base adapter interface for toolchain integrations.

All toolchain adapters must implement this protocol.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any


@dataclass
class CostEstimate:
    """Estimated cost for executing a task."""

    estimated_tokens: int
    estimated_cost_usd: float
    model: str


@dataclass
class PatchProof:
    """Standardized output from a workcell execution."""

    schema_version: str
    workcell_id: str
    issue_id: str
    status: str  # success, partial, failed, timeout, error
    patch: dict[str, Any]
    verification: dict[str, Any]
    metadata: dict[str, Any]
    commands_executed: list[dict[str, Any]] | None = None
    artifacts: dict[str, Any] | None = None
    confidence: float = 0.5
    risk_classification: str = "medium"
    risk_factors: list[str] | None = None
    beads_mutations: list[dict[str, Any]] | None = None
    follow_ups: list[dict[str, Any]] | None = None
    review: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "schema_version": self.schema_version,
            "workcell_id": self.workcell_id,
            "issue_id": self.issue_id,
            "status": self.status,
            "patch": self.patch,
            "verification": self.verification,
            "metadata": self.metadata,
            "commands_executed": self.commands_executed,
            "artifacts": self.artifacts,
            "confidence": self.confidence,
            "risk_classification": self.risk_classification,
            "risk_factors": self.risk_factors,
            "beads_mutations": self.beads_mutations,
            "follow_ups": self.follow_ups,
            "review": self.review,
        }


class ToolchainAdapter(ABC):
    """
    Base class for toolchain adapters.

    All adapters must implement:
    - execute: Run the task and return Patch+Proof
    - health_check: Verify adapter is operational
    - estimate_cost: Estimate tokens/cost for a task
    """

    name: str
    supports_mcp: bool = False
    supports_streaming: bool = False

    @abstractmethod
    async def execute(
        self,
        manifest: dict,
        workcell_path: Path,
        timeout: timedelta,
    ) -> PatchProof:
        """
        Execute a task in the workcell.

        Args:
            manifest: Task manifest with issue details and configuration
            workcell_path: Path to the workcell directory
            timeout: Maximum execution time

        Returns:
            PatchProof with execution results
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Verify the adapter is operational.

        Returns:
            True if the toolchain is available and working
        """
        ...

    @abstractmethod
    def estimate_cost(self, manifest: dict) -> CostEstimate:
        """
        Estimate the cost of executing a task.

        Args:
            manifest: Task manifest

        Returns:
            Cost estimate including tokens and USD
        """
        ...

    def _build_prompt(self, manifest: dict) -> str:
        """
        Build a prompt from the task manifest.

        Override in subclasses for toolchain-specific formatting.
        """
        issue = manifest.get("issue", {})
        description = issue.get("description")
        if not isinstance(description, str) or not description.strip():
            description = "No description provided."

        workcell_id = manifest.get("workcell_id", "unknown")
        issue_id = issue.get("id", "unknown")
        branch_name = manifest.get("branch_name")
        toolchain = manifest.get("toolchain")
        model = (manifest.get("toolchain_config") or {}).get("model")

        parts = [f"# Task: {issue.get('title', 'Unknown')}", ""]

        # High-signal context for the agent
        context_lines: list[str] = []
        if issue_id:
            context_lines.append(f"- Issue: {issue_id}")
        if workcell_id:
            context_lines.append(f"- Workcell: {workcell_id}")
        if branch_name:
            context_lines.append(f"- Branch: {branch_name}")
        if toolchain:
            context_lines.append(f"- Toolchain: {toolchain}")
        if model:
            context_lines.append(f"- Model: {model}")
        tags = issue.get("tags", [])
        if tags:
            context_lines.append(f"- Tags: {', '.join(str(t) for t in tags)}")

        if context_lines:
            parts.extend(["## Context", *context_lines, ""])

        parts.extend(
            [
                "## Execution Guidelines",
                "- Start by stating a short plan (3–6 bullets) before making edits.",
                "- Satisfy the acceptance criteria and keep changes minimal.",
                "- Prefer root-cause fixes; avoid unrelated refactors and drive-by formatting.",
                "- Respect forbidden paths exactly (do not modify them).",
                "- Prefer ripgrep (`rg`) for search; keep commands deterministic and repo-local.",
                "- Run the listed quality gates before finishing; if a gate can't be run, explain why and give the exact command(s) to run.",
                "- Finish with a concise summary of changes, key files touched, and any follow-up steps.",
                "",
                "## Description",
                description,
                "",
            ]
        )

        # Acceptance criteria
        criteria = issue.get("acceptance_criteria", [])
        if criteria:
            parts.append("## Acceptance Criteria")
            for criterion in criteria:
                parts.append(f"- {criterion}")
            parts.append("")

        # Forbidden paths
        forbidden = issue.get("forbidden_paths", [])
        if forbidden:
            parts.append("## ⚠️ Forbidden Paths (DO NOT MODIFY)")
            for path in forbidden:
                parts.append(f"- {path}")
            parts.append("")

        # Context files
        context = issue.get("context_files", [])
        if context:
            parts.append("## Relevant Files")
            for path in context:
                parts.append(f"- {path}")
            parts.append("")

        # Quality gates
        gates = manifest.get("quality_gates", {})
        if gates:
            parts.append("## Quality Gates (must all pass)")
            for name, gate in gates.items():
                if isinstance(gate, str):
                    parts.append(f"- {name}: `{gate}`")
                    continue
                if isinstance(gate, dict):
                    gate_type = gate.get("type")
                    gate_config_id = gate.get("gate_config_id")
                    gate_cmd = gate.get("command")
                    details: list[str] = []
                    if gate_type:
                        details.append(f"type={gate_type}")
                    if gate_config_id:
                        details.append(f"config={gate_config_id}")
                    if gate_cmd:
                        details.append(f"cmd={gate_cmd}")
                    rendered = " ".join(details) if details else str(gate)
                    parts.append(f"- {name}: {rendered}")
                    continue
                parts.append(f"- {name}: {gate!r}")
            parts.append("")

        parts.extend(
            [
                "## Completion Checklist",
                "- [ ] Acceptance criteria satisfied",
                "- [ ] Forbidden paths respected",
                "- [ ] Quality gates run (or commands provided)",
                "- [ ] Clear summary + next steps",
                "",
            ]
        )

        return "\n".join(parts)
