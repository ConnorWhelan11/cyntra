"""Extract game state from frames (placeholder for OCR/detection)."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


class StateExtractor:
    """Extract structured game state from frames.

    This is a placeholder for future OCR/detection capabilities.
    Currently returns stub state for planner prompts.
    """

    def __init__(self) -> None:
        """Initialize state extractor."""
        self._last_state: dict[str, Any] = {}

    def extract(self, frame: np.ndarray) -> dict[str, Any]:
        """Extract game state from a frame.

        Currently returns stub values. In future versions, this would use:
        - OCR for health bars, ammo, etc.
        - Object detection for enemies, items
        - Minimap analysis for position

        Args:
            frame: Game frame as numpy array

        Returns:
            Game state dict
        """
        # Stub implementation
        # Future: implement actual extraction

        state = {
            "health": "unknown",
            "position": "unknown",
            "enemies": "check frame for enemies",
            "objective": "explore",
            "context": "awaiting OCR implementation",
        }

        # Simple heuristics based on frame
        avg_brightness = np.mean(frame)

        if avg_brightness < 50:
            state["context"] = "dark environment, be cautious"
        elif avg_brightness > 200:
            state["context"] = "bright environment"

        # Check for red areas (possible enemies/damage indicators)
        red_ratio = np.mean(frame[:, :, 0]) / (np.mean(frame) + 1)
        if red_ratio > 1.5:
            state["context"] = "high red content, possible danger"

        self._last_state = state
        return state

    def get_last_state(self) -> dict[str, Any]:
        """Get the last extracted state.

        Returns:
            Last state dict
        """
        return self._last_state

    def update_manual(self, updates: dict[str, Any]) -> dict[str, Any]:
        """Manually update state values.

        Useful for integrating external information.

        Args:
            updates: Dict of state updates

        Returns:
            Updated state
        """
        self._last_state.update(updates)
        return self._last_state


class HealthBarDetector:
    """Detect health bar value from frame region.

    Placeholder for future implementation.
    """

    def __init__(
        self,
        region: tuple[int, int, int, int] = (10, 10, 200, 30),
        bar_color: tuple[int, int, int] = (255, 0, 0),
    ) -> None:
        """Initialize health bar detector.

        Args:
            region: (x, y, width, height) of health bar region
            bar_color: Expected color of health bar (RGB)
        """
        self.region = region
        self.bar_color = np.array(bar_color)

    def detect(self, frame: np.ndarray) -> float | None:
        """Detect health bar fill percentage.

        Args:
            frame: Game frame

        Returns:
            Health percentage (0-1) or None if detection failed
        """
        x, y, w, h = self.region

        # Check bounds
        if x + w > frame.shape[1] or y + h > frame.shape[0]:
            return None

        # Extract region
        region = frame[y : y + h, x : x + w]

        # Simple color-based detection
        # Count pixels close to bar color
        diff = np.abs(region.astype(float) - self.bar_color)
        close_pixels = np.sum(np.all(diff < 50, axis=-1))
        total_pixels = w * h

        if total_pixels == 0:
            return None

        # Estimate fill based on color matching
        # This is a rough heuristic
        fill = close_pixels / total_pixels

        return min(1.0, max(0.0, fill))
