"""Main control loop for Monet-NitroGen system."""

from __future__ import annotations

import asyncio
import logging
import signal
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import cv2
import numpy as np
from PIL import Image

from schemas.planner_output import PlannerOutput
from schemas.executor_action import NitroGenAction, GatedAction
from orchestrator.blackboard import Blackboard
from gating.action_filter import ActionFilter
from gating.safety_clamp import SafetyClamp, SafetyConfig

logger = logging.getLogger(__name__)


class FrameCaptureProtocol(Protocol):
    """Protocol for frame capture."""

    async def grab_async(self) -> np.ndarray | None:
        ...

    def close(self) -> None:
        ...


class PlannerProtocol(Protocol):
    """Protocol for planner."""

    async def plan(
        self, frame: np.ndarray | Image.Image, state: dict[str, Any] | None
    ) -> PlannerOutput | None:
        ...


class ExecutorProtocol(Protocol):
    """Protocol for executor."""

    async def predict_async(self, frame: Image.Image | np.ndarray) -> NitroGenAction:
        ...

    def close(self) -> None:
        ...


class GamepadProtocol(Protocol):
    """Protocol for gamepad."""

    async def send(self, action: GatedAction) -> None:
        ...

    def close(self) -> None:
        ...


@dataclass
class LoopConfig:
    """Configuration for main loop."""

    target_fps: int = 60
    planner_frequency_hz: float = 2.0
    plan_ttl_ms: int = 2000
    executor_frame_size: tuple[int, int] = (256, 256)
    log_dir: Path | None = None


