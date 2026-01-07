"""Tests for gating layer."""

import pytest
import time
import numpy as np

from schemas.planner_output import (
    PlannerOutput,
    Target,
    Constraint,
    SkillMode,
    ConstraintType,
    ActionType,
)
from schemas.executor_action import NitroGenAction, GatedAction
from gating.constraint_engine import ConstraintEngine
from gating.action_filter import ActionFilter
from gating.safety_clamp import SafetyClamp, SafetyConfig


class TestConstraintEngine:
    """Tests for constraint engine."""

    def test_update_constraints(self):
        """Test updating constraints from plan."""
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
                    reason="Friendly fire",
                ),
                Constraint(
                    type=ConstraintType.PREFER,
                    action=ActionType.DODGE,
                    priority=0.8,
                    reason="Incoming attack",
                ),
            ],
            skill=SkillMode(mode="defensive", aggression=0.3, stealth=0.0),
            confidence=0.9,
        )

        engine.update(plan)

        assert len(engine.get_active()) == 2
        assert engine.total_updates == 1

    def test_should_suppress_action(self):
        """Test suppression check."""
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
                    reason="Friendly fire",
                ),
            ],
            skill=SkillMode(mode="defensive", aggression=0.3, stealth=0.0),
            confidence=0.9,
        )

        engine.update(plan)

        should_suppress, reason = engine.should_suppress_action(ActionType.SHOOT)
        assert should_suppress is True
        assert reason == "Friendly fire"

        should_suppress, reason = engine.should_suppress_action(ActionType.JUMP)
        assert should_suppress is False
        assert reason is None

    def test_constraint_expiration(self):
        """Test that constraints expire."""
        engine = ConstraintEngine()

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[
                Constraint(
                    type=ConstraintType.DO_NOT,
                    action=ActionType.SHOOT,
                    until_s=0.01,  # Expires in 10ms
                    priority=1.0,
                    reason="Brief pause",
                ),
            ],
            skill=SkillMode(mode="defensive", aggression=0.3, stealth=0.0),
            confidence=0.9,
        )

        engine.update(plan)

        # Should be active initially
        assert len(engine.get_active()) == 1

        # Wait for expiration
        time.sleep(0.02)

        # Should be expired now
        assert len(engine.get_active()) == 0


class TestActionFilter:
    """Tests for action filter."""

    def test_filter_suppresses_buttons(self):
        """Test that filter suppresses buttons based on constraints."""
        action_filter = ActionFilter()

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[
                Constraint(
                    type=ConstraintType.DO_NOT,
                    action=ActionType.SHOOT,
                    priority=1.0,
                    reason="No shooting",
                ),
            ],
            skill=SkillMode(mode="defensive", aggression=0.3, stealth=0.0),
            confidence=0.9,
        )

        # Create raw actions with shoot button pressed
        buttons = np.zeros((16, 17), dtype=np.float32)
        buttons[:, 16] = 0.9  # RIGHT_TRIGGER (shoot)

        raw_actions = NitroGenAction(
            j_left=np.zeros((16, 2), dtype=np.float32),
            j_right=np.zeros((16, 2), dtype=np.float32),
            buttons=buttons,
        )

        gated = action_filter.apply(raw_actions, plan)

        # Check that shoot was suppressed
        assert any(
            "RIGHT_TRIGGER" in action.was_suppressed
            for action in gated
        )

    def test_always_suppress_menu_buttons(self):
        """Test that menu buttons are always suppressed."""
        action_filter = ActionFilter(suppress_menu_buttons=True)

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[],
            skill=SkillMode(mode="balanced", aggression=0.5, stealth=0.0),
            confidence=0.9,
        )

        # Create raw actions with START button pressed
        buttons = np.zeros((16, 17), dtype=np.float32)
        buttons[:, 12] = 0.9  # START

        raw_actions = NitroGenAction(
            j_left=np.zeros((16, 2), dtype=np.float32),
            j_right=np.zeros((16, 2), dtype=np.float32),
            buttons=buttons,
        )

        gated = action_filter.apply(raw_actions, plan)

        # START should be suppressed
        assert all(not action.buttons.get("START", False) for action in gated)


class TestSafetyClamp:
    """Tests for safety clamp."""

    def test_plan_validity(self):
        """Test plan validity checking."""
        config = SafetyConfig(plan_ttl_ms=100)  # 100ms TTL
        clamp = SafetyClamp(config)

        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[],
            skill=SkillMode(mode="balanced", aggression=0.5, stealth=0.0),
            confidence=0.9,
        )

        clamp.update_plan(plan)

        # Plan should be valid initially
        effective = clamp.get_effective_plan()
        assert effective.intent == "test"
        assert not clamp.using_fallback

        # Wait for expiration
        time.sleep(0.15)

        # Should now use fallback
        effective = clamp.get_effective_plan()
        assert effective.intent == "fallback_safe_mode"
        assert clamp.using_fallback
        assert clamp.fallback_activations == 1

    def test_stuck_detection(self):
        """Test stuck state detection."""
        config = SafetyConfig(
            stuck_detection_frames=10,
            stuck_variance_threshold=0.01,
        )
        clamp = SafetyClamp(config)

        # Feed identical positions
        for _ in range(10):
            is_stuck = clamp.check_stuck((0.5, 0.5))

        # Should detect stuck
        assert is_stuck is True
        assert clamp.stuck_recoveries == 1

    def test_action_clamping(self):
        """Test that actions are clamped to valid range."""
        clamp = SafetyClamp()

        action = GatedAction(
            axis_left_x=50000,  # Out of range
            axis_left_y=-50000,
            axis_right_x=0,
            axis_right_y=0,
            buttons={},
        )

        clamped = clamp.apply_safety(action)

        assert clamped.axis_left_x == 32767
        assert clamped.axis_left_y == -32767
