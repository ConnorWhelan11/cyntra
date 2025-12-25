"""
Sleeptime Configuration - Settings for background consolidation agent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal


@dataclass
class SleeptimeTriggers:
    """When to trigger sleeptime consolidation."""

    on_workcell_complete: int = 5  # Every N completions
    on_idle_seconds: int = 300  # After N seconds idle
    on_failure_streak: int = 3  # After N consecutive failures
    on_schedule: str | None = None  # Cron-like schedule (optional)


@dataclass
class SleeptimeAgent:
    """Which agent to use for sleeptime processing."""

    toolchain: str = "claude"  # Which adapter
    model: str = "haiku"  # Fast/cheap for background work
    timeout_seconds: int = 120  # Quick timeout for background tasks
    max_tokens: int = 4000  # Limited output for summaries


@dataclass
class SleeptimeBlocks:
    """Memory block configuration."""

    max_size: int = 8000  # Characters per block
    history_versions: int = 10  # Versions to keep
    blocks: list[str] = field(default_factory=lambda: [
        "failure_modes",
        "successful_patterns",
        "exploration_hints",
        "trap_signatures",
        "genome_patches",
    ])


@dataclass
class SleeptimeConfig:
    """Main sleeptime configuration."""

    enabled: bool = True
    triggers: SleeptimeTriggers = field(default_factory=SleeptimeTriggers)
    agent: SleeptimeAgent = field(default_factory=SleeptimeAgent)
    blocks: SleeptimeBlocks = field(default_factory=SleeptimeBlocks)

    # Paths (relative to repo root)
    learned_context_dir: Path = field(default_factory=lambda: Path(".cyntra/learned_context"))
    sleeptime_state_dir: Path = field(default_factory=lambda: Path(".cyntra/sleeptime"))
    runs_dir: Path = field(default_factory=lambda: Path(".cyntra/runs"))
    rollouts_dir: Path = field(default_factory=lambda: Path(".cyntra/rollouts"))

    # Processing limits
    max_runs_per_batch: int = 20
    min_runs_for_patterns: int = 5
    pattern_min_frequency: int = 2

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SleeptimeConfig:
        """Create config from dictionary."""
        if not data:
            return cls()

        triggers_data = data.get("triggers", {})
        agent_data = data.get("agent", {})
        blocks_data = data.get("blocks", {})

        return cls(
            enabled=data.get("enabled", True),
            triggers=SleeptimeTriggers(
                on_workcell_complete=triggers_data.get("on_workcell_complete", 5),
                on_idle_seconds=triggers_data.get("on_idle_seconds", 300),
                on_failure_streak=triggers_data.get("on_failure_streak", 3),
                on_schedule=triggers_data.get("on_schedule"),
            ),
            agent=SleeptimeAgent(
                toolchain=agent_data.get("toolchain", "claude"),
                model=agent_data.get("model", "haiku"),
                timeout_seconds=agent_data.get("timeout_seconds", 120),
                max_tokens=agent_data.get("max_tokens", 4000),
            ),
            blocks=SleeptimeBlocks(
                max_size=blocks_data.get("max_size", 8000),
                history_versions=blocks_data.get("history_versions", 10),
                blocks=blocks_data.get("blocks", [
                    "failure_modes",
                    "successful_patterns",
                    "exploration_hints",
                    "trap_signatures",
                    "genome_patches",
                ]),
            ),
            learned_context_dir=Path(data.get("learned_context_dir", ".cyntra/learned_context")),
            sleeptime_state_dir=Path(data.get("sleeptime_state_dir", ".cyntra/sleeptime")),
            runs_dir=Path(data.get("runs_dir", ".cyntra/runs")),
            rollouts_dir=Path(data.get("rollouts_dir", ".cyntra/rollouts")),
            max_runs_per_batch=data.get("max_runs_per_batch", 20),
            min_runs_for_patterns=data.get("min_runs_for_patterns", 5),
            pattern_min_frequency=data.get("pattern_min_frequency", 2),
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "enabled": self.enabled,
            "triggers": {
                "on_workcell_complete": self.triggers.on_workcell_complete,
                "on_idle_seconds": self.triggers.on_idle_seconds,
                "on_failure_streak": self.triggers.on_failure_streak,
                "on_schedule": self.triggers.on_schedule,
            },
            "agent": {
                "toolchain": self.agent.toolchain,
                "model": self.agent.model,
                "timeout_seconds": self.agent.timeout_seconds,
                "max_tokens": self.agent.max_tokens,
            },
            "blocks": {
                "max_size": self.blocks.max_size,
                "history_versions": self.blocks.history_versions,
                "blocks": self.blocks.blocks,
            },
            "learned_context_dir": str(self.learned_context_dir),
            "sleeptime_state_dir": str(self.sleeptime_state_dir),
            "runs_dir": str(self.runs_dir),
            "rollouts_dir": str(self.rollouts_dir),
            "max_runs_per_batch": self.max_runs_per_batch,
            "min_runs_for_patterns": self.min_runs_for_patterns,
            "pattern_min_frequency": self.pattern_min_frequency,
        }
