"""Offline evaluation harness for testing planner without live game."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from schemas.planner_output import PlannerOutput
from planner.monet_client import MonetPlanner, MockMonetPlanner

logger = logging.getLogger(__name__)


@dataclass
class OfflineEvalResult:
    """Results from offline evaluation."""

    total_images: int
    json_valid_count: int
    json_valid_rate: float
    avg_latency_ms: float
    p95_latency_ms: float
    avg_confidence: float
    constraint_distribution: dict[str, int]
    intent_distribution: dict[str, int]
    consistency_score: float
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for serialization."""
        return {
            "total_images": self.total_images,
            "json_valid_count": self.json_valid_count,
            "json_valid_rate": self.json_valid_rate,
            "avg_latency_ms": self.avg_latency_ms,
            "p95_latency_ms": self.p95_latency_ms,
            "avg_confidence": self.avg_confidence,
            "constraint_distribution": self.constraint_distribution,
            "intent_distribution": self.intent_distribution,
            "consistency_score": self.consistency_score,
            "errors": self.errors,
        }


@dataclass
class ImageResult:
    """Result for a single image."""

    image_path: str
    plan: PlannerOutput | None
    latency_ms: float
    error: str | None = None


class OfflineEvaluator:
    """Evaluate planner on a folder of screenshots.

    Usage:
        evaluator = OfflineEvaluator(images_dir, planner)
        result = await evaluator.run()
    """

    def __init__(
        self,
        images_dir: Path | str,
        planner: MonetPlanner | MockMonetPlanner,
        state_stubs: dict[str, dict[str, Any]] | None = None,
        output_dir: Path | str | None = None,
    ) -> None:
        """Initialize evaluator.

        Args:
            images_dir: Directory containing test images
            planner: Planner to evaluate
            state_stubs: Optional dict mapping image names to state dicts
            output_dir: Optional output directory for results
        """
        self.images_dir = Path(images_dir)
        self.planner = planner
        self.state_stubs = state_stubs or {}
        self.output_dir = Path(output_dir) if output_dir else None

        self.results: list[ImageResult] = []

    async def run(
        self,
        max_images: int | None = None,
        patterns: list[str] | None = None,
    ) -> OfflineEvalResult:
        """Run offline evaluation.

        Args:
            max_images: Maximum images to process
            patterns: Glob patterns for images (default: *.png, *.jpg)

        Returns:
            Evaluation result
        """
        patterns = patterns or ["*.png", "*.jpg", "*.jpeg"]

        # Collect images
        image_paths: list[Path] = []
        for pattern in patterns:
            image_paths.extend(sorted(self.images_dir.glob(pattern)))

        if max_images:
            image_paths = image_paths[:max_images]

        if not image_paths:
            logger.warning(f"No images found in {self.images_dir}")
            return OfflineEvalResult(
                total_images=0,
                json_valid_count=0,
                json_valid_rate=0,
                avg_latency_ms=0,
                p95_latency_ms=0,
                avg_confidence=0,
                constraint_distribution={},
                intent_distribution={},
                consistency_score=0,
                errors=["No images found"],
            )

        logger.info(f"Evaluating {len(image_paths)} images...")

        # Process images
        self.results = []
        for img_path in image_paths:
            result = await self._process_image(img_path)
            self.results.append(result)

            # Progress logging
            if len(self.results) % 10 == 0:
                logger.info(f"Processed {len(self.results)}/{len(image_paths)}")

        # Calculate metrics
        eval_result = self._calculate_metrics()

        # Save results
        if self.output_dir:
            self._save_results(eval_result)

        return eval_result

    async def _process_image(self, img_path: Path) -> ImageResult:
        """Process a single image.

        Args:
            img_path: Path to image

        Returns:
            Image result
        """
        try:
            # Load image
            img = Image.open(img_path).convert("RGB")
            frame = np.array(img)

            # Get state stub
            state = self.state_stubs.get(img_path.name, {"health": "unknown"})

            # Time the planning
            start = time.time()
            plan = await self.planner.plan(frame, state)
            latency_ms = (time.time() - start) * 1000

            return ImageResult(
                image_path=str(img_path),
                plan=plan,
                latency_ms=latency_ms,
            )

        except Exception as e:
            logger.error(f"Error processing {img_path}: {e}")
            return ImageResult(
                image_path=str(img_path),
                plan=None,
                latency_ms=0,
                error=str(e),
            )

    def _calculate_metrics(self) -> OfflineEvalResult:
        """Calculate evaluation metrics from results."""
        total = len(self.results)
        valid_plans = [r for r in self.results if r.plan is not None]
        valid_count = len(valid_plans)

        # Latencies
        latencies = [r.latency_ms for r in self.results if r.plan is not None]
        avg_latency = np.mean(latencies) if latencies else 0
        p95_latency = np.percentile(latencies, 95) if latencies else 0

        # Confidences
        confidences = [r.plan.confidence for r in valid_plans]
        avg_confidence = np.mean(confidences) if confidences else 0

        # Constraint distribution
        constraint_dist: dict[str, int] = {}
        for r in valid_plans:
            for c in r.plan.constraints:
                key = f"{c.type.value}_{c.action.value if c.action else 'none'}"
                constraint_dist[key] = constraint_dist.get(key, 0) + 1

        # Intent distribution (rough categorization)
        intent_dist: dict[str, int] = {}
        for r in valid_plans:
            # Simple keyword extraction
            intent = r.plan.intent.lower()
            if "attack" in intent or "engage" in intent or "fight" in intent:
                category = "combat"
            elif "explore" in intent or "move" in intent or "go" in intent:
                category = "exploration"
            elif "defend" in intent or "retreat" in intent or "evade" in intent:
                category = "defensive"
            elif "interact" in intent or "use" in intent or "pick" in intent:
                category = "interaction"
            else:
                category = "other"
            intent_dist[category] = intent_dist.get(category, 0) + 1

        # Consistency score
        consistency = self._calculate_consistency()

        # Collect errors
        errors = [r.error for r in self.results if r.error is not None]

        return OfflineEvalResult(
            total_images=total,
            json_valid_count=valid_count,
            json_valid_rate=valid_count / total if total > 0 else 0,
            avg_latency_ms=avg_latency,
            p95_latency_ms=p95_latency,
            avg_confidence=avg_confidence,
            constraint_distribution=constraint_dist,
            intent_distribution=intent_dist,
            consistency_score=consistency,
            errors=errors,
        )

    def _calculate_consistency(self) -> float:
        """Calculate consistency score.

        Measures whether similar images produce similar plans.

        Returns:
            Consistency score (0-1)
        """
        # Group by base name (e.g., scene_001_a.png, scene_001_b.png)
        groups: dict[str, list[ImageResult]] = {}
        for r in self.results:
            if r.plan is None:
                continue
            path = Path(r.image_path)
            # Try to extract base name
            base = path.stem.rsplit("_", 1)[0]
            groups.setdefault(base, []).append(r)

        # Calculate intent match rate within groups
        matches = 0
        total = 0

        for results in groups.values():
            if len(results) < 2:
                continue

            # Compare consecutive plans
            for i in range(len(results) - 1):
                total += 1
                r1, r2 = results[i], results[i + 1]
                if r1.plan and r2.plan:
                    # Check intent similarity (simple string match)
                    if r1.plan.intent == r2.plan.intent:
                        matches += 1
                    # Also accept same skill mode
                    elif r1.plan.skill.mode == r2.plan.skill.mode:
                        matches += 0.5

        return matches / total if total > 0 else 1.0

    def _save_results(self, eval_result: OfflineEvalResult) -> None:
        """Save results to output directory."""
        if self.output_dir is None:
            return

        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Save summary
        summary_path = self.output_dir / "eval_summary.json"
        with open(summary_path, "w") as f:
            json.dump(eval_result.to_dict(), f, indent=2)

        # Save detailed results
        details_path = self.output_dir / "eval_details.jsonl"
        with open(details_path, "w") as f:
            for r in self.results:
                entry = {
                    "image": r.image_path,
                    "latency_ms": r.latency_ms,
                    "plan": r.plan.model_dump() if r.plan else None,
                    "error": r.error,
                }
                f.write(json.dumps(entry) + "\n")

        logger.info(f"Results saved to {self.output_dir}")


async def run_offline_eval(
    images_dir: Path | str,
    planner_url: str = "http://localhost:8000",
    output_dir: Path | str | None = None,
    max_images: int | None = None,
) -> OfflineEvalResult:
    """Convenience function to run offline evaluation.

    Args:
        images_dir: Directory with test images
        planner_url: Monet server URL
        output_dir: Output directory for results
        max_images: Maximum images to process

    Returns:
        Evaluation result
    """
    async with MonetPlanner(base_url=planner_url) as planner:
        evaluator = OfflineEvaluator(
            images_dir=images_dir,
            planner=planner,
            output_dir=output_dir,
        )
        return await evaluator.run(max_images=max_images)
