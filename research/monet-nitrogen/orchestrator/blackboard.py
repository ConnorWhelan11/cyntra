"""Shared blackboard state for orchestrator."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from schemas.planner_output import PlannerOutput, SAFE_FALLBACK_PLAN
from schemas.executor_action import GatedAction, GamepadState
from capture.frame_buffer import FrameBuffer

logger = logging.getLogger(__name__)


@dataclass
class ExecutorStatus:
    """Status of the executor."""

    last_action_time: float = 0.0
    last_action: GatedAction | None = None
    actions_executed: int = 0
    using_fallback: bool = False


@dataclass
class PlannerStatus:
    """Status of the planner."""

    last_plan_time: float = 0.0
    last_plan: PlannerOutput | None = None
    plans_received: int = 0
    plans_failed: int = 0


class Blackboard:
    """Shared state between all components.

    The blackboard is the central communication hub for:
    - Latest frame and frame buffer
    - Current plan and plan history
    - Executor status and actions
    - Logging buffer for SFT data
    """

    def __init__(
        self,
        plan_ttl_ms: int = 2000,
        log_buffer_size: int = 1000,
        log_dir: Path | str | None = None,
    ) -> None:
        """Initialize blackboard.

        Args:
            plan_ttl_ms: How long a plan remains valid
            log_buffer_size: Size of in-memory log buffer
            log_dir: Directory for log files
        """
        self.plan_ttl_ms = plan_ttl_ms
        self.log_buffer_size = log_buffer_size
        self.log_dir = Path(log_dir) if log_dir else None

        # Frame state
        self.frame_buffer = FrameBuffer(max_frames=120)
        self.latest_frame: np.ndarray | None = None
        self.latest_frame_id: int = 0

        # Plan state
        self.latest_plan: PlannerOutput | None = None
        self.plan_timestamp_ms: int = 0
        self.plan_history: list[PlannerOutput] = []

        # Status
        self.executor_status = ExecutorStatus()
        self.planner_status = PlannerStatus()

        # Logging
        self.log_buffer: list[dict[str, Any]] = []
        self._log_file_handle = None

        # Metrics
        self.start_time = time.time()
        self.total_frames_processed = 0

    def update_frame(self, frame: np.ndarray) -> int:
        """Update with a new frame.

        Args:
            frame: New frame as numpy array

        Returns:
            Frame ID
        """
        self.latest_frame = frame
        self.latest_frame_id = self.frame_buffer.add(frame)
        self.total_frames_processed += 1
        return self.latest_frame_id

    def update_plan(self, plan: PlannerOutput) -> None:
        """Update with a new plan from planner.

        Args:
            plan: New plan
        """
        self.latest_plan = plan
        self.plan_timestamp_ms = int(time.time() * 1000)
        self.plan_history.append(plan)

        # Keep history limited
        if len(self.plan_history) > 100:
            self.plan_history = self.plan_history[-100:]

        self.planner_status.last_plan_time = time.time()
        self.planner_status.last_plan = plan
        self.planner_status.plans_received += 1

        logger.debug(f"Plan updated: {plan.intent} (confidence: {plan.confidence:.2f})")

    def record_plan_failure(self) -> None:
        """Record a planner failure."""
        self.planner_status.plans_failed += 1

    def update_executor_action(self, action: GatedAction) -> None:
        """Update with an executed action.

        Args:
            action: Action that was executed
        """
        self.executor_status.last_action_time = time.time()
        self.executor_status.last_action = action
        self.executor_status.actions_executed += 1

    def is_plan_valid(self) -> bool:
        """Check if current plan is still valid.

        Returns:
            True if plan is within TTL
        """
        if self.latest_plan is None:
            return False

        age_ms = int(time.time() * 1000) - self.plan_timestamp_ms
        return age_ms < self.plan_ttl_ms

    def get_effective_plan(self) -> PlannerOutput:
        """Get the current effective plan.

        Returns:
            Current plan if valid, otherwise fallback
        """
        if self.is_plan_valid() and self.latest_plan is not None:
            self.executor_status.using_fallback = False
            return self.latest_plan
        else:
            self.executor_status.using_fallback = True
            return SAFE_FALLBACK_PLAN

    def get_plan_confidence_decay(self) -> float:
        """Get confidence adjusted for plan age.

        Returns:
            Decayed confidence value
        """
        if self.latest_plan is None:
            return 0.0

        age_ms = int(time.time() * 1000) - self.plan_timestamp_ms
        decay = max(0, 1.0 - (age_ms / self.plan_ttl_ms))
        return self.latest_plan.confidence * decay

    def log_action(
        self,
        frame_id: int,
        plan: PlannerOutput | None,
        raw_action: dict[str, Any],
        gated_action: GatedAction,
    ) -> None:
        """Log an action for SFT dataset.

        Args:
            frame_id: ID of the frame
            plan: Plan that was active (or None)
            raw_action: Raw action from executor
            gated_action: Final gated action
        """
        entry = {
            "timestamp_ms": int(time.time() * 1000),
            "frame_id": frame_id,
            "plan": plan.model_dump() if plan else None,
            "raw_action": raw_action,
            "gated_action": {
                "axes": {
                    "left_x": gated_action.axis_left_x,
                    "left_y": gated_action.axis_left_y,
                    "right_x": gated_action.axis_right_x,
                    "right_y": gated_action.axis_right_y,
                },
                "buttons": gated_action.buttons,
                "triggers": {
                    "left": gated_action.left_trigger,
                    "right": gated_action.right_trigger,
                },
                "suppressed": gated_action.was_suppressed,
                "constraint_source": gated_action.source_constraint,
            },
        }

        self.log_buffer.append(entry)

        # Flush if buffer is full
        if len(self.log_buffer) >= self.log_buffer_size:
            self.flush_logs()

    def flush_logs(self) -> None:
        """Flush log buffer to disk."""
        if not self.log_buffer:
            return

        if self.log_dir is None:
            # Just clear buffer if no log dir
            self.log_buffer.clear()
            return

        self.log_dir.mkdir(parents=True, exist_ok=True)

        # Write to JSONL file
        log_file = self.log_dir / f"session_{int(self.start_time)}.jsonl"

        try:
            with open(log_file, "a") as f:
                for entry in self.log_buffer:
                    f.write(json.dumps(entry) + "\n")

            logger.debug(f"Flushed {len(self.log_buffer)} log entries to {log_file}")
            self.log_buffer.clear()

        except Exception as e:
            logger.error(f"Failed to flush logs: {e}")

    def get_stats(self) -> dict[str, Any]:
        """Get blackboard statistics.

        Returns:
            Stats dict
        """
        elapsed = time.time() - self.start_time

        return {
            "elapsed_s": elapsed,
            "total_frames": self.total_frames_processed,
            "fps": self.total_frames_processed / elapsed if elapsed > 0 else 0,
            "frame_buffer": self.frame_buffer.get_stats(),
            "plan": {
                "valid": self.is_plan_valid(),
                "age_ms": (
                    int(time.time() * 1000) - self.plan_timestamp_ms
                    if self.latest_plan
                    else -1
                ),
                "confidence": self.latest_plan.confidence if self.latest_plan else 0,
                "decayed_confidence": self.get_plan_confidence_decay(),
                "history_size": len(self.plan_history),
            },
            "planner": {
                "plans_received": self.planner_status.plans_received,
                "plans_failed": self.planner_status.plans_failed,
            },
            "executor": {
                "actions_executed": self.executor_status.actions_executed,
                "using_fallback": self.executor_status.using_fallback,
            },
            "log_buffer_size": len(self.log_buffer),
        }

    def close(self) -> None:
        """Clean up resources."""
        self.flush_logs()
