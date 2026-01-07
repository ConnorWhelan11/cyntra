"""Safety clamp for fallback behavior when planner is unavailable."""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from schemas.planner_output import PlannerOutput, SAFE_FALLBACK_PLAN
from schemas.executor_action import GatedAction, BUTTON_NAMES

logger = logging.getLogger(__name__)


@dataclass
class SafetyConfig:
    """Configuration for safety clamp behavior."""

    # Plan validity
    plan_ttl_ms: int = 2000  # How long a plan remains valid
    min_confidence: float = 0.3  # Plans below this confidence use fallback

    # Stuck detection
    stuck_detection_frames: int = 60  # Frames to detect stuck state
    stuck_variance_threshold: float = 0.01  # Position variance threshold
    stuck_recovery_duration_ms: int = 500  # Duration of recovery burst

    # Fallback behavior
    fallback_suppress_shoot: bool = True
    fallback_suppress_menu: bool = True
    fallback_mode: str = "defensive"  # aggressive, defensive, stealth, balanced

    # Exploration noise
    exploration_noise_probability: float = 0.05  # Chance to add random input
    exploration_noise_magnitude: float = 0.3  # Magnitude of noise


class SafetyClamp:
    """Safety layer that handles edge cases and failures.

    Responsibilities:
    1. Detect when plan is stale and apply fallback
    2. Detect stuck states and trigger recovery
    3. Add exploration noise to prevent repetitive behavior
    4. Clamp actions to safe ranges
    """

    def __init__(self, config: SafetyConfig | None = None) -> None:
        """Initialize safety clamp.

        Args:
            config: Safety configuration
        """
        self.config = config or SafetyConfig()

        # Plan tracking
        self.last_plan_time_ms: int = 0
        self.last_plan: PlannerOutput | None = None
        self.using_fallback: bool = False

        # Stuck detection
        self.position_history: list[tuple[float, float]] = []
        self.stuck_detected: bool = False
        self.stuck_recovery_start_ms: int | None = None

        # Stats
        self.fallback_activations: int = 0
        self.stuck_recoveries: int = 0
        self.exploration_bursts: int = 0

    def update_plan(self, plan: PlannerOutput) -> None:
        """Update with a new valid plan.

        Args:
            plan: New plan from planner
        """
        self.last_plan = plan
        self.last_plan_time_ms = int(time.time() * 1000)
        self.using_fallback = False

    def get_effective_plan(self) -> PlannerOutput:
        """Get the current effective plan (real or fallback).

        Returns:
            Plan to use for constraints
        """
        now_ms = int(time.time() * 1000)

        # Check if plan is stale
        if self.last_plan is None:
            self.using_fallback = True
            return SAFE_FALLBACK_PLAN

        age_ms = now_ms - self.last_plan_time_ms
        if age_ms > self.config.plan_ttl_ms:
            if not self.using_fallback:
                self.fallback_activations += 1
                logger.warning(f"Plan expired after {age_ms}ms, using fallback")
            self.using_fallback = True
            return SAFE_FALLBACK_PLAN

        # Check confidence
        if self.last_plan.confidence < self.config.min_confidence:
            if not self.using_fallback:
                self.fallback_activations += 1
                logger.warning(
                    f"Plan confidence {self.last_plan.confidence:.2f} "
                    f"below threshold {self.config.min_confidence}"
                )
            self.using_fallback = True
            return SAFE_FALLBACK_PLAN

        self.using_fallback = False
        return self.last_plan

    def check_stuck(self, joystick_xy: tuple[float, float]) -> bool:
        """Check if agent is stuck based on joystick output history.

        Args:
            joystick_xy: Current joystick position

        Returns:
            True if stuck state detected
        """
        self.position_history.append(joystick_xy)

        # Keep only recent history
        max_history = self.config.stuck_detection_frames
        if len(self.position_history) > max_history:
            self.position_history = self.position_history[-max_history:]

        # Need enough history to detect
        if len(self.position_history) < max_history:
            return False

        # Calculate variance
        positions = np.array(self.position_history)
        variance = np.var(positions[:, 0]) + np.var(positions[:, 1])

        if variance < self.config.stuck_variance_threshold:
            if not self.stuck_detected:
                self.stuck_detected = True
                self.stuck_recovery_start_ms = int(time.time() * 1000)
                self.stuck_recoveries += 1
                logger.warning(f"Stuck detected! Variance: {variance:.6f}")
            return True

        self.stuck_detected = False
        return False

    def apply_safety(self, action: GatedAction) -> GatedAction:
        """Apply safety modifications to an action.

        Args:
            action: Input gated action

        Returns:
            Safety-modified action
        """
        now_ms = int(time.time() * 1000)

        # Check for stuck recovery
        if self.stuck_detected and self.stuck_recovery_start_ms is not None:
            recovery_elapsed = now_ms - self.stuck_recovery_start_ms

            if recovery_elapsed < self.config.stuck_recovery_duration_ms:
                # Apply recovery burst - random movement
                action = self._apply_recovery_burst(action)
            else:
                # Recovery period ended
                self.stuck_detected = False
                self.stuck_recovery_start_ms = None
                self.position_history.clear()

        # Maybe add exploration noise
        if random.random() < self.config.exploration_noise_probability:
            action = self._apply_exploration_noise(action)
            self.exploration_bursts += 1

        # Clamp to valid ranges
        action = self._clamp_action(action)

        return action

    def _apply_recovery_burst(self, action: GatedAction) -> GatedAction:
        """Apply recovery burst to escape stuck state.

        Args:
            action: Input action

        Returns:
            Modified action with recovery movement
        """
        # Random movement direction
        angle = random.random() * 2 * 3.14159
        magnitude = 0.8

        # Override joystick
        action.axis_left_x = int(np.cos(angle) * magnitude * 32767)
        action.axis_left_y = int(np.sin(angle) * magnitude * 32767)

        # Maybe press dodge/jump
        if random.random() < 0.3:
            action.buttons["EAST"] = True  # Common dodge
        if random.random() < 0.2:
            action.buttons["SOUTH"] = True  # Common jump

        return action

    def _apply_exploration_noise(self, action: GatedAction) -> GatedAction:
        """Add exploration noise to action.

        Args:
            action: Input action

        Returns:
            Action with added noise
        """
        mag = self.config.exploration_noise_magnitude

        # Add noise to joysticks
        noise_x = int((random.random() - 0.5) * 2 * mag * 32767)
        noise_y = int((random.random() - 0.5) * 2 * mag * 32767)

        action.axis_left_x = max(-32767, min(32767, action.axis_left_x + noise_x))
        action.axis_left_y = max(-32767, min(32767, action.axis_left_y + noise_y))

        return action

    def _clamp_action(self, action: GatedAction) -> GatedAction:
        """Clamp action values to valid ranges.

        Args:
            action: Input action

        Returns:
            Clamped action
        """
        action.axis_left_x = max(-32767, min(32767, action.axis_left_x))
        action.axis_left_y = max(-32767, min(32767, action.axis_left_y))
        action.axis_right_x = max(-32767, min(32767, action.axis_right_x))
        action.axis_right_y = max(-32767, min(32767, action.axis_right_y))
        action.left_trigger = max(0, min(255, action.left_trigger))
        action.right_trigger = max(0, min(255, action.right_trigger))

        return action

    def get_plan_age_ms(self) -> int:
        """Get age of current plan in milliseconds."""
        if self.last_plan_time_ms == 0:
            return -1
        return int(time.time() * 1000) - self.last_plan_time_ms

    def get_stats(self) -> dict[str, Any]:
        """Get safety clamp statistics."""
        return {
            "using_fallback": self.using_fallback,
            "plan_age_ms": self.get_plan_age_ms(),
            "stuck_detected": self.stuck_detected,
            "fallback_activations": self.fallback_activations,
            "stuck_recoveries": self.stuck_recoveries,
            "exploration_bursts": self.exploration_bursts,
        }
