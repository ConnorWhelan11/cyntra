"""Failure detection for runtime monitoring."""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from schemas.planner_output import PlannerOutput

logger = logging.getLogger(__name__)


class FailureType(str, Enum):
    """Types of failures that can be detected."""

    INVALID_JSON = "invalid_json"
    PLANNER_TIMEOUT = "planner_timeout"
    CONFLICTING_CONSTRAINTS = "conflicting_constraints"
    AGENT_STUCK = "agent_stuck"
    EXECUTOR_DOWN = "executor_down"
    FRAME_CAPTURE_FAILED = "frame_capture_failed"
    PLAN_DRIFT = "plan_drift"
    CONSTRAINT_OVERFLOW = "constraint_overflow"
    LOW_CONFIDENCE_CASCADE = "low_confidence_cascade"
    REPETITIVE_ACTION = "repetitive_action"


@dataclass
class FailureEvent:
    """A detected failure event."""

    type: FailureType
    timestamp: float
    message: str
    details: dict[str, Any] = field(default_factory=dict)


class FailureDetector:
    """Detect and track failure conditions.

    Monitors for the top 10 failure modes:
    1. Invalid JSON from Monet
    2. Planner timeout
    3. Conflicting constraints
    4. Agent stuck
    5. NitroGen server down
    6. Frame capture failure
    7. Plan drift
    8. Constraint overflow
    9. Low confidence cascade
    10. Repetitive action patterns (reward hacking)
    """

    def __init__(
        self,
        drift_window: int = 10,
        confidence_window: int = 5,
        repetition_window: int = 30,
    ) -> None:
        """Initialize failure detector.

        Args:
            drift_window: Window for plan drift detection
            confidence_window: Window for low confidence cascade
            repetition_window: Window for repetitive action detection
        """
        self.drift_window = drift_window
        self.confidence_window = confidence_window
        self.repetition_window = repetition_window

        # Tracking state
        self.intent_history: deque[str] = deque(maxlen=drift_window)
        self.confidence_history: deque[float] = deque(maxlen=confidence_window)
        self.action_history: deque[str] = deque(maxlen=repetition_window)

        # Counters
        self.json_errors = 0
        self.timeouts = 0
        self.stuck_count = 0
        self.frame_failures = 0
        self.executor_failures = 0

        # Event log
        self.events: list[FailureEvent] = []
        self.max_events = 1000

    def check_plan(
        self,
        plan: PlannerOutput | None,
        latency_ms: float,
        json_parse_success: bool = True,
    ) -> list[FailureType]:
        """Check plan for failures.

        Args:
            plan: Plan received (or None)
            latency_ms: Planning latency
            json_parse_success: Whether JSON parsing succeeded

        Returns:
            List of detected failure types
        """
        failures: list[FailureType] = []

        # 1. Invalid JSON
        if not json_parse_success:
            self.json_errors += 1
            failures.append(FailureType.INVALID_JSON)
            self._log_event(FailureType.INVALID_JSON, "Failed to parse JSON from planner")

        # 2. Planner timeout
        if latency_ms > 1500:
            self.timeouts += 1
            failures.append(FailureType.PLANNER_TIMEOUT)
            self._log_event(
                FailureType.PLANNER_TIMEOUT,
                f"Planner took {latency_ms:.0f}ms",
                {"latency_ms": latency_ms},
            )

        if plan is None:
            return failures

        # 3. Conflicting constraints (already handled by validator, but detect here too)
        # This would need the raw data to detect

        # 7. Plan drift
        self.intent_history.append(plan.intent)
        if len(self.intent_history) == self.drift_window:
            unique_intents = len(set(self.intent_history))
            if unique_intents > self.drift_window * 0.5:
                failures.append(FailureType.PLAN_DRIFT)
                self._log_event(
                    FailureType.PLAN_DRIFT,
                    f"Plan intent changed {unique_intents} times in {self.drift_window} plans",
                    {"unique_intents": unique_intents},
                )

        # 8. Constraint overflow
        if len(plan.constraints) > 5:
            failures.append(FailureType.CONSTRAINT_OVERFLOW)
            self._log_event(
                FailureType.CONSTRAINT_OVERFLOW,
                f"Plan has {len(plan.constraints)} constraints (max 5)",
                {"constraint_count": len(plan.constraints)},
            )

        # 9. Low confidence cascade
        self.confidence_history.append(plan.confidence)
        if len(self.confidence_history) == self.confidence_window:
            if all(c < 0.3 for c in self.confidence_history):
                failures.append(FailureType.LOW_CONFIDENCE_CASCADE)
                self._log_event(
                    FailureType.LOW_CONFIDENCE_CASCADE,
                    f"Last {self.confidence_window} plans had confidence < 0.3",
                    {"confidences": list(self.confidence_history)},
                )

        return failures

    def check_action(self, action_signature: str) -> list[FailureType]:
        """Check action for repetitive patterns.

        Args:
            action_signature: String signature of the action

        Returns:
            List of detected failures
        """
        failures: list[FailureType] = []

        self.action_history.append(action_signature)

        # 10. Repetitive action (possible reward hacking)
        if len(self.action_history) >= self.repetition_window:
            unique_actions = len(set(self.action_history))
            if unique_actions < 3:  # Very repetitive
                failures.append(FailureType.REPETITIVE_ACTION)
                self._log_event(
                    FailureType.REPETITIVE_ACTION,
                    f"Only {unique_actions} unique actions in last {self.repetition_window}",
                    {"unique_actions": unique_actions},
                )

        return failures

    def check_stuck(self, is_stuck: bool) -> list[FailureType]:
        """Check for stuck state.

        Args:
            is_stuck: Whether stuck was detected

        Returns:
            List of detected failures
        """
        failures: list[FailureType] = []

        if is_stuck:
            self.stuck_count += 1
            failures.append(FailureType.AGENT_STUCK)
            self._log_event(
                FailureType.AGENT_STUCK,
                f"Agent stuck (count: {self.stuck_count})",
            )

        return failures

    def check_frame_capture(self, success: bool) -> list[FailureType]:
        """Check frame capture result.

        Args:
            success: Whether capture succeeded

        Returns:
            List of detected failures
        """
        failures: list[FailureType] = []

        if not success:
            self.frame_failures += 1
            failures.append(FailureType.FRAME_CAPTURE_FAILED)
            self._log_event(
                FailureType.FRAME_CAPTURE_FAILED,
                f"Frame capture failed (count: {self.frame_failures})",
            )

        return failures

    def check_executor(self, success: bool) -> list[FailureType]:
        """Check executor result.

        Args:
            success: Whether executor succeeded

        Returns:
            List of detected failures
        """
        failures: list[FailureType] = []

        if not success:
            self.executor_failures += 1
            failures.append(FailureType.EXECUTOR_DOWN)
            self._log_event(
                FailureType.EXECUTOR_DOWN,
                f"Executor failed (count: {self.executor_failures})",
            )

        return failures

    def _log_event(
        self,
        failure_type: FailureType,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Log a failure event.

        Args:
            failure_type: Type of failure
            message: Description
            details: Additional details
        """
        event = FailureEvent(
            type=failure_type,
            timestamp=time.time(),
            message=message,
            details=details or {},
        )
        self.events.append(event)

        # Trim events
        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events:]

        logger.warning(f"Failure detected: {failure_type.value} - {message}")

    def get_recent_events(self, count: int = 10) -> list[FailureEvent]:
        """Get most recent failure events.

        Args:
            count: Number of events to return

        Returns:
            List of recent events
        """
        return self.events[-count:]

    def get_failure_counts(self) -> dict[str, int]:
        """Get counts of each failure type.

        Returns:
            Dict mapping failure type to count
        """
        counts: dict[str, int] = {}
        for event in self.events:
            counts[event.type.value] = counts.get(event.type.value, 0) + 1
        return counts

    def get_summary(self) -> dict[str, Any]:
        """Get failure detection summary."""
        return {
            "total_events": len(self.events),
            "counts": self.get_failure_counts(),
            "counters": {
                "json_errors": self.json_errors,
                "timeouts": self.timeouts,
                "stuck_count": self.stuck_count,
                "frame_failures": self.frame_failures,
                "executor_failures": self.executor_failures,
            },
        }

    def reset(self) -> None:
        """Reset all state."""
        self.intent_history.clear()
        self.confidence_history.clear()
        self.action_history.clear()
        self.json_errors = 0
        self.timeouts = 0
        self.stuck_count = 0
        self.frame_failures = 0
        self.executor_failures = 0
        self.events.clear()
