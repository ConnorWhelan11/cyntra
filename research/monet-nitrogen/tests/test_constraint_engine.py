"""Additional tests for constraint engine."""

import pytest
import time

from schemas.planner_output import (
    PlannerOutput,
    Target,
    Constraint,
    SkillMode,
    ConstraintType,
    ActionType,
)
from gating.constraint_engine import ConstraintEngine, ActiveConstraint


class TestActiveConstraint:
    """Tests for ActiveConstraint."""

    def test_is_expired(self):
        """Test expiration check."""
        now = time.time()

        # Non-expiring constraint
        c1 = ActiveConstraint(
            constraint=Constraint(
                type=ConstraintType.DO_NOT,
                action=ActionType.SHOOT,
                priority=1.0,
                reason="test",
            ),
            activated_at=now,
            expires_at=None,
            source_plan_confidence=0.9,
        )
        assert c1.is_expired(now + 100) is False

        # Expiring constraint
        c2 = ActiveConstraint(
            constraint=Constraint(
                type=ConstraintType.DO_NOT,
                action=ActionType.SHOOT,
                until_s=1.0,
                priority=1.0,
                reason="test",
            ),
            activated_at=now,
            expires_at=now + 1.0,
            source_plan_confidence=0.9,
        )
        assert c2.is_expired(now) is False
        assert c2.is_expired(now + 2.0) is True

    def test_effective_priority(self):
        """Test effective priority calculation."""
        now = time.time()

        c = ActiveConstraint(
            constraint=Constraint(
                type=ConstraintType.DO_NOT,
                action=ActionType.SHOOT,
                until_s=2.0,
                priority=1.0,
                reason="test",
            ),
            activated_at=now,
            expires_at=now + 2.0,
            source_plan_confidence=0.8,
        )

        # At activation, effective priority = 1.0 * 0.8 = 0.8
        initial = c.get_effective_priority(now)
        assert 0.7 < initial <= 0.8

        # At halfway, should be lower due to decay
        halfway = c.get_effective_priority(now + 1.0)
        assert halfway < initial


class TestConstraintEngineAdvanced:
    """Advanced tests for constraint engine."""

    def test_get_required_actions(self):
        """Test getting required DO actions."""
        engine = ConstraintEngine()

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[
                Constraint(
                    type=ConstraintType.DO,
                    action=ActionType.DODGE,
                    priority=0.9,
                    reason="Incoming attack",
                ),
                Constraint(
                    type=ConstraintType.DO,
                    action=ActionType.CROUCH,
                    priority=0.7,
                    reason="Take cover",
                ),
                Constraint(
                    type=ConstraintType.DO_NOT,
                    action=ActionType.SHOOT,
                    priority=1.0,
                    reason="Friendly fire",
                ),
            ],
            skill=SkillMode(mode="defensive", aggression=0.3, stealth=0.0),
            confidence=0.9,
        )

        engine.update(plan)

        required = engine.get_required_actions()

        # Should have 2 DO actions, sorted by priority
        assert len(required) == 2
        assert required[0][0] == ActionType.DODGE  # Higher priority first
        assert required[1][0] == ActionType.CROUCH

    def test_skill_mode_retrieval(self):
        """Test skill mode retrieval."""
        engine = ConstraintEngine()

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[],
            skill=SkillMode(mode="stealth", aggression=0.2, stealth=0.8),
            confidence=0.9,
        )

        engine.update(plan)

        mode, aggression, stealth = engine.get_skill_mode()

        assert mode == "stealth"
        assert aggression == 0.2
        assert stealth == 0.8

    def test_zone_constraint(self):
        """Test AVOID_ZONE constraint checking."""
        engine = ConstraintEngine()

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[
                Constraint(
                    type=ConstraintType.AVOID_ZONE,
                    priority=0.9,
                    reason="Danger zone",
                    zone_xy=(0.3, 0.3),
                    zone_radius=0.1,
                ),
            ],
            skill=SkillMode(mode="balanced", aggression=0.5, stealth=0.0),
            confidence=0.9,
        )

        engine.update(plan)

        # Inside zone
        in_zone, reason = engine.check_zone_constraint((0.3, 0.3))
        assert in_zone is True
        assert reason == "Danger zone"

        # Outside zone
        out_zone, reason = engine.check_zone_constraint((0.8, 0.8))
        assert out_zone is False
        assert reason is None

    def test_target_focus(self):
        """Test FOCUS_TARGET constraint."""
        engine = ConstraintEngine()

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="Focus on enemy",
            target=Target(type="enemy", ref="boss", screen_xy=(0.7, 0.4)),
            constraints=[
                Constraint(
                    type=ConstraintType.FOCUS_TARGET,
                    priority=0.9,
                    reason="Priority target",
                ),
            ],
            skill=SkillMode(mode="aggressive", aggression=0.8, stealth=0.0),
            confidence=0.9,
        )

        engine.update(plan)

        target_xy = engine.get_target_focus()
        assert target_xy is not None
        assert target_xy == (0.7, 0.4)

    def test_clear_constraints(self):
        """Test clearing all constraints."""
        engine = ConstraintEngine()

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[
                Constraint(
                    type=ConstraintType.DO_NOT,
                    action=ActionType.SHOOT,
                    priority=1.0,
                    reason="test",
                ),
            ],
            skill=SkillMode(mode="balanced", aggression=0.5, stealth=0.0),
            confidence=0.9,
        )

        engine.update(plan)
        assert len(engine.get_active()) == 1

        engine.clear()
        assert len(engine.get_active()) == 0
        assert engine.current_plan is None
