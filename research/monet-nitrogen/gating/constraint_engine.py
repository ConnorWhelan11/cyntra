"""Constraint engine for managing active constraints from planner."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from schemas.planner_output import (
    PlannerOutput,
    Constraint,
    ConstraintType,
    ActionType,
)

logger = logging.getLogger(__name__)


@dataclass
class ActiveConstraint:
    """A constraint that is currently active."""

    constraint: Constraint
    activated_at: float  # timestamp when constraint was activated
    expires_at: float | None  # timestamp when constraint expires (None = never)
    source_plan_confidence: float  # confidence of the plan that created this

    def is_expired(self, current_time: float) -> bool:
        """Check if constraint has expired."""
        if self.expires_at is None:
            return False
        return current_time > self.expires_at

    def get_effective_priority(self, current_time: float) -> float:
        """Get priority adjusted for age and plan confidence.

        Priority decays over time and is weighted by plan confidence.
        """
        base_priority = self.constraint.priority

        # Weight by plan confidence
        weighted = base_priority * self.source_plan_confidence

        # Optional: decay over time
        if self.expires_at is not None:
            age = current_time - self.activated_at
            total_duration = self.expires_at - self.activated_at
            if total_duration > 0:
                remaining_fraction = max(0, 1 - (age / total_duration))
                weighted *= (0.5 + 0.5 * remaining_fraction)  # Decay to 50% at expiry

        return weighted


class ConstraintEngine:
    """Manages active constraints and evaluates actions against them.

    The engine:
    1. Receives plans from the Monet planner
    2. Tracks active constraints with expiration
    3. Provides methods to check if actions should be suppressed
    """

    def __init__(self) -> None:
        """Initialize constraint engine."""
        self.active_constraints: list[ActiveConstraint] = []
        self.plan_timestamp: float = 0.0
        self.current_plan: PlannerOutput | None = None

        # Stats
        self.total_updates = 0
        self.total_suppressions = 0

    def update(self, plan: PlannerOutput) -> None:
        """Update active constraints from a new plan.

        Args:
            plan: New plan from Monet planner
        """
        now = time.time()
        self.plan_timestamp = now
        self.current_plan = plan
        self.total_updates += 1

        # Clear old constraints and add new ones
        self.active_constraints = []

        for c in plan.constraints:
            expires = now + c.until_s if c.until_s else None
            active = ActiveConstraint(
                constraint=c,
                activated_at=now,
                expires_at=expires,
                source_plan_confidence=plan.confidence,
            )
            self.active_constraints.append(active)

        # Sort by priority (highest first)
        self.active_constraints.sort(
            key=lambda x: x.get_effective_priority(now), reverse=True
        )

        logger.debug(
            f"Updated constraints: {len(self.active_constraints)} active "
            f"(plan confidence: {plan.confidence:.2f})"
        )

    def get_active(self) -> list[Constraint]:
        """Get list of non-expired constraints.

        Returns:
            List of active Constraint objects
        """
        now = time.time()
        return [
            ac.constraint
            for ac in self.active_constraints
            if not ac.is_expired(now)
        ]

    def should_suppress_action(
        self, action_type: ActionType
    ) -> tuple[bool, str | None]:
        """Check if an action should be suppressed.

        Args:
            action_type: The action type to check

        Returns:
            Tuple of (should_suppress, reason or None)
        """
        now = time.time()

        for ac in self.active_constraints:
            if ac.is_expired(now):
                continue

            c = ac.constraint
            if c.type == ConstraintType.DO_NOT and c.action == action_type:
                self.total_suppressions += 1
                return True, c.reason

        return False, None

    def should_prefer_action(
        self, action_type: ActionType
    ) -> tuple[bool, float, str | None]:
        """Check if an action should be preferred/boosted.

        Args:
            action_type: The action type to check

        Returns:
            Tuple of (should_prefer, boost_amount, reason or None)
        """
        now = time.time()

        for ac in self.active_constraints:
            if ac.is_expired(now):
                continue

            c = ac.constraint
            if c.type in (ConstraintType.DO, ConstraintType.PREFER) and c.action == action_type:
                boost = ac.get_effective_priority(now)
                return True, boost, c.reason

        return False, 0.0, None

    def get_required_actions(self) -> list[tuple[ActionType, float, str]]:
        """Get list of actions that should be actively performed.

        Returns:
            List of (action_type, priority, reason) tuples
        """
        now = time.time()
        required = []

        for ac in self.active_constraints:
            if ac.is_expired(now):
                continue

            c = ac.constraint
            if c.type == ConstraintType.DO and c.action is not None:
                priority = ac.get_effective_priority(now)
                required.append((c.action, priority, c.reason))

        return sorted(required, key=lambda x: x[1], reverse=True)

    def check_zone_constraint(
        self, screen_xy: tuple[float, float]
    ) -> tuple[bool, str | None]:
        """Check if position violates an AVOID_ZONE constraint.

        Args:
            screen_xy: Normalized screen position (0-1, 0-1)

        Returns:
            Tuple of (is_in_avoid_zone, reason or None)
        """
        now = time.time()
        x, y = screen_xy

        for ac in self.active_constraints:
            if ac.is_expired(now):
                continue

            c = ac.constraint
            if c.type == ConstraintType.AVOID_ZONE and c.zone_xy and c.zone_radius:
                zx, zy = c.zone_xy
                distance = ((x - zx) ** 2 + (y - zy) ** 2) ** 0.5
                if distance < c.zone_radius:
                    return True, c.reason

        return False, None

    def get_target_focus(self) -> tuple[float, float] | None:
        """Get the target position if FOCUS_TARGET constraint is active.

        Returns:
            Target screen_xy or None
        """
        if self.current_plan and self.current_plan.target.type != "none":
            # Check for FOCUS_TARGET constraint
            now = time.time()
            for ac in self.active_constraints:
                if ac.is_expired(now):
                    continue
                if ac.constraint.type == ConstraintType.FOCUS_TARGET:
                    return self.current_plan.target.screen_xy

        return None

    def get_skill_mode(self) -> tuple[str, float, float]:
        """Get current skill mode from plan.

        Returns:
            Tuple of (mode, aggression, stealth)
        """
        if self.current_plan:
            skill = self.current_plan.skill
            return skill.mode, skill.aggression, skill.stealth
        return "balanced", 0.5, 0.0

    def get_stats(self) -> dict[str, Any]:
        """Get engine statistics."""
        return {
            "total_updates": self.total_updates,
            "total_suppressions": self.total_suppressions,
            "active_constraints": len(self.get_active()),
            "current_plan_intent": (
                self.current_plan.intent if self.current_plan else None
            ),
            "current_plan_confidence": (
                self.current_plan.confidence if self.current_plan else None
            ),
        }

    def clear(self) -> None:
        """Clear all constraints."""
        self.active_constraints = []
        self.current_plan = None
        self.plan_timestamp = 0.0
