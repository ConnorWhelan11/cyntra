"""
Sleeptime Orchestrator - Coordinates background consolidation.

Manages the sleeptime lifecycle:
1. Tracks completion counts and idle time
2. Triggers consolidation when thresholds met
3. Runs skill pipeline: ingest -> distill -> write
4. Updates shared memory blocks

Can run in-process or spawn a background agent.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cyntra.sleeptime.config import SleeptimeConfig

logger = logging.getLogger(__name__)


@dataclass
class SleeptimeState:
    """Persistent state for sleeptime agent."""

    last_run_timestamp: str = ""
    completions_since_last_run: int = 0
    consecutive_failures: int = 0
    total_consolidations: int = 0
    last_patterns_count: int = 0
    last_traps_count: int = 0

    @classmethod
    def load(cls, path: Path) -> SleeptimeState:
        """Load state from file."""
        if not path.exists():
            return cls()
        try:
            data = json.loads(path.read_text())
            return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
        except Exception:
            return cls()

    def save(self, path: Path) -> None:
        """Persist state to file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "last_run_timestamp": self.last_run_timestamp,
                    "completions_since_last_run": self.completions_since_last_run,
                    "consecutive_failures": self.consecutive_failures,
                    "total_consolidations": self.total_consolidations,
                    "last_patterns_count": self.last_patterns_count,
                    "last_traps_count": self.last_traps_count,
                },
                indent=2,
            )
        )


@dataclass
class ConsolidationResult:
    """Result of a consolidation run."""

    success: bool
    runs_processed: int = 0
    patterns_found: int = 0
    anti_patterns_found: int = 0
    traps_found: int = 0
    blocks_updated: list[str] = field(default_factory=list)
    duration_ms: int = 0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "runs_processed": self.runs_processed,
            "patterns_found": self.patterns_found,
            "anti_patterns_found": self.anti_patterns_found,
            "traps_found": self.traps_found,
            "blocks_updated": self.blocks_updated,
            "duration_ms": self.duration_ms,
            "error": self.error,
        }


