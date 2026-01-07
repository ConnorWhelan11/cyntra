#!/usr/bin/env python3
"""Minimal hello world demo.

Process a folder of images and print JSON plans.
No game required - just tests the planner.

Usage:
    python scripts/demo_hello_world.py --images tests/fixtures/sample_frames/
    python scripts/demo_hello_world.py --mock  # Use mock planner
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from planner.monet_client import MonetPlanner, MockMonetPlanner
from schemas.planner_output import PlannerOutput


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def create_test_frame(idx: int, size: tuple[int, int] = (256, 256)) -> np.ndarray:
    """Create a synthetic test frame."""
    frame = np.zeros((size[1], size[0], 3), dtype=np.uint8)

    # Background gradient
    for y in range(size[1]):
        frame[y, :, 0] = int(y / size[1] * 100)
        frame[y, :, 2] = int((1 - y / size[1]) * 100)

    # Add some variation based on index
    cx = int((idx % 10) / 10 * size[0])
    cy = size[1] // 2

    # Draw a circle (simulated target)
    import cv2
    cv2.circle(frame, (cx, cy), 20, (255, 200, 0), -1)

    return frame


async def main() -> None:
    parser = argparse.ArgumentParser(description="Demo hello world")
    parser.add_argument(
        "--images",
        type=str,
        default=None,
        help="Directory containing test images",
    )
    parser.add_argument(
        "--monet-url",
        type=str,
        default="http://localhost:8000",
        help="Monet server URL",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Use mock planner",
    )
    parser.add_argument(
        "--num-frames",
        type=int,
        default=5,
        help="Number of synthetic frames if no images provided",
    )

    args = parser.parse_args()

    print()
    print("=" * 60)
    print("MONET-NITROGEN HELLO WORLD DEMO")
    print("=" * 60)
    print()

    # Initialize planner
    if args.mock:
        print("Using MOCK planner (no server required)")
        planner = MockMonetPlanner()
    else:
        print(f"Connecting to Monet at {args.monet_url}")
        planner = MonetPlanner(base_url=args.monet_url)

    await planner.__aenter__()

    try:
        # Collect frames
        frames: list[tuple[str, np.ndarray]] = []

        if args.images:
            images_dir = Path(args.images)
            if images_dir.exists():
                for path in sorted(images_dir.glob("*.png"))[:args.num_frames]:
                    img = Image.open(path).convert("RGB")
                    frames.append((path.name, np.array(img)))

        if not frames:
            print(f"Generating {args.num_frames} synthetic test frames...")
            for i in range(args.num_frames):
                frame = create_test_frame(i)
                frames.append((f"synthetic_{i:03d}.png", frame))

        print(f"Processing {len(frames)} frames...")
        print()

        # Process each frame
        for name, frame in frames:
            print("=" * 60)
            print(f"Processing: {name}")
            print("-" * 40)

            state = {
                "health": "100%",
                "position": "center",
                "enemies": "unknown",
                "objective": "explore",
            }

            plan = await planner.plan(frame, state)

            if plan:
                print(f"Intent: {plan.intent}")
                print(f"Target: {plan.target.type} @ ({plan.target.screen_xy[0]:.2f}, {plan.target.screen_xy[1]:.2f})")
                print(f"Skill mode: {plan.skill.mode} (aggression: {plan.skill.aggression:.1f})")
                print(f"Constraints: {len(plan.constraints)}")
                for c in plan.constraints:
                    action_str = c.action.value if c.action else "none"
                    print(f"  - {c.type.value} {action_str}: {c.reason}")
                print(f"Confidence: {plan.confidence:.2f}")
            else:
                print("ERROR: Failed to get plan!")

            print()

        # Summary
        stats = planner.get_stats()
        print("=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Total requests: {stats.get('total_requests', 0)}")
        print(f"Successful: {stats.get('successful_requests', 0)}")
        print(f"Failed: {stats.get('failed_requests', 0)}")
        if stats.get('total_requests', 0) > 0:
            print(f"Success rate: {stats.get('success_rate', 0):.1%}")
            print(f"Avg latency: {stats.get('avg_latency_ms', 0):.0f}ms")
        print()
        print("Demo complete!")

    finally:
        await planner.__aexit__(None, None, None)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped by user")
