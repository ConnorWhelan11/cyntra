#!/usr/bin/env python3
"""Run the Monet-NitroGen system on a game.

Usage:
    python scripts/play.py --game "Game.exe" --profile default
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from capture.frame_capture import FrameCapture, MockFrameCapture
from planner.monet_client import MonetPlanner, MockMonetPlanner
from executor.nitrogen_client import NitroGenExecutor, MockNitroGenExecutor
from orchestrator.gamepad import VirtualGamepad, MockGamepad
from orchestrator.main_loop import MainLoop, LoopConfig


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run Monet-NitroGen on a game")
    parser.add_argument(
        "--game",
        type=str,
        default=None,
        help="Game executable name (e.g., 'Game.exe')",
    )
    parser.add_argument(
        "--profile",
        type=str,
        default="default",
        help="Game profile name",
    )
    parser.add_argument(
        "--monet-url",
        type=str,
        default="http://localhost:8000",
        help="Monet server URL",
    )
    parser.add_argument(
        "--nitrogen-port",
        type=int,
        default=5555,
        help="NitroGen server port",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Use mock components (for testing)",
    )
    parser.add_argument(
        "--log-dir",
        type=str,
        default="data/logs",
        help="Directory for SFT logs",
    )
    parser.add_argument(
        "--target-fps",
        type=int,
        default=60,
        help="Target FPS",
    )
    parser.add_argument(
        "--planner-hz",
        type=float,
        default=2.0,
        help="Planner frequency in Hz",
    )

    args = parser.parse_args()

    # Get profile path
    profile_path = Path(__file__).parent.parent / "configs" / "game_profiles" / f"{args.profile}.yaml"
    if not profile_path.exists():
        logger.warning(f"Profile {args.profile} not found, using default")
        profile_path = Path(__file__).parent.parent / "configs" / "game_profiles" / "default.yaml"

    # Create config
    config = LoopConfig(
        target_fps=args.target_fps,
        planner_frequency_hz=args.planner_hz,
        log_dir=Path(args.log_dir),
    )

    # Initialize components
    if args.mock:
        logger.info("Running in MOCK mode")
        frame_capture = MockFrameCapture()
        planner = MockMonetPlanner()
        executor = MockNitroGenExecutor()
        gamepad = MockGamepad(verbose=True)
    else:
        logger.info("Initializing real components...")

        # Frame capture
        try:
            frame_capture = FrameCapture(target_fps=args.target_fps)
        except Exception as e:
            logger.error(f"Frame capture failed: {e}")
            logger.info("Falling back to mock frame capture")
            frame_capture = MockFrameCapture()

        # Planner
        planner = MonetPlanner(base_url=args.monet_url)

        # Executor
        try:
            executor = NitroGenExecutor(port=args.nitrogen_port)
            executor.reset()
        except Exception as e:
            logger.error(f"NitroGen connection failed: {e}")
            logger.info("Falling back to mock executor")
            executor = MockNitroGenExecutor()

        # Gamepad
        try:
            gamepad = VirtualGamepad()
        except Exception as e:
            logger.error(f"Gamepad init failed: {e}")
            logger.info("Falling back to mock gamepad")
            gamepad = MockGamepad(verbose=True)

    # Create main loop
    loop = MainLoop(
        frame_capture=frame_capture,
        planner=planner,
        executor=executor,
        gamepad=gamepad,
        config=config,
        game_profile_path=profile_path,
    )

    print()
    print("=" * 60)
    print("MONET-NITROGEN GAME AI")
    print("=" * 60)
    print(f"Game profile: {args.profile}")
    print(f"Target FPS: {args.target_fps}")
    print(f"Planner frequency: {args.planner_hz} Hz")
    print(f"Log directory: {args.log_dir}")
    print()
    print("Press Ctrl+C to stop")
    print("=" * 60)
    print()

    # Countdown
    if not args.mock:
        for i in range(3, 0, -1):
            print(f"Starting in {i}...")
            await asyncio.sleep(1)

    # Enter planner context
    if hasattr(planner, "__aenter__"):
        await planner.__aenter__()

    try:
        await loop.run()
    finally:
        # Cleanup
        if hasattr(planner, "__aexit__"):
            await planner.__aexit__(None, None, None)
        if hasattr(executor, "close"):
            executor.close()
        if hasattr(frame_capture, "close"):
            frame_capture.close()
        if hasattr(gamepad, "close"):
            gamepad.close()

        # Print final stats
        print()
        print("=" * 60)
        print("SESSION COMPLETE")
        print("=" * 60)
        stats = loop.get_stats()
        bb = stats.get("blackboard", {})
        print(f"Duration: {bb.get('elapsed_s', 0):.1f}s")
        print(f"Frames: {bb.get('total_frames', 0)}")
        print(f"FPS: {bb.get('fps', 0):.1f}")
        print(f"Plans received: {bb.get('planner', {}).get('plans_received', 0)}")
        print(f"Using fallback: {bb.get('executor', {}).get('using_fallback', False)}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped by user")