class SleeptimeOrchestrator:
    """
    Orchestrates background consolidation.

    Usage:
        orchestrator = SleeptimeOrchestrator(config, repo_root)

        # Call after each workcell completes
        orchestrator.on_workcell_complete(success=True)

        # Or check manually
        if orchestrator.should_trigger():
            result = orchestrator.consolidate()
    """

    def __init__(
        self,
        config: SleeptimeConfig,
        repo_root: Path,
    ):
        self.config = config
        self.repo_root = Path(repo_root).resolve()

        # Resolve paths
        self.learned_context_dir = self.repo_root / config.learned_context_dir
        self.sleeptime_state_dir = self.repo_root / config.sleeptime_state_dir
        self.runs_dir = self.repo_root / config.runs_dir
        self.rollouts_dir = self.repo_root / config.rollouts_dir

        # Load state
        self.state_path = self.sleeptime_state_dir / "state.json"
        self.state = SleeptimeState.load(self.state_path)

        # Track idle time
        self._last_activity = time.monotonic()

    def on_workcell_complete(self, success: bool) -> ConsolidationResult | None:
        """
        Called after each workcell completes.

        Returns consolidation result if triggered, None otherwise.
        """
        self._last_activity = time.monotonic()
        self.state.completions_since_last_run += 1

        if success:
            self.state.consecutive_failures = 0
        else:
            self.state.consecutive_failures += 1

        self.state.save(self.state_path)

        if self.should_trigger():
            return self.consolidate()

        return None

    def should_trigger(self) -> bool:
        """Check if consolidation should run."""
        if not self.config.enabled:
            return False

        triggers = self.config.triggers

        # Completion count trigger
        if self.state.completions_since_last_run >= triggers.on_workcell_complete:
            logger.debug(f"Sleeptime trigger: {self.state.completions_since_last_run} completions")
            return True

        # Failure streak trigger
        if self.state.consecutive_failures >= triggers.on_failure_streak:
            logger.debug(f"Sleeptime trigger: {self.state.consecutive_failures} failures")
            return True

        # Idle time trigger
        idle_seconds = time.monotonic() - self._last_activity
        if idle_seconds >= triggers.on_idle_seconds:
            logger.debug(f"Sleeptime trigger: {idle_seconds:.0f}s idle")
            return True

        return False

    def consolidate(self) -> ConsolidationResult:
        """
        Run the full consolidation pipeline.

        1. Ingest recent runs
        2. Distill patterns
        3. Detect traps
        4. Update memory blocks
        """
        start_time = time.monotonic()
        logger.info("Starting sleeptime consolidation")

        try:
            # Import skills (lazy to avoid circular imports)
            import sys

            skills_path = self.repo_root / "skills" / "sleeptime"
            if str(skills_path) not in sys.path:
                sys.path.insert(0, str(skills_path))

            from history_ingester import HistoryIngester
            from memory_block_writer import MemoryBlockWriter
            from pattern_distiller import PatternDistiller
            from trap_detector import TrapDetector

            # 1. Ingest history
            ingester = HistoryIngester(
                runs_dir=self.runs_dir,
                watermark_path=self.sleeptime_state_dir / "ingester_watermark.json",
            )
            ingest_result = ingester.ingest(max_runs=self.config.max_runs_per_batch)
            runs_processed = len(ingest_result.get("run_summaries", []))

            if runs_processed < self.config.min_runs_for_patterns:
                logger.info(f"Only {runs_processed} runs, skipping pattern extraction")
                self._update_state_after_consolidation(runs_processed, 0, 0)
                return ConsolidationResult(
                    success=True,
                    runs_processed=runs_processed,
                    duration_ms=int((time.monotonic() - start_time) * 1000),
                )

            # 2. Distill patterns
            distiller = PatternDistiller(min_frequency=self.config.pattern_min_frequency)
            patterns_result = distiller.distill(ingest_result["run_summaries"])
            patterns = patterns_result.get("patterns", [])
            anti_patterns = patterns_result.get("anti_patterns", [])

            # 3. Detect traps
            detector = TrapDetector(
                dynamics_db_path=self.repo_root / ".cyntra/dynamics/transitions.db",
            )
            traps_result = detector.detect()
            traps = traps_result.get("traps", [])

            # 4. Update memory blocks
            writer = MemoryBlockWriter(
                blocks_dir=self.learned_context_dir,
                history_dir=self.learned_context_dir / ".history",
                max_block_size=self.config.blocks.max_size,
            )

            blocks_updated = []

            # Write successful patterns
            if patterns:
                successful = [p for p in patterns if p.get("confidence", 0) > 0.7]
                if successful:
                    writer.write(
                        block_name="successful_patterns",
                        new_content={
                            "section": "Recommended Tool Chains",
                            "entries": successful[:10],
                        },
                    )
                    blocks_updated.append("successful_patterns")

            # Write failure modes
            if anti_patterns:
                writer.write(
                    block_name="failure_modes",
                    new_content={
                        "section": "Common Failures",
                        "entries": anti_patterns[:10],
                    },
                )
                blocks_updated.append("failure_modes")

            # Write trap signatures
            if traps:
                writer.write(
                    block_name="trap_signatures",
                    new_content={
                        "section": "Confirmed Traps",
                        "entries": traps[:10],
                    },
                )
                blocks_updated.append("trap_signatures")

            # Update state
            self._update_state_after_consolidation(
                runs_processed,
                len(patterns),
                len(traps),
            )

            duration_ms = int((time.monotonic() - start_time) * 1000)
            logger.info(
                f"Sleeptime consolidation complete: "
                f"{runs_processed} runs, {len(patterns)} patterns, "
                f"{len(traps)} traps, {duration_ms}ms"
            )

            result = ConsolidationResult(
                success=True,
                runs_processed=runs_processed,
                patterns_found=len(patterns),
                anti_patterns_found=len(anti_patterns),
                traps_found=len(traps),
                blocks_updated=blocks_updated,
                duration_ms=duration_ms,
            )

            # Update dynamics report to influence exploration controller
            self.update_dynamics_report(result)

            return result

        except Exception as e:
            logger.exception("Sleeptime consolidation failed")
            return ConsolidationResult(
                success=False,
                duration_ms=int((time.monotonic() - start_time) * 1000),
                error=str(e),
            )

    def _update_state_after_consolidation(
        self,
        runs_processed: int,
        patterns_count: int,
        traps_count: int,
    ) -> None:
        """Update state after successful consolidation."""
        self.state.last_run_timestamp = datetime.now(UTC).isoformat()
        self.state.completions_since_last_run = 0
        self.state.consecutive_failures = 0
        self.state.total_consolidations += 1
        self.state.last_patterns_count = patterns_count
        self.state.last_traps_count = traps_count
        self.state.save(self.state_path)

    def get_learned_context(self, block_names: list[str] | None = None) -> dict[str, str]:
        """
        Read learned context blocks for injection into agent prompts.

        Returns dict mapping block name to content.
        """
        if block_names is None:
            block_names = self.config.blocks.blocks

        context = {}
        for name in block_names:
            path = self.learned_context_dir / f"{name}.md"
            if path.exists():
                context[name] = path.read_text()

        return context

    def inject_context_prompt(self, base_prompt: str) -> str:
        """
        Inject learned context into an agent's system prompt.

        Appends relevant learned context sections.
        """
        context = self.get_learned_context(["failure_modes", "successful_patterns"])

        if not context:
            return base_prompt

        additions = ["\n\n## Learned Context\n"]

        if "failure_modes" in context:
            additions.append("### Common Failure Modes\n")
            # Extract just the key points, not full block
            lines = context["failure_modes"].split("\n")
            for line in lines:
                if line.startswith("- **"):
                    additions.append(line + "\n")
                    if len(additions) > 15:  # Limit injection size
                        break

        if "successful_patterns" in context:
            additions.append("\n### Successful Patterns\n")
            lines = context["successful_patterns"].split("\n")
            for line in lines:
                if line.startswith("- **"):
                    additions.append(line + "\n")
                    if len(additions) > 25:
                        break

        return base_prompt + "".join(additions)

    def update_dynamics_report(self, result: ConsolidationResult) -> None:
        """
        Update the dynamics report with sleeptime findings.

        This influences the ExplorationController's decisions.
        """
        if not result.success:
            return

        dynamics_dir = self.repo_root / ".cyntra" / "dynamics"
        dynamics_dir.mkdir(parents=True, exist_ok=True)
        report_path = dynamics_dir / "dynamics_report.json"

        # Load existing report or create new
        existing: dict[str, Any] = {}
        if report_path.exists():
            try:
                existing = json.loads(report_path.read_text())
            except (json.JSONDecodeError, OSError):
                existing = {}

        # Calculate action rate adjustment based on traps found
        # More traps = lower action rate = more exploration needed
        action_summary = existing.get("action_summary", {})

        if result.traps_found > 0:
            # Decrease global action rate to trigger more exploration
            current_rate = action_summary.get("global_action_rate", 0.5)
            adjustment = min(0.1, result.traps_found * 0.02)
            action_summary["global_action_rate"] = max(0.1, current_rate - adjustment)
            action_summary["trap_adjustment"] = -adjustment
            action_summary["last_trap_count"] = result.traps_found
        elif result.patterns_found > 5:
            # More patterns = system is learning well, can exploit more
            current_rate = action_summary.get("global_action_rate", 0.5)
            adjustment = min(0.05, result.patterns_found * 0.005)
            action_summary["global_action_rate"] = min(0.9, current_rate + adjustment)
            action_summary["pattern_adjustment"] = adjustment
            action_summary["last_pattern_count"] = result.patterns_found

        # Update domain-specific rates if we have them
        by_domain = action_summary.get("by_domain", {})

        # Check for domain-specific traps in learned context
        trap_blocks_path = self.learned_context_dir / "trap_signatures.md"
        if trap_blocks_path.exists():
            trap_content = trap_blocks_path.read_text()
            # Rough domain detection from trap content
            if "fab" in trap_content.lower() or "asset" in trap_content.lower():
                by_domain["fab_asset"] = max(0.2, by_domain.get("fab_asset", 0.5) - 0.1)
            if "code" in trap_content.lower() or "test" in trap_content.lower():
                by_domain["code"] = max(0.2, by_domain.get("code", 0.5) - 0.05)

        action_summary["by_domain"] = by_domain
        existing["action_summary"] = action_summary

        # Add sleeptime metadata
        existing["sleeptime"] = {
            "last_consolidation": self.state.last_run_timestamp,
            "total_consolidations": self.state.total_consolidations,
            "patterns_found": result.patterns_found,
            "traps_found": result.traps_found,
            "blocks_updated": result.blocks_updated,
        }

        # Write updated report
        report_path.write_text(json.dumps(existing, indent=2))
        logger.info(
            "Updated dynamics report from sleeptime",
            action_rate=action_summary.get("global_action_rate"),
            traps=result.traps_found,
            patterns=result.patterns_found,
        )
