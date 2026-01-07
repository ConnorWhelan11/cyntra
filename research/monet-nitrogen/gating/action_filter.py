"""Filter executor actions based on planner constraints."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

from schemas.planner_output import PlannerOutput, ActionType, ConstraintType
from schemas.executor_action import (
    NitroGenAction,
    SingleTimestepAction,
    GatedAction,
    BUTTON_NAMES,
)
from gating.constraint_engine import ConstraintEngine

logger = logging.getLogger(__name__)


# Default mapping from abstract actions to gamepad buttons
DEFAULT_BUTTON_MAPPING: dict[str, list[str]] = {
    "SHOOT": ["RIGHT_TRIGGER", "EAST"],
    "JUMP": ["SOUTH"],
    "DODGE": ["EAST", "LEFT_SHOULDER"],
    "INTERACT": ["WEST", "NORTH"],
    "USE_ABILITY": ["RIGHT_SHOULDER", "LEFT_SHOULDER"],
    "SPRINT": ["LEFT_THUMB"],
    "CROUCH": ["RIGHT_THUMB", "DPAD_DOWN"],
    "AIM_AT_TARGET": [],  # Handled via joystick
}

# Buttons that should always be suppressed for safety
DEFAULT_ALWAYS_SUPPRESS: list[str] = ["GUIDE", "START", "BACK"]


class ActionFilter:
    """Filter raw NitroGen actions through planner constraints.

    The filter:
    1. Takes raw actions from NitroGen
    2. Applies constraints from the ConstraintEngine
    3. Returns gated actions with suppression metadata
    """

    def __init__(
        self,
        game_profile_path: Path | str | None = None,
        button_threshold: float = 0.5,
        suppress_menu_buttons: bool = True,
    ) -> None:
        """Initialize action filter.

        Args:
            game_profile_path: Path to game-specific button mapping YAML
            button_threshold: Threshold for considering a button pressed
            suppress_menu_buttons: Whether to suppress START/BACK/GUIDE
        """
        self.button_threshold = button_threshold
        self.suppress_menu_buttons = suppress_menu_buttons
        self.constraint_engine = ConstraintEngine()

        # Load button mapping
        self.button_mapping = DEFAULT_BUTTON_MAPPING.copy()
        self.always_suppress = DEFAULT_ALWAYS_SUPPRESS.copy() if suppress_menu_buttons else []

        if game_profile_path:
            self._load_profile(Path(game_profile_path))

    def _load_profile(self, path: Path) -> None:
        """Load game-specific button mapping."""
        if not path.exists():
            logger.warning(f"Game profile not found: {path}")
            return

        with open(path) as f:
            profile = yaml.safe_load(f)

        if "button_mapping" in profile:
            self.button_mapping.update(profile["button_mapping"])
            logger.info(f"Loaded button mapping from {path}")

        if "always_suppress" in profile:
            self.always_suppress = profile["always_suppress"]

    def update_plan(self, plan: PlannerOutput) -> None:
        """Update the constraint engine with a new plan.

        Args:
            plan: New plan from Monet planner
        """
        self.constraint_engine.update(plan)

    def apply(
        self,
        raw_actions: NitroGenAction,
        plan: PlannerOutput | None = None,
    ) -> list[GatedAction]:
        """Apply gating to raw NitroGen actions.

        Args:
            raw_actions: Raw NitroGenAction with 16 timesteps
            plan: Optional new plan to update constraints

        Returns:
            List of 16 GatedActions with suppression metadata
        """
        if plan is not None:
            self.update_plan(plan)

        gated = []
        for i in range(16):
            timestep = raw_actions.get_timestep(i)
            gated_action = self._gate_single(timestep)
            gated.append(gated_action)

        return gated

    def apply_single(
        self,
        raw_action: SingleTimestepAction,
        plan: PlannerOutput | None = None,
    ) -> GatedAction:
        """Apply gating to a single action.

        Args:
            raw_action: Single timestep action
            plan: Optional new plan

        Returns:
            Gated action
        """
        if plan is not None:
            self.update_plan(plan)

        return self._gate_single(raw_action)

    def _gate_single(self, action: SingleTimestepAction) -> GatedAction:
        """Gate a single timestep action.

        Args:
            action: Raw single timestep action

        Returns:
            Gated action with suppression info
        """
        suppressed: dict[str, bool] = {}
        source_constraint: str | None = None

        # Convert to dict for easier manipulation
        action_dict = action.to_dict()

        # First pass: check each abstract action for suppression
        for action_type_str, buttons in self.button_mapping.items():
            try:
                action_type = ActionType(action_type_str)
            except ValueError:
                continue

            should_suppress, reason = self.constraint_engine.should_suppress_action(
                action_type
            )

            if should_suppress:
                # Suppress all buttons mapped to this action
                for btn in buttons:
                    if btn in action_dict:
                        # Check if button would have been pressed
                        btn_value = action_dict[btn]
                        if isinstance(btn_value, (int, float)):
                            was_pressed = btn_value > self.button_threshold
                        else:
                            was_pressed = btn_value > self.button_threshold

                        if was_pressed:
                            suppressed[btn] = True
                            if source_constraint is None:
                                source_constraint = reason

                        # Actually suppress the button
                        action_dict[btn] = 0.0

        # Second pass: always suppress menu buttons
        for btn in self.always_suppress:
            if btn in action_dict and action_dict[btn] > self.button_threshold:
                suppressed[btn] = True
                if source_constraint is None:
                    source_constraint = "menu_button_suppression"
                action_dict[btn] = 0.0

        # Third pass: apply skill mode modifiers
        mode, aggression, stealth = self.constraint_engine.get_skill_mode()
        action_dict = self._apply_skill_mode(action_dict, mode, aggression, stealth)

        # Convert to GatedAction
        buttons = {}
        for name in BUTTON_NAMES:
            if "TRIGGER" in name:
                continue
            val = action_dict.get(name, 0)
            buttons[name] = val > self.button_threshold if isinstance(val, float) else val > 0

        left_trigger = int(action_dict.get("LEFT_TRIGGER", 0) * 255)
        right_trigger = int(action_dict.get("RIGHT_TRIGGER", 0) * 255)

        return GatedAction(
            axis_left_x=int(action_dict["AXIS_LEFTX"] * 32767),
            axis_left_y=int(action_dict["AXIS_LEFTY"] * 32767),
            axis_right_x=int(action_dict["AXIS_RIGHTX"] * 32767),
            axis_right_y=int(action_dict["AXIS_RIGHTY"] * 32767),
            buttons=buttons,
            left_trigger=max(0, min(255, left_trigger)),
            right_trigger=max(0, min(255, right_trigger)),
            was_suppressed=suppressed,
            source_constraint=source_constraint,
        )

    def _apply_skill_mode(
        self,
        action_dict: dict[str, Any],
        mode: str,
        aggression: float,
        stealth: float,
    ) -> dict[str, Any]:
        """Apply skill mode modifiers to action.

        Args:
            action_dict: Action as dict
            mode: Skill mode (aggressive, defensive, stealth, balanced)
            aggression: Aggression level (0-1)
            stealth: Stealth level (0-1)

        Returns:
            Modified action dict
        """
        if mode == "defensive":
            # Reduce shooting tendency
            if "RIGHT_TRIGGER" in action_dict:
                action_dict["RIGHT_TRIGGER"] *= (0.5 + 0.5 * aggression)

        elif mode == "stealth":
            # Reduce movement speed
            action_dict["AXIS_LEFTX"] *= (1.0 - 0.5 * stealth)
            action_dict["AXIS_LEFTY"] *= (1.0 - 0.5 * stealth)
            # Reduce shooting
            if "RIGHT_TRIGGER" in action_dict:
                action_dict["RIGHT_TRIGGER"] *= (1.0 - stealth)

        elif mode == "aggressive":
            # Boost shooting tendency slightly
            if "RIGHT_TRIGGER" in action_dict:
                action_dict["RIGHT_TRIGGER"] = min(
                    1.0, action_dict["RIGHT_TRIGGER"] * (1.0 + 0.2 * aggression)
                )

        return action_dict

    def get_suppression_stats(self) -> dict[str, Any]:
        """Get suppression statistics."""
        return {
            **self.constraint_engine.get_stats(),
            "button_mapping": self.button_mapping,
            "always_suppress": self.always_suppress,
        }
