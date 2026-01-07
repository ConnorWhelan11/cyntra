"""Virtual gamepad for sending actions to games."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from schemas.executor_action import GatedAction, BUTTON_NAMES

logger = logging.getLogger(__name__)


class VirtualGamepad:
    """Virtual gamepad using ViGEm (Windows only).

    Emulates an Xbox 360 controller to send inputs to games.
    """

    def __init__(self) -> None:
        """Initialize virtual gamepad."""
        self._gamepad: Any = None
        self._available = False
        self._init_gamepad()

        # Stats
        self.total_inputs = 0
        self.last_input_time = 0.0

    def _init_gamepad(self) -> None:
        """Initialize ViGEm gamepad."""
        try:
            import vgamepad

            self._gamepad = vgamepad.VX360Gamepad()
            self._available = True
            logger.info("Virtual gamepad initialized (ViGEm)")
        except ImportError:
            logger.warning("vgamepad not available, gamepad will be mocked")
            self._available = False
        except Exception as e:
            logger.warning(f"Failed to init gamepad: {e}")
            self._available = False

    async def send(self, action: GatedAction) -> None:
        """Send action to virtual gamepad.

        Args:
            action: Gated action to send
        """
        if not self._available or self._gamepad is None:
            return

        try:
            # Set joysticks
            # vgamepad uses -1.0 to 1.0 range
            left_x = action.axis_left_x / 32767
            left_y = action.axis_left_y / 32767
            right_x = action.axis_right_x / 32767
            right_y = action.axis_right_y / 32767

            self._gamepad.left_joystick_float(left_x, left_y)
            self._gamepad.right_joystick_float(right_x, right_y)

            # Set triggers
            self._gamepad.left_trigger_float(action.left_trigger / 255)
            self._gamepad.right_trigger_float(action.right_trigger / 255)

            # Set buttons
            self._set_buttons(action.buttons)

            # Update gamepad
            self._gamepad.update()

            self.total_inputs += 1
            self.last_input_time = time.time()

        except Exception as e:
            logger.error(f"Gamepad send error: {e}")

    def _set_buttons(self, buttons: dict[str, bool]) -> None:
        """Set button states.

        Args:
            buttons: Dict of button name to pressed state
        """
        import vgamepad as vg

        # Map button names to vgamepad constants
        button_map = {
            "SOUTH": vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
            "EAST": vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
            "WEST": vg.XUSB_BUTTON.XUSB_GAMEPAD_X,
            "NORTH": vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
            "LEFT_SHOULDER": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
            "RIGHT_SHOULDER": vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
            "LEFT_THUMB": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_THUMB,
            "RIGHT_THUMB": vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_THUMB,
            "START": vg.XUSB_BUTTON.XUSB_GAMEPAD_START,
            "BACK": vg.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
            "GUIDE": vg.XUSB_BUTTON.XUSB_GAMEPAD_GUIDE,
            "DPAD_UP": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP,
            "DPAD_DOWN": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN,
            "DPAD_LEFT": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT,
            "DPAD_RIGHT": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT,
        }

        for name, pressed in buttons.items():
            if name in button_map:
                if pressed:
                    self._gamepad.press_button(button_map[name])
                else:
                    self._gamepad.release_button(button_map[name])

    def reset(self) -> None:
        """Reset gamepad to neutral state."""
        if not self._available or self._gamepad is None:
            return

        self._gamepad.reset()
        self._gamepad.update()

    def get_stats(self) -> dict[str, Any]:
        """Get gamepad statistics."""
        return {
            "available": self._available,
            "total_inputs": self.total_inputs,
            "last_input_time": self.last_input_time,
        }

    def close(self) -> None:
        """Close gamepad resources."""
        if self._available and self._gamepad:
            self.reset()
        logger.info("Gamepad closed")

    def __enter__(self) -> "VirtualGamepad":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class MockGamepad:
    """Mock gamepad for testing without ViGEm."""

    def __init__(self, verbose: bool = False) -> None:
        """Initialize mock gamepad.

        Args:
            verbose: Whether to log all inputs
        """
        self.verbose = verbose
        self.total_inputs = 0
        self.last_action: GatedAction | None = None
        self.action_history: list[GatedAction] = []

    async def send(self, action: GatedAction) -> None:
        """Mock send - just log.

        Args:
            action: Action to "send"
        """
        self.total_inputs += 1
        self.last_action = action
        self.action_history.append(action)

        # Keep history limited
        if len(self.action_history) > 1000:
            self.action_history = self.action_history[-1000:]

        if self.verbose:
            pressed = [k for k, v in action.buttons.items() if v]
            suppressed = list(action.was_suppressed.keys())
            logger.debug(
                f"Mock gamepad: L({action.axis_left_x}, {action.axis_left_y}) "
                f"R({action.axis_right_x}, {action.axis_right_y}) "
                f"buttons={pressed} suppressed={suppressed}"
            )

    def reset(self) -> None:
        """Reset mock state."""
        self.last_action = None

    def get_stats(self) -> dict[str, Any]:
        """Get mock statistics."""
        return {
            "mock": True,
            "total_inputs": self.total_inputs,
            "history_size": len(self.action_history),
        }

    def get_suppression_history(self) -> list[dict[str, bool]]:
        """Get history of suppressed actions.

        Returns:
            List of suppression dicts
        """
        return [a.was_suppressed for a in self.action_history if a.was_suppressed]

    def close(self) -> None:
        """Close mock (no-op)."""
        pass

    def __enter__(self) -> "MockGamepad":
        return self

    def __exit__(self, *args: Any) -> None:
        pass
