#!/usr/bin/env python3
"""Run offline evaluation on a folder of images.

Usage:
    python scripts/eval_offline.py --images tests/fixtures/sample_frames/
    python scripts/eval_offline.py --images data/screenshots/ --output data/eval/
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from planner.monet_client import MonetPlanner, MockMonetPlanner
from eval.offline_harness import OfflineEvaluator
from eval.report_generator import ReportGenerator


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run offline evaluation")
    parser.add_argument(
        "--images",
        type=str,
        required=True,
        help="Directory containing test images",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/eval",
        help="Output directory for results",
    )
    parser.add_argument(
        "--monet-url",
        type=str,
        default="http://localhost:8000",
        help="Monet server URL",
    )
    parser.add_argument(
        "--max-images",
        type=int,
        default=None,
        help="Maximum images to process",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Use mock planner (for testing)",
    )

    args = parser.parse_args()

    images_dir = Path(args.images)
    output_dir = Path(args.output)

    if not images_dir.exists():
        print(f"Error: Images directory not found: {images_dir}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print()
    print("=" * 60)
    print("MONET-NITROGEN OFFLINE EVALUATION")
    print("=" * 60)
    print(f"Images: {images_dir}")
    print(f"Output: {output_dir}")
    print(f"Max images: {args.max_images or 'all'}")
    print(f"Mock mode: {args.mock}")
    print("=" * 60)
    print()

    # Initialize planner
    if args.mock:
        planner = MockMonetPlanner()
        await planner.__aenter__()
    else:
        planner = MonetPlanner(base_url=args.monet_url)
        await planner.__aenter__()

        # Health check
        healthy = await planner.health_check()
        if not healthy:
            print(f"Warning: Monet server at {args.monet_url} may not be healthy")

    try:
        # Run evaluation
        evaluator = OfflineEvaluator(
            images_dir=images_dir,
            planner=planner,
            output_dir=output_dir,
        )

        result = await evaluator.run(max_images=args.max_images)

        # Generate report
        report_gen = ReportGenerator(output_dir)
        report_path = report_gen.generate_offline_report(result)

        # Print summary
        print()
        print("=" * 60)
        print("EVALUATION COMPLETE")
        print("=" * 60)
        print(f"Total images: {result.total_images}")
        print(f"JSON valid rate: {result.json_valid_rate:.1%}")
        print(f"Average latency: {result.avg_latency_ms:.0f}ms")
        print(f"P95 latency: {result.p95_latency_ms:.0f}ms")
        print(f"Average confidence: {result.avg_confidence:.2f}")
        print(f"Consistency score: {result.consistency_score:.2f}")
        print()
        print("Constraint distribution:")
        for k, v in sorted(result.constraint_distribution.items(), key=lambda x: -x[1])[:5]:
            print(f"  {k}: {v}")
        print()
        print(f"Report saved to: {report_path}")

        # Check success criteria
        criteria = {
            "JSON valid rate >= 99%": result.json_valid_rate >= 0.99,
            "Avg latency < 2000ms": result.avg_latency_ms < 2000,
            "Avg confidence >= 0.5": result.avg_confidence >= 0.5,
        }

        print()
        print("Success criteria:")
        all_pass = True
        for name, passed in criteria.items():
            status = "PASS" if passed else "FAIL"
            print(f"  [{status}] {name}")
            if not passed:
                all_pass = False

        print()
        print(f"Overall: {'PASS' if all_pass else 'FAIL'}")

    finally:
        await planner.__aexit__(None, None, None)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped by user")