class MainLoop:
    """Main control loop orchestrating all components.

    The loop runs at target FPS and coordinates:
    - Frame capture (every frame)
    - Executor inference (every frame, batched)
    - Planner inference (at lower frequency)
    - Gating and safety (every frame)
    - Gamepad output (every frame)
    """

    def __init__(
        self,
        frame_capture: FrameCaptureProtocol,
        planner: PlannerProtocol,
        executor: ExecutorProtocol,
        gamepad: GamepadProtocol,
        config: LoopConfig | None = None,
        game_profile_path: Path | str | None = None,
    ) -> None:
        """Initialize main loop.

        Args:
            frame_capture: Frame capture instance
            planner: Monet planner instance
            executor: NitroGen executor instance
            gamepad: Virtual gamepad instance
            config: Loop configuration
            game_profile_path: Path to game profile YAML
        """
        self.frame_capture = frame_capture
        self.planner = planner
        self.executor = executor
        self.gamepad = gamepad
        self.config = config or LoopConfig()

        # Initialize components
        self.blackboard = Blackboard(
            plan_ttl_ms=self.config.plan_ttl_ms,
            log_dir=self.config.log_dir,
        )
        self.action_filter = ActionFilter(game_profile_path=game_profile_path)
        self.safety_clamp = SafetyClamp(
            SafetyConfig(plan_ttl_ms=self.config.plan_ttl_ms)
        )

        # Timing
        self.frame_interval = 1.0 / self.config.target_fps
        self.planner_interval = 1.0 / self.config.planner_frequency_hz

        # State
        self._running = False
        self._planner_task: asyncio.Task | None = None
        self._last_executor_actions: list[GatedAction] = []
        self._action_index = 0

    async def run(self) -> None:
        """Run the main loop."""
        self._running = True
        logger.info("Starting main loop...")

        # Start planner in background
        self._planner_task = asyncio.create_task(self._planner_loop())

        try:
            while self._running:
                loop_start = time.time()

                # 1. Capture frame
                frame = await self.frame_capture.grab_async()
                if frame is not None:
                    self.blackboard.update_frame(frame)
                else:
                    # Use last frame if capture failed
                    frame = self.blackboard.latest_frame

                if frame is None:
                    await asyncio.sleep(self.frame_interval)
                    continue

                # 2. Get current plan
                plan = self.blackboard.get_effective_plan()
                self.safety_clamp.update_plan(plan)

                # 3. Run executor if needed (or use cached actions)
                action = await self._get_action(frame, plan)

                # 4. Apply safety clamp
                action = self.safety_clamp.apply_safety(action)

                # 5. Check for stuck
                joystick_xy = (
                    action.axis_left_x / 32767,
                    action.axis_left_y / 32767,
                )
                self.safety_clamp.check_stuck(joystick_xy)

                # 6. Send to gamepad
                await self.gamepad.send(action)

                # 7. Update status
                self.blackboard.update_executor_action(action)

                # 8. Log for SFT
                if self._action_index == 0:  # Log once per batch
                    self.blackboard.log_action(
                        frame_id=self.blackboard.latest_frame_id,
                        plan=self.blackboard.latest_plan,
                        raw_action={},  # Would include raw tensor
                        gated_action=action,
                    )

                # 9. Rate limit
                elapsed = time.time() - loop_start
                if elapsed < self.frame_interval:
                    await asyncio.sleep(self.frame_interval - elapsed)

        except asyncio.CancelledError:
            logger.info("Main loop cancelled")
        except Exception as e:
            logger.error(f"Main loop error: {e}", exc_info=True)
        finally:
            await self._cleanup()

    async def _get_action(self, frame: np.ndarray, plan: PlannerOutput) -> GatedAction:
        """Get next action, running executor if needed.

        Args:
            frame: Current frame
            plan: Current plan

        Returns:
            Gated action
        """
        # If we have cached actions, use them
        if self._action_index < len(self._last_executor_actions):
            action = self._last_executor_actions[self._action_index]
            self._action_index += 1
            return action

        # Need new executor prediction
        try:
            # Resize for executor
            frame_resized = cv2.resize(
                frame, self.config.executor_frame_size, interpolation=cv2.INTER_AREA
            )
            pil_frame = Image.fromarray(
                cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
            )

            # Get prediction
            raw_actions = await self.executor.predict_async(pil_frame)

            # Apply gating
            self._last_executor_actions = self.action_filter.apply(raw_actions, plan)
            self._action_index = 1  # Return first, advance index

            return self._last_executor_actions[0]

        except Exception as e:
            logger.error(f"Executor error: {e}")
            # Return neutral action on error
            return GatedAction(
                axis_left_x=0,
                axis_left_y=0,
                axis_right_x=0,
                axis_right_y=0,
                buttons={},
            )

    async def _planner_loop(self) -> None:
        """Background loop for planner inference."""
        logger.info(f"Planner loop started at {self.config.planner_frequency_hz} Hz")

        while self._running:
            try:
                frame = self.blackboard.latest_frame
                if frame is not None:
                    # Extract state (stub for now)
                    state = {
                        "health": "unknown",
                        "position": "unknown",
                        "enemies": "check frame",
                        "objective": "explore",
                    }

                    # Run planner with timeout
                    try:
                        plan = await asyncio.wait_for(
                            self.planner.plan(frame, state),
                            timeout=1.5,
                        )

                        if plan is not None:
                            self.blackboard.update_plan(plan)
                        else:
                            self.blackboard.record_plan_failure()

                    except asyncio.TimeoutError:
                        logger.warning("Planner timeout")
                        self.blackboard.record_plan_failure()

            except Exception as e:
                logger.error(f"Planner loop error: {e}")

            await asyncio.sleep(self.planner_interval)

    async def _cleanup(self) -> None:
        """Clean up resources."""
        self._running = False

        if self._planner_task:
            self._planner_task.cancel()
            try:
                await self._planner_task
            except asyncio.CancelledError:
                pass

        self.blackboard.close()
        logger.info("Main loop cleanup complete")

    def stop(self) -> None:
        """Signal the loop to stop."""
        self._running = False

    def get_stats(self) -> dict[str, Any]:
        """Get loop statistics."""
        return {
            "blackboard": self.blackboard.get_stats(),
            "action_filter": self.action_filter.get_suppression_stats(),
            "safety_clamp": self.safety_clamp.get_stats(),
        }


async def run_main_loop(
    frame_capture: FrameCaptureProtocol,
    planner: PlannerProtocol,
    executor: ExecutorProtocol,
    gamepad: GamepadProtocol,
    config: LoopConfig | None = None,
    game_profile_path: Path | str | None = None,
) -> None:
    """Convenience function to run the main loop.

    Args:
        frame_capture: Frame capture instance
        planner: Monet planner instance
        executor: NitroGen executor instance
        gamepad: Virtual gamepad instance
        config: Loop configuration
        game_profile_path: Path to game profile YAML
    """
    loop = MainLoop(
        frame_capture=frame_capture,
        planner=planner,
        executor=executor,
        gamepad=gamepad,
        config=config,
        game_profile_path=game_profile_path,
    )

    # Handle shutdown signals
    def signal_handler() -> None:
        logger.info("Received shutdown signal")
        loop.stop()

    try:
        signal.signal(signal.SIGINT, lambda *_: signal_handler())
        signal.signal(signal.SIGTERM, lambda *_: signal_handler())
    except ValueError:
        # Signal handling not available (e.g., not main thread)
        pass

    await loop.run()
