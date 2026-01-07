"""Live metrics collector for runtime monitoring."""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from schemas.planner_output import PlannerOutput
from schemas.executor_action import GatedAction

logger = logging.getLogger(__name__)


@dataclass
class LiveMetricsCollector:
    """Collect and aggregate runtime metrics.

    Tracks:
    - Frame rate
    - Planner latency
    - Constraint violations
    - Suppression counts
    - Stuck events
    """

    # Configuration
    window_size: int = 100  # Rolling window for averages

    # Frame metrics
    frame_times: deque = field(default_factory=lambda: deque(maxlen=100))
    total_frames: int = 0

    # Planner metrics
    planner_latencies: deque = field(default_factory=lambda: deque(maxlen=100))
    plan_ttl_expirations: int = 0
    fallback_activations: int = 0
    plans_received: int = 0
    plans_failed: int = 0

    # Action metrics
    suppressed_actions: int = 0
    suppression_by_button: dict = field(default_factory=dict)
    suppression_by_constraint: dict = field(default_factory=dict)

    # Stuck detection
    stuck_events: int = 0
    position_history: deque = field(default_factory=lambda: deque(maxlen=60))

    # Confidence tracking
    confidence_history: deque = field(default_factory=lambda: deque(maxlen=100))
    low_confidence_count: int = 0

    # Timing
    start_time: float = field(default_factory=time.time)
    last_frame_time: float = 0.0

    def record_frame(self, timestamp: float | None = None) -> None:
        """Record a frame processing event.

        Args:
            timestamp: Frame timestamp (default: now)
        """
        now = timestamp or time.time()
        self.total_frames += 1

        if self.last_frame_time > 0:
            frame_time = now - self.last_frame_time
            self.frame_times.append(frame_time)

        self.last_frame_time = now

    def record_planner_result(
        self,
        plan: PlannerOutput | None,
        latency_ms: float,
        used_fallback: bool = False,
    ) -> None:
        """Record planner result.

        Args:
            plan: Plan received (or None if failed)
            latency_ms: Planning latency
            used_fallback: Whether fallback was used
        """
        self.planner_latencies.append(latency_ms)

        if plan is not None:
            self.plans_received += 1
            self.confidence_history.append(plan.confidence)

            if plan.confidence < 0.3:
                self.low_confidence_count += 1
        else:
            self.plans_failed += 1

        if used_fallback:
            self.fallback_activations += 1

    def record_plan_expiration(self) -> None:
        """Record a plan TTL expiration."""
        self.plan_ttl_expirations += 1

    def record_action(self, action: GatedAction) -> None:
        """Record an executed action.

        Args:
            action: The gated action that was executed
        """
        if action.was_suppressed:
            self.suppressed_actions += 1

            for button in action.was_suppressed.keys():
                self.suppression_by_button[button] = (
                    self.suppression_by_button.get(button, 0) + 1
                )

            if action.source_constraint:
                self.suppression_by_constraint[action.source_constraint] = (
                    self.suppression_by_constraint.get(action.source_constraint, 0) + 1
                )

    def check_stuck(self, joystick_xy: tuple[float, float]) -> bool:
        """Check if agent appears stuck.

        Args:
            joystick_xy: Current joystick position

        Returns:
            True if stuck detected
        """
        self.position_history.append(joystick_xy)

        if len(self.position_history) < 60:
            return False

        # Check variance
        positions = np.array(list(self.position_history))
        variance = np.var(positions[:, 0]) + np.var(positions[:, 1])

        if variance < 0.01:
            self.stuck_events += 1
            return True

        return False

    def get_fps(self) -> float:
        """Get current frames per second."""
        if not self.frame_times:
            return 0.0
        avg_frame_time = np.mean(self.frame_times)
        return 1.0 / avg_frame_time if avg_frame_time > 0 else 0.0

    def get_planner_latency_stats(self) -> dict[str, float]:
        """Get planner latency statistics."""
        if not self.planner_latencies:
            return {"avg": 0, "p50": 0, "p95": 0, "p99": 0}

        latencies = list(self.planner_latencies)
        return {
            "avg": np.mean(latencies),
            "p50": np.percentile(latencies, 50),
            "p95": np.percentile(latencies, 95),
            "p99": np.percentile(latencies, 99),
        }

    def get_summary(self) -> dict[str, Any]:
        """Get summary of all metrics."""
        elapsed = time.time() - self.start_time

        return {
            "elapsed_s": elapsed,
            "performance": {
                "fps": self.get_fps(),
                "total_frames": self.total_frames,
                "frames_per_second": self.total_frames / elapsed if elapsed > 0 else 0,
            },
            "planner": {
                "plans_received": self.plans_received,
                "plans_failed": self.plans_failed,
                "success_rate": (
                    self.plans_received / (self.plans_received + self.plans_failed)
                    if (self.plans_received + self.plans_failed) > 0
                    else 0
                ),
                "latency": self.get_planner_latency_stats(),
                "ttl_expirations": self.plan_ttl_expirations,
                "fallback_activations": self.fallback_activations,
            },
            "confidence": {
                "avg": np.mean(self.confidence_history) if self.confidence_history else 0,
                "low_count": self.low_confidence_count,
            },
            "actions": {
                "suppressed_total": self.suppressed_actions,
                "suppression_rate": (
                    self.suppressed_actions / self.total_frames
                    if self.total_frames > 0
                    else 0
                ),
                "by_button": dict(self.suppression_by_button),
                "by_constraint": dict(self.suppression_by_constraint),
            },
            "stability": {
                "stuck_events": self.stuck_events,
            },
        }

    def reset(self) -> None:
        """Reset all metrics."""
        self.frame_times.clear()
        self.total_frames = 0
        self.planner_latencies.clear()
        self.plan_ttl_expirations = 0
        self.fallback_activations = 0
        self.plans_received = 0
        self.plans_failed = 0
        self.suppressed_actions = 0
        self.suppression_by_button.clear()
        self.suppression_by_constraint.clear()
        self.stuck_events = 0
        self.position_history.clear()
        self.confidence_history.clear()
        self.low_confidence_count = 0
        self.start_time = time.time()
        self.last_frame_time = 0.0
