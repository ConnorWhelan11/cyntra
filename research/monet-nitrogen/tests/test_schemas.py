"""Tests for schemas."""

import pytest
import numpy as np

from schemas.planner_output import (
    PlannerOutput,
    Target,
    Constraint,
    SkillMode,
    ConstraintType,
    ActionType,
    SAFE_FALLBACK_PLAN,
)
from schemas.executor_action import (
    NitroGenAction,
    SingleTimestepAction,
    GatedAction,
    BUTTON_NAMES,
)


class TestPlannerOutput:
    """Tests for PlannerOutput schema."""

    def test_valid_plan(self):
        """Test creating a valid plan."""
        plan = PlannerOutput(
            timestamp_ms=1234567890,
            intent="Attack enemy ahead",
            target=Target(
                type="enemy",
                ref="soldier_001",
                screen_xy=(0.6, 0.4),
            ),
            constraints=[
                Constraint(
                    type=ConstraintType.DO,
                    action=ActionType.SHOOT,
                    priority=0.9,
                    reason="Enemy in sight",
                )
            ],
            skill=SkillMode(mode="aggressive", aggression=0.8, stealth=0.1),
            confidence=0.85,
        )

        assert plan.intent == "Attack enemy ahead"
        assert plan.target.type == "enemy"
        assert len(plan.constraints) == 1
        assert plan.skill.mode == "aggressive"

    def test_screen_xy_from_list(self):
        """Test that screen_xy can be provided as list."""
        target = Target(
            type="enemy",
            ref="test",
            screen_xy=[0.5, 0.5],  # List instead of tuple
        )
        assert target.screen_xy == (0.5, 0.5)

    def test_screen_xy_clamping(self):
        """Test that out-of-range screen_xy is clamped."""
        target = Target(
            type="enemy",
            ref="test",
            screen_xy=(1.5, -0.5),  # Out of range
        )
        assert 0 <= target.screen_xy[0] <= 1
        assert 0 <= target.screen_xy[1] <= 1

    def test_conflicting_constraints_resolved(self):
        """Test that conflicting DO/DO_NOT constraints are resolved."""
        plan = PlannerOutput(
            timestamp_ms=0,
            intent="test",
            target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
            constraints=[
                Constraint(
                    type=ConstraintType.DO,
                    action=ActionType.SHOOT,
                    priority=0.9,
                    reason="Shoot!",
                ),
                Constraint(
                    type=ConstraintType.DO_NOT,
                    action=ActionType.SHOOT,
                    priority=0.5,
                    reason="Don't shoot",
                ),
            ],
            skill=SkillMode(mode="balanced", aggression=0.5, stealth=0.0),
            confidence=0.5,
        )

        # Should resolve conflict by keeping higher priority
        assert len(plan.constraints) == 1
        assert plan.constraints[0].type == ConstraintType.DO

    def test_safe_fallback_plan(self):
        """Test the safe fallback plan."""
        assert SAFE_FALLBACK_PLAN.confidence == 0.3
        assert SAFE_FALLBACK_PLAN.skill.mode == "defensive"
        assert any(
            c.type == ConstraintType.DO_NOT and c.action == ActionType.SHOOT
            for c in SAFE_FALLBACK_PLAN.constraints
        )


class TestExecutorAction:
    """Tests for executor action schemas."""

    def test_nitrogen_action_from_arrays(self):
        """Test creating NitroGenAction from numpy arrays."""
        action = NitroGenAction(
            j_left=np.zeros((16, 2), dtype=np.float32),
            j_right=np.zeros((16, 2), dtype=np.float32),
            buttons=np.zeros((16, 17), dtype=np.float32),
        )

        assert action.j_left.shape == (16, 2)
        assert action.j_right.shape == (16, 2)
        assert action.buttons.shape == (16, 17)

    def test_nitrogen_action_invalid_shape(self):
        """Test that invalid shapes raise assertion."""
        with pytest.raises(AssertionError):
            NitroGenAction(
                j_left=np.zeros((8, 2), dtype=np.float32),  # Wrong shape
                j_right=np.zeros((16, 2), dtype=np.float32),
                buttons=np.zeros((16, 17), dtype=np.float32),
            )

    def test_get_timestep(self):
        """Test getting a single timestep."""
        j_left = np.random.randn(16, 2).astype(np.float32)
        j_right = np.random.randn(16, 2).astype(np.float32)
        buttons = np.random.rand(16, 17).astype(np.float32)

        action = NitroGenAction(j_left=j_left, j_right=j_right, buttons=buttons)
        single = action.get_timestep(5)

        assert isinstance(single, SingleTimestepAction)
        np.testing.assert_array_equal(single.j_left, j_left[5])
        np.testing.assert_array_equal(single.j_right, j_right[5])
        np.testing.assert_array_equal(single.buttons, buttons[5])

    def test_gated_action_from_single(self):
        """Test creating GatedAction from SingleTimestepAction."""
        single = SingleTimestepAction(
            j_left=np.array([0.5, -0.3], dtype=np.float32),
            j_right=np.array([0.1, 0.2], dtype=np.float32),
            buttons=np.array([0.9, 0.1, 0.0] + [0.0] * 14, dtype=np.float32),
        )

        gated = GatedAction.from_single_timestep(single, button_threshold=0.5)

        assert gated.axis_left_x == int(0.5 * 32767)
        assert gated.axis_left_y == int(-0.3 * 32767)
        assert gated.buttons.get("WEST", False) is True  # 0.9 > 0.5
        assert gated.buttons.get("SOUTH", False) is False  # 0.1 < 0.5

    def test_gated_action_to_gamepad_dict(self):
        """Test converting GatedAction to gamepad dict."""
        gated = GatedAction(
            axis_left_x=16000,
            axis_left_y=-8000,
            axis_right_x=0,
            axis_right_y=0,
            buttons={"SOUTH": True, "EAST": False},
            left_trigger=128,
            right_trigger=0,
        )

        d = gated.to_gamepad_dict()

        assert d["AXIS_LEFTX"][0] == 16000
        assert d["AXIS_LEFTY"][0] == -8000
        assert d["LEFT_TRIGGER"][0] == 128
        assert d["SOUTH"] == 1
        assert d["EAST"] == 0
