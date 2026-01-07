"""Build prompts for Monet planner."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any


DEFAULT_PROMPT_TEMPLATE = """You are a game AI planner. Analyze the current game frame and output a strategic plan as strict JSON.

Current game state:
- Health: {health}
- Position: {position}
- Nearby enemies: {enemies}
- Current objective: {objective}
- Additional context: {context}

Output ONLY valid JSON matching this schema (no explanations, no markdown):
{{
  "timestamp_ms": {timestamp_ms},
  "intent": "<brief tactical description>",
  "target": {{"type": "<enemy|objective|cover|item|none>", "ref": "<name>", "screen_xy": [x, y]}},
  "constraints": [
    {{"type": "<DO|DO_NOT|PREFER>", "action": "<action>", "priority": 0.0-1.0, "reason": "<why>"}}
  ],
  "skill": {{"mode": "<aggressive|defensive|stealth|balanced>", "aggression": 0.0-1.0, "stealth": 0.0-1.0}},
  "confidence": 0.0-1.0
}}

Actions: SHOOT, MOVE_FORWARD, MOVE_BACKWARD, MOVE_LEFT, MOVE_RIGHT, JUMP, DODGE, INTERACT, AIM_AT_TARGET, USE_ABILITY, SPRINT, CROUCH

Respond with JSON only."""


class PromptBuilder:
    """Builds prompts for the Monet planner.

    Can load custom prompts from file or use defaults.
    """

    def __init__(self, prompt_path: Path | str | None = None) -> None:
        """Initialize prompt builder.

        Args:
            prompt_path: Optional path to custom prompt template file.
        """
        self.template: str
        if prompt_path is not None:
            path = Path(prompt_path)
            if path.exists():
                self.template = path.read_text()
            else:
                raise FileNotFoundError(f"Prompt file not found: {path}")
        else:
            self.template = DEFAULT_PROMPT_TEMPLATE

    def build(self, state: dict[str, Any]) -> str:
        """Build a prompt from game state.

        Args:
            state: Game state dict with optional keys:
                - health: Player health (str or number)
                - position: Player position (str)
                - enemies: Nearby enemies description (str)
                - objective: Current objective (str)
                - context: Additional context (str)

        Returns:
            Formatted prompt string.
        """
        # Fill in defaults for missing state
        filled_state = {
            "health": state.get("health", "unknown"),
            "position": state.get("position", "unknown"),
            "enemies": state.get("enemies", "unknown"),
            "objective": state.get("objective", "explore"),
            "context": state.get("context", "none"),
            "timestamp_ms": int(time.time() * 1000),
        }

        # Format template
        try:
            return self.template.format(**filled_state)
        except KeyError as e:
            # If template has extra placeholders, use simpler formatting
            prompt = self.template
            for key, value in filled_state.items():
                prompt = prompt.replace(f"{{{key}}}", str(value))
            return prompt

    def build_with_history(
        self,
        state: dict[str, Any],
        history: list[dict[str, Any]],
        max_history: int = 3,
    ) -> str:
        """Build prompt with recent plan history for consistency.

        Args:
            state: Current game state
            history: List of recent plans (as dicts)
            max_history: Maximum history items to include

        Returns:
            Formatted prompt with history context.
        """
        base_prompt = self.build(state)

        if not history:
            return base_prompt

        # Add history context
        history_text = "\n\nRecent plans (for consistency):\n"
        for i, plan in enumerate(history[-max_history:]):
            history_text += f"{i+1}. Intent: {plan.get('intent', 'unknown')}, "
            history_text += f"Confidence: {plan.get('confidence', 0):.2f}\n"

        # Insert before "Respond with JSON only"
        if "Respond with JSON only" in base_prompt:
            base_prompt = base_prompt.replace(
                "Respond with JSON only.",
                f"{history_text}\nMaintain consistency with recent intents if situation unchanged.\n\nRespond with JSON only.",
            )
        else:
            base_prompt += history_text

        return base_prompt
