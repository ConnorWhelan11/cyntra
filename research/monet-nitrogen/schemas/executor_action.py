"""Data structures for NitroGen executor actions."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray


# NitroGen button names in order
BUTTON_NAMES: list[str] = [
    "WEST",
    "SOUTH",
    "BACK",
    "DPAD_DOWN",
    "DPAD_LEFT",
    "DPAD_RIGHT",
    "DPAD_UP",
    "GUIDE",
    "LEFT_SHOULDER",
    "LEFT_THUMB",
    "RIGHT_THUMB",
    "RIGHT_SHOULDER",
    "START",
    "EAST",
    "NORTH",
    "LEFT_TRIGGER",
    "RIGHT_TRIGGER",
]

AXIS_NAMES: list[str] = [
    "AXIS_LEFTX",
    "AXIS_LEFTY",
    "AXIS_RIGHTX",
    "AXIS_RIGHTY",
]


@dataclass
class NitroGenAction:
    """Raw NitroGen output: action tensor for multiple timesteps.

    NitroGen outputs 16 timesteps of actions per inference.
    """

    j_left: NDArray[np.float32]  # shape (16, 2) - left joystick xy per timestep
    j_right: NDArray[np.float32]  # shape (16, 2) - right joystick xy per timestep
    buttons: NDArray[np.float32]  # shape (16, 17) - button probabilities per timestep

    def __post_init__(self) -> None:
        """Validate shapes."""
        assert self.j_left.shape == (16, 2), f"j_left shape {self.j_left.shape} != (16, 2)"
        assert self.j_right.shape == (16, 2), f"j_right shape {self.j_right.shape} != (16, 2)"
        assert self.buttons.shape == (16, 17), f"buttons shape {self.buttons.shape} != (16, 17)"

    @classmethod
    def from_dict(cls, d: dict) -> "NitroGenAction":
        """Create from NitroGen server response dict."""
        return cls(
            j_left=np.array(d["j_left"], dtype=np.float32),
            j_right=np.array(d["j_right"], dtype=np.float32),
            buttons=np.array(d["buttons"], dtype=np.float32),
        )

    def get_timestep(self, idx: int) -> "SingleTimestepAction":
        """Get action for a single timestep."""
        return SingleTimestepAction(
            j_left=self.j_left[idx],
            j_right=self.j_right[idx],
            buttons=self.buttons[idx],
        )


@dataclass
class SingleTimestepAction:
    """Action for a single timestep."""

    j_left: NDArray[np.float32]  # shape (2,)
    j_right: NDArray[np.float32]  # shape (2,)
    buttons: NDArray[np.float32]  # shape (17,)

    def to_dict(self) -> dict:
        """Convert to dict with button names."""
        return {
            "AXIS_LEFTX": float(self.j_left[0]),
            "AXIS_LEFTY": float(self.j_left[1]),
            "AXIS_RIGHTX": float(self.j_right[0]),
            "AXIS_RIGHTY": float(self.j_right[1]),
            **{name: float(self.buttons[i]) for i, name in enumerate(BUTTON_NAMES)},
        }


@dataclass
class GatedAction:
    """Post-gating action ready for gamepad execution.

    Includes information about which actions were suppressed by constraints.
    """

    # Joystick axes (-32767 to 32767)
    axis_left_x: int
    axis_left_y: int
    axis_right_x: int
    axis_right_y: int

    # Button states
    buttons: dict[str, bool] = field(default_factory=dict)

    # Trigger values (0-255)
    left_trigger: int = 0
    right_trigger: int = 0

    # Gating metadata
    was_suppressed: dict[str, bool] = field(default_factory=dict)
    source_constraint: str | None = None

    @classmethod
    def from_single_timestep(
        cls,
        action: SingleTimestepAction,
        button_threshold: float = 0.5,
    ) -> "GatedAction":
        """Create from a single timestep action with default thresholding."""
        buttons = {}
        for i, name in enumerate(BUTTON_NAMES):
            if "TRIGGER" in name:
                continue  # Handled separately
            buttons[name] = float(action.buttons[i]) > button_threshold

        return cls(
            axis_left_x=int(action.j_left[0] * 32767),
            axis_left_y=int(action.j_left[1] * 32767),
            axis_right_x=int(action.j_right[0] * 32767),
            axis_right_y=int(action.j_right[1] * 32767),
            buttons=buttons,
            left_trigger=int(action.buttons[BUTTON_NAMES.index("LEFT_TRIGGER")] * 255),
            right_trigger=int(action.buttons[BUTTON_NAMES.index("RIGHT_TRIGGER")] * 255),
        )

    def to_gamepad_dict(self) -> dict:
        """Convert to dict suitable for virtual gamepad."""
        result = {
            "AXIS_LEFTX": np.array([self.axis_left_x], dtype=np.int64),
            "AXIS_LEFTY": np.array([self.axis_left_y], dtype=np.int64),
            "AXIS_RIGHTX": np.array([self.axis_right_x], dtype=np.int64),
            "AXIS_RIGHTY": np.array([self.axis_right_y], dtype=np.int64),
            "LEFT_TRIGGER": np.array([self.left_trigger], dtype=np.int64),
            "RIGHT_TRIGGER": np.array([self.right_trigger], dtype=np.int64),
        }

        for name in BUTTON_NAMES:
            if "TRIGGER" in name:
                continue
            result[name] = 1 if self.buttons.get(name, False) else 0

        return result


@dataclass
class GamepadState:
    """Complete gamepad state for logging/replay."""

    timestamp_ms: int
    frame_id: int

    # Raw from executor
    raw_j_left: tuple[float, float]
    raw_j_right: tuple[float, float]
    raw_buttons: list[float]

    # Post-gating
    gated_action: GatedAction

    # Plan context
    plan_intent: str | None
    plan_confidence: float | None
    active_constraints: list[str]

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict for logging."""
        return {
            "timestamp_ms": self.timestamp_ms,
            "frame_id": self.frame_id,
            "raw": {
                "j_left": list(self.raw_j_left),
                "j_right": list(self.raw_j_right),
                "buttons": self.raw_buttons,
            },
            "gated": {
                "axes": {
                    "left_x": self.gated_action.axis_left_x,
                    "left_y": self.gated_action.axis_left_y,
                    "right_x": self.gated_action.axis_right_x,
                    "right_y": self.gated_action.axis_right_y,
                },
                "buttons": self.gated_action.buttons,
                "triggers": {
                    "left": self.gated_action.left_trigger,
                    "right": self.gated_action.right_trigger,
                },
                "suppressed": self.gated_action.was_suppressed,
                "constraint_source": self.gated_action.source_constraint,
            },
            "plan": {
                "intent": self.plan_intent,
                "confidence": self.plan_confidence,
                "active_constraints": self.active_constraints,
            },
        }
