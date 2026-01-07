"""Decode NitroGen actions to gamepad format."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

from schemas.executor_action import (
    NitroGenAction,
    SingleTimestepAction,
    GatedAction,
    BUTTON_NAMES,
)

logger = logging.getLogger(__name__)


class ActionDecoder:
    """Decode NitroGen tensor outputs to gamepad-ready actions.

    Handles:
    - Thresholding button probabilities to binary
    - Converting joystick floats to integer ranges
    - Applying game-specific button mappings
    """

    def __init__(
        self,
        button_threshold: float = 0.5,
        game_profile_path: Path | str | None = None,
    ) -> None:
        """Initialize action decoder.

        Args:
            button_threshold: Threshold for button press (0-1)
            game_profile_path: Path to game-specific profile YAML
        """
        self.button_threshold = button_threshold
        self.game_profile: dict[str, Any] = {}

        if game_profile_path:
            self._load_profile(Path(game_profile_path))

    def _load_profile(self, path: Path) -> None:
        """Load game profile from YAML."""
        if path.exists():
            with open(path) as f:
                self.game_profile = yaml.safe_load(f)
            logger.info(f"Loaded game profile: {self.game_profile.get('name', 'unknown')}")
        else:
            logger.warning(f"Game profile not found: {path}")

    def decode_single(self, action: SingleTimestepAction) -> GatedAction:
        """Decode a single timestep action.

        Args:
            action: SingleTimestepAction from NitroGen

        Returns:
            GatedAction ready for gamepad
        """
        # Convert joysticks to integer range
        axis_left_x = int(action.j_left[0] * 32767)
        axis_left_y = int(action.j_left[1] * 32767)
        axis_right_x = int(action.j_right[0] * 32767)
        axis_right_y = int(action.j_right[1] * 32767)

        # Clamp to valid range
        axis_left_x = max(-32767, min(32767, axis_left_x))
        axis_left_y = max(-32767, min(32767, axis_left_y))
        axis_right_x = max(-32767, min(32767, axis_right_x))
        axis_right_y = max(-32767, min(32767, axis_right_y))

        # Decode buttons
        buttons = {}
        for i, name in enumerate(BUTTON_NAMES):
            if "TRIGGER" in name:
                continue  # Triggers handled separately
            buttons[name] = action.buttons[i] > self.button_threshold

        # Decode triggers (0-255 range)
        left_trigger_idx = BUTTON_NAMES.index("LEFT_TRIGGER")
        right_trigger_idx = BUTTON_NAMES.index("RIGHT_TRIGGER")
        left_trigger = int(action.buttons[left_trigger_idx] * 255)
        right_trigger = int(action.buttons[right_trigger_idx] * 255)

        return GatedAction(
            axis_left_x=axis_left_x,
            axis_left_y=axis_left_y,
            axis_right_x=axis_right_x,
            axis_right_y=axis_right_y,
            buttons=buttons,
            left_trigger=max(0, min(255, left_trigger)),
            right_trigger=max(0, min(255, right_trigger)),
        )

    def decode_batch(self, action: NitroGenAction) -> list[GatedAction]:
        """Decode all timesteps from a NitroGen prediction.

        Args:
            action: NitroGenAction with 16 timesteps

        Returns:
            List of 16 GatedActions
        """
        return [self.decode_single(action.get_timestep(i)) for i in range(16)]

    def get_button_mapping(self) -> dict[str, list[str]]:
        """Get the abstract action to button mapping.

        Returns:
            Dict mapping action names to button names
        """
        if "button_mapping" in self.game_profile:
            return self.game_profile["button_mapping"]

        # Default mapping
        return {
            "SHOOT": ["RIGHT_TRIGGER", "EAST"],
            "JUMP": ["SOUTH"],
            "DODGE": ["EAST", "LEFT_SHOULDER"],
            "INTERACT": ["WEST", "NORTH"],
            "USE_ABILITY": ["RIGHT_SHOULDER", "LEFT_SHOULDER"],
            "SPRINT": ["LEFT_THUMB"],
            "CROUCH": ["RIGHT_THUMB", "DPAD_DOWN"],
        }

    def get_always_suppress(self) -> list[str]:
        """Get buttons that should always be suppressed.

        Returns:
            List of button names to always suppress
        """
        if "always_suppress" in self.game_profile:
            return self.game_profile["always_suppress"]

        return ["GUIDE", "START", "BACK"]


def apply_deadzone(value: float, deadzone: float = 0.1) -> float:
    """Apply deadzone to joystick value.

    Args:
        value: Joystick value (-1 to 1)
        deadzone: Deadzone threshold (0 to 1)

    Returns:
        Value with deadzone applied
    """
    if abs(value) < deadzone:
        return 0.0

    # Scale remaining range to 0-1
    sign = 1 if value > 0 else -1
    scaled = (abs(value) - deadzone) / (1.0 - deadzone)
    return sign * scaled


def smooth_action(
    current: GatedAction,
    previous: GatedAction | None,
    smoothing: float = 0.3,
) -> GatedAction:
    """Apply smoothing between consecutive actions.

    Args:
        current: Current action
        previous: Previous action (or None)
        smoothing: Smoothing factor (0 = no smoothing, 1 = full previous)

    Returns:
        Smoothed action
    """
    if previous is None or smoothing <= 0:
        return current

    # Only smooth joysticks, not buttons
    smoothed = GatedAction(
        axis_left_x=int(
            current.axis_left_x * (1 - smoothing) + previous.axis_left_x * smoothing
        ),
        axis_left_y=int(
            current.axis_left_y * (1 - smoothing) + previous.axis_left_y * smoothing
        ),
        axis_right_x=int(
            current.axis_right_x * (1 - smoothing) + previous.axis_right_x * smoothing
        ),
        axis_right_y=int(
            current.axis_right_y * (1 - smoothing) + previous.axis_right_y * smoothing
        ),
        buttons=current.buttons,
        left_trigger=current.left_trigger,
        right_trigger=current.right_trigger,
        was_suppressed=current.was_suppressed,
        source_constraint=current.source_constraint,
    )

    return smoothed
