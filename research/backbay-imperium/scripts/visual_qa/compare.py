#!/usr/bin/env python3
"""
Visual QA Comparison Tool

Compares captured screenshots against baselines using perceptual hashing.
Generates visual diffs and reports pass/fail status.

Usage:
    python compare.py --captures <dir> --baselines <dir> --output <dir>
    python compare.py --update-baselines  # Copy captures to baselines
"""

import argparse
import json
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont
    import imagehash
except ImportError:
    print("ERROR: Required packages not installed.")
    print("Run: pip install Pillow imagehash")
    sys.exit(1)


@dataclass
class CompareResult:
    """Result of comparing two images."""

    name: str
    passed: bool
    hash_distance: int
    threshold: int
    baseline_path: Optional[Path]
    capture_path: Path
    diff_path: Optional[Path]
    error: Optional[str] = None
    # Terrain-specific fields
    category: str = "general"
    is_terrain_capture: bool = False
    terrain_metrics: Optional[dict] = None


@dataclass
class TerrainMetrics:
    """Quality metrics for terrain captures."""

    color_variance: float  # Higher = more varied colors
    edge_density: float  # Higher = more detail/texture
    brightness_mean: float  # Average brightness
    saturation_mean: float  # Average color saturation
    histogram_similarity: float  # Histogram similarity to baseline (0-1)


# Thresholds for perceptual hash distance (lower = more similar)
# 0 = identical, 64 = completely different
HASH_THRESHOLD_STRICT = 5  # Very similar (minor anti-aliasing differences)
HASH_THRESHOLD_NORMAL = 10  # Similar (small rendering variations)
HASH_THRESHOLD_LOOSE = 20  # Roughly similar (layout/structure intact)

DEFAULT_THRESHOLD = HASH_THRESHOLD_NORMAL


def compute_phash(
    image_path: Path, hash_size: int = 16
) -> Optional[imagehash.ImageHash]:
    """Compute perceptual hash of an image."""
    try:
        img = Image.open(image_path)
        return imagehash.phash(img, hash_size=hash_size)
    except Exception as e:
        print(f"  ERROR computing hash for {image_path}: {e}")
        return None


def compute_dhash(
    image_path: Path, hash_size: int = 16
) -> Optional[imagehash.ImageHash]:
    """Compute difference hash of an image (better for structural changes)."""
    try:
        img = Image.open(image_path)
        return imagehash.dhash(img, hash_size=hash_size)
    except Exception as e:
        print(f"  ERROR computing dhash for {image_path}: {e}")
        return None


def compute_terrain_metrics(
    capture_path: Path, baseline_path: Optional[Path] = None
) -> Optional[TerrainMetrics]:
    """Compute quality metrics for terrain captures."""
    try:
        import numpy as np
        from scipy import ndimage
    except ImportError:
        # Fallback without scipy
        return _compute_terrain_metrics_basic(capture_path, baseline_path)

    try:
        img = Image.open(capture_path).convert("RGB")
        pixels = np.array(img)

        # Color variance (std dev of RGB channels)
        color_variance = float(np.std(pixels))

        # Edge density using Sobel filter
        gray = np.array(img.convert("L")).astype(float)
        edges_x = ndimage.sobel(gray, axis=0)
        edges_y = ndimage.sobel(gray, axis=1)
        edge_magnitude = np.sqrt(edges_x**2 + edges_y**2)
        edge_density = float(np.mean(edge_magnitude) / 255.0)

        # Brightness (mean of grayscale)
        brightness_mean = float(np.mean(gray) / 255.0)

        # Saturation (convert to HSV-like)
        r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
        max_rgb = np.maximum(np.maximum(r, g), b)
        min_rgb = np.minimum(np.minimum(r, g), b)
        saturation = np.where(max_rgb > 0, (max_rgb - min_rgb) / max_rgb, 0)
        saturation_mean = float(np.mean(saturation))

        # Histogram similarity to baseline
        histogram_similarity = 1.0
        if baseline_path and baseline_path.exists():
            baseline_img = Image.open(baseline_path).convert("RGB")
            baseline_pixels = np.array(baseline_img)

            # Compare histograms
            hist_capture = np.histogram(pixels.flatten(), bins=256, range=(0, 255))[0]
            hist_baseline = np.histogram(
                baseline_pixels.flatten(), bins=256, range=(0, 255)
            )[0]

            # Normalize and compute correlation
            hist_capture = hist_capture / (hist_capture.sum() + 1e-10)
            hist_baseline = hist_baseline / (hist_baseline.sum() + 1e-10)
            histogram_similarity = float(np.corrcoef(hist_capture, hist_baseline)[0, 1])
            histogram_similarity = max(0.0, histogram_similarity)  # Clamp to positive

        return TerrainMetrics(
            color_variance=round(color_variance, 3),
            edge_density=round(edge_density, 4),
            brightness_mean=round(brightness_mean, 3),
            saturation_mean=round(saturation_mean, 3),
            histogram_similarity=round(histogram_similarity, 4),
        )

    except Exception as e:
        print(f"  WARNING: Could not compute terrain metrics for {capture_path}: {e}")
        return None


def _compute_terrain_metrics_basic(
    capture_path: Path, baseline_path: Optional[Path] = None
) -> Optional[TerrainMetrics]:
    """Compute basic terrain metrics without scipy (fallback)."""
    try:
        img = Image.open(capture_path).convert("RGB")
        pixels = list(img.getdata())

        # Basic color variance
        r_vals = [p[0] for p in pixels]
        g_vals = [p[1] for p in pixels]
        b_vals = [p[2] for p in pixels]

        def std(vals):
            mean = sum(vals) / len(vals)
            variance = sum((x - mean) ** 2 for x in vals) / len(vals)
            return variance**0.5

        color_variance = (std(r_vals) + std(g_vals) + std(b_vals)) / 3

        # Brightness
        gray_vals = [(p[0] + p[1] + p[2]) / 3 for p in pixels]
        brightness_mean = sum(gray_vals) / len(gray_vals) / 255.0

        # Saturation
        sat_vals = []
        for p in pixels:
            max_c = max(p)
            min_c = min(p)
            if max_c > 0:
                sat_vals.append((max_c - min_c) / max_c)
            else:
                sat_vals.append(0)
        saturation_mean = sum(sat_vals) / len(sat_vals)

        return TerrainMetrics(
            color_variance=round(color_variance, 3),
            edge_density=0.0,  # Not computed in basic mode
            brightness_mean=round(brightness_mean, 3),
            saturation_mean=round(saturation_mean, 3),
            histogram_similarity=1.0,  # Not computed in basic mode
        )

    except Exception as e:
        print(f"  WARNING: Could not compute basic terrain metrics: {e}")
        return None


def load_manifest(captures_dir: Path) -> dict:
    """Load capture manifest for terrain metadata."""
    manifest_path = captures_dir / "manifest.json"
    if manifest_path.exists():
        try:
            with open(manifest_path) as f:
                return json.load(f)
        except Exception as e:
            print(f"  WARNING: Could not load manifest: {e}")
    return {}


def get_capture_metadata(manifest: dict, capture_name: str) -> dict:
    """Get metadata for a specific capture from manifest."""
    captures = manifest.get("captures", [])
    for capture in captures:
        if capture.get("name") == capture_name:
            return capture
    return {}


def generate_diff_image(
    baseline_path: Path, capture_path: Path, output_path: Path
) -> bool:
    """Generate a visual diff image highlighting differences."""
    try:
        baseline = Image.open(baseline_path).convert("RGB")
        capture = Image.open(capture_path).convert("RGB")

        # Resize if dimensions don't match
        if baseline.size != capture.size:
            capture = capture.resize(baseline.size, Image.Resampling.LANCZOS)

        # Compute difference
        diff = ImageChops.difference(baseline, capture)

        # Amplify differences for visibility
        diff = diff.point(lambda x: min(255, x * 3))

        # Create side-by-side comparison
        width = baseline.width
        height = baseline.height
        comparison = Image.new("RGB", (width * 3, height + 30), (40, 40, 40))

        # Add labels
        draw = ImageDraw.Draw(comparison)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
        except Exception:
            font = ImageFont.load_default()

        draw.text((width // 2 - 40, 5), "BASELINE", fill=(200, 200, 200), font=font)
        draw.text(
            (width + width // 2 - 40, 5), "CAPTURE", fill=(200, 200, 200), font=font
        )
        draw.text(
            (width * 2 + width // 2 - 30, 5), "DIFF", fill=(255, 100, 100), font=font
        )

        # Paste images
        comparison.paste(baseline, (0, 30))
        comparison.paste(capture, (width, 30))
        comparison.paste(diff, (width * 2, 30))

        comparison.save(output_path)
        return True
    except Exception as e:
        print(f"  ERROR generating diff: {e}")
        return False


def compare_images(
    capture_path: Path,
    baseline_path: Path,
    diff_output_path: Optional[Path] = None,
    threshold: int = DEFAULT_THRESHOLD,
    metadata: Optional[dict] = None,
    compute_metrics: bool = False,
) -> CompareResult:
    """Compare a capture against its baseline."""
    name = capture_path.stem
    metadata = metadata or {}

    # Extract terrain metadata
    category = metadata.get("category", "general")
    is_terrain_capture = metadata.get("is_terrain_capture", False)

    # Check baseline exists
    if not baseline_path.exists():
        return CompareResult(
            name=name,
            passed=False,
            hash_distance=-1,
            threshold=threshold,
            baseline_path=None,
            capture_path=capture_path,
            diff_path=None,
            error="Baseline not found",
            category=category,
            is_terrain_capture=is_terrain_capture,
        )

    # Compute hashes
    capture_hash = compute_phash(capture_path)
    baseline_hash = compute_phash(baseline_path)

    if capture_hash is None or baseline_hash is None:
        return CompareResult(
            name=name,
            passed=False,
            hash_distance=-1,
            threshold=threshold,
            baseline_path=baseline_path,
            capture_path=capture_path,
            diff_path=None,
            error="Failed to compute hash",
            category=category,
            is_terrain_capture=is_terrain_capture,
        )

    # Calculate distance
    distance = capture_hash - baseline_hash
    passed = distance <= threshold

    # Generate diff image if failed or requested
    diff_path = None
    if diff_output_path and (not passed or diff_output_path.parent.exists()):
        diff_output_path.parent.mkdir(parents=True, exist_ok=True)
        if generate_diff_image(baseline_path, capture_path, diff_output_path):
            diff_path = diff_output_path

    # Compute terrain metrics if this is a terrain capture
    terrain_metrics_dict = None
    if compute_metrics and is_terrain_capture:
        metrics = compute_terrain_metrics(capture_path, baseline_path)
        if metrics:
            terrain_metrics_dict = {
                "color_variance": metrics.color_variance,
                "edge_density": metrics.edge_density,
                "brightness_mean": metrics.brightness_mean,
                "saturation_mean": metrics.saturation_mean,
                "histogram_similarity": metrics.histogram_similarity,
            }

    return CompareResult(
        name=name,
        passed=passed,
        hash_distance=distance,
        threshold=threshold,
        baseline_path=baseline_path,
        capture_path=capture_path,
        diff_path=diff_path,
        category=category,
        is_terrain_capture=is_terrain_capture,
        terrain_metrics=terrain_metrics_dict,
    )


def run_comparison(
    captures_dir: Path,
    baselines_dir: Path,
    output_dir: Path,
    threshold: int = DEFAULT_THRESHOLD,
    compute_metrics: bool = False,
) -> list[CompareResult]:
    """Run comparison for all captures."""
    results = []

    # Load manifest for terrain metadata
    manifest = load_manifest(captures_dir)
    terrain_mode = manifest.get("mode", "basic")
    terrain_distribution = manifest.get("terrain_distribution", {})

    # Find all PNG captures
    captures = list(captures_dir.glob("*.png"))
    if not captures:
        print(f"No captures found in {captures_dir}")
        return results

    print(f"\nComparing {len(captures)} captures against baselines...")
    print(f"  Captures:  {captures_dir}")
    print(f"  Baselines: {baselines_dir}")
    print(f"  Threshold: {threshold} (0=identical, 64=different)")
    if terrain_mode != "basic":
        print(f"  Mode: {terrain_mode}")
        if terrain_distribution:
            print(f"  Terrain types: {', '.join(terrain_distribution.keys())}")
    print()

    for capture_path in sorted(captures):
        name = capture_path.stem
        baseline_path = baselines_dir / capture_path.name
        diff_path = output_dir / "diffs" / f"{name}_diff.png"

        # Get metadata for this capture
        metadata = get_capture_metadata(manifest, name)

        result = compare_images(
            capture_path=capture_path,
            baseline_path=baseline_path,
            diff_output_path=diff_path,
            threshold=threshold,
            metadata=metadata,
            compute_metrics=compute_metrics,
        )
        results.append(result)

        # Print result with category
        status = "[PASS]" if result.passed else "[FAIL]"
        category_str = f" [{result.category}]" if result.is_terrain_capture else ""
        if result.error:
            print(f"  {status} {name}{category_str}: {result.error}")
        else:
            metrics_str = ""
            if result.terrain_metrics:
                metrics_str = f" (edge={result.terrain_metrics['edge_density']:.3f}, hist={result.terrain_metrics['histogram_similarity']:.3f})"
            print(
                f"  {status} {name}{category_str}: distance={result.hash_distance}{metrics_str}"
            )

    return results


def update_baselines(captures_dir: Path, baselines_dir: Path) -> int:
    """Copy captures to baselines directory."""
    import shutil

    baselines_dir.mkdir(parents=True, exist_ok=True)

    captures = list(captures_dir.glob("*.png"))
    if not captures:
        print(f"No captures found in {captures_dir}")
        return 0

    print(f"\nUpdating baselines from {len(captures)} captures...")

    for capture_path in captures:
        dest = baselines_dir / capture_path.name
        shutil.copy2(capture_path, dest)
        print(f"  {capture_path.name} -> {dest}")

    # Copy manifest if exists
    manifest = captures_dir / "manifest.json"
    if manifest.exists():
        shutil.copy2(manifest, baselines_dir / "manifest.json")
        print(f"  manifest.json -> {baselines_dir / 'manifest.json'}")

    print(f"\nBaselines updated: {len(captures)} files")
    return len(captures)


def print_summary(results: list[CompareResult]) -> bool:
    """Print summary and return True if all passed."""
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    # Count terrain vs basic captures
    terrain_results = [r for r in results if r.is_terrain_capture]
    basic_results = [r for r in results if not r.is_terrain_capture]

    terrain_passed = sum(1 for r in terrain_results if r.passed)
    basic_passed = sum(1 for r in basic_results if r.passed)

    print("\n" + "=" * 50)
    print("VISUAL QA SUMMARY")
    print("=" * 50)
    print(f"  PASSED: {passed}")
    print(f"  FAILED: {failed}")
    print(f"  TOTAL:  {total}")

    if terrain_results:
        print(f"\n  Basic captures:   {basic_passed}/{len(basic_results)} passed")
        print(f"  Terrain captures: {terrain_passed}/{len(terrain_results)} passed")

        # Group terrain results by category
        categories = {}
        for r in terrain_results:
            cat = r.category
            if cat not in categories:
                categories[cat] = {"passed": 0, "total": 0}
            categories[cat]["total"] += 1
            if r.passed:
                categories[cat]["passed"] += 1

        if categories:
            print("\n  By category:")
            for cat, stats in sorted(categories.items()):
                status = "OK" if stats["passed"] == stats["total"] else "FAIL"
                print(f"    [{status}] {cat}: {stats['passed']}/{stats['total']}")

    print("=" * 50)

    if failed > 0:
        print("\nFailed captures:")
        for r in results:
            if not r.passed:
                reason = r.error or f"distance={r.hash_distance}"
                category_str = f" [{r.category}]" if r.is_terrain_capture else ""
                print(f"  - {r.name}{category_str}: {reason}")
                if r.diff_path:
                    print(f"    Diff: {r.diff_path}")

    return failed == 0


def write_report(results: list[CompareResult], output_dir: Path) -> None:
    """Write JSON report of results."""
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "visual_qa_report.json"

    # Separate terrain and basic results
    terrain_results = [r for r in results if r.is_terrain_capture]
    basic_results = [r for r in results if not r.is_terrain_capture]

    # Build category summary
    category_summary = {}
    for r in terrain_results:
        cat = r.category
        if cat not in category_summary:
            category_summary[cat] = {"passed": 0, "failed": 0, "total": 0}
        category_summary[cat]["total"] += 1
        if r.passed:
            category_summary[cat]["passed"] += 1
        else:
            category_summary[cat]["failed"] += 1

    report = {
        "schema_version": "visual_qa.report.v2",
        "summary": {
            "passed": sum(1 for r in results if r.passed),
            "failed": sum(1 for r in results if not r.passed),
            "total": len(results),
            "basic_captures": len(basic_results),
            "terrain_captures": len(terrain_results),
        },
        "category_summary": category_summary,
        "results": [
            {
                "name": r.name,
                "passed": bool(r.passed),
                "hash_distance": int(r.hash_distance),
                "threshold": int(r.threshold),
                "baseline_path": str(r.baseline_path) if r.baseline_path else None,
                "capture_path": str(r.capture_path),
                "diff_path": str(r.diff_path) if r.diff_path else None,
                "error": r.error,
                "category": r.category,
                "is_terrain_capture": r.is_terrain_capture,
                "terrain_metrics": r.terrain_metrics,
            }
            for r in results
        ],
    }

    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nReport written: {report_path}")


def main():
    parser = argparse.ArgumentParser(description="Visual QA Comparison Tool")
    parser.add_argument(
        "--captures",
        type=Path,
        default=Path("client/tests/visual_qa_captures"),
        help="Directory containing captured screenshots",
    )
    parser.add_argument(
        "--baselines",
        type=Path,
        default=Path("client/tests/visual_qa_baselines"),
        help="Directory containing baseline images",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("client/tests/visual_qa_output"),
        help="Directory for diff images and reports",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=DEFAULT_THRESHOLD,
        help=f"Hash distance threshold (default: {DEFAULT_THRESHOLD})",
    )
    parser.add_argument(
        "--update-baselines",
        action="store_true",
        help="Update baselines from current captures",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help=f"Use strict threshold ({HASH_THRESHOLD_STRICT})",
    )
    parser.add_argument(
        "--loose",
        action="store_true",
        help=f"Use loose threshold ({HASH_THRESHOLD_LOOSE})",
    )
    parser.add_argument(
        "--metrics",
        action="store_true",
        help="Compute terrain quality metrics for terrain captures",
    )

    args = parser.parse_args()

    # Determine threshold
    threshold = args.threshold
    if args.strict:
        threshold = HASH_THRESHOLD_STRICT
    elif args.loose:
        threshold = HASH_THRESHOLD_LOOSE

    print("=" * 50)
    print("VISUAL QA COMPARISON TOOL")
    print("=" * 50)

    if args.update_baselines:
        count = update_baselines(args.captures, args.baselines)
        sys.exit(0 if count > 0 else 1)

    # Run comparison
    results = run_comparison(
        captures_dir=args.captures,
        baselines_dir=args.baselines,
        output_dir=args.output,
        threshold=threshold,
        compute_metrics=args.metrics,
    )

    if not results:
        print("\nNo comparisons performed.")
        sys.exit(1)

    # Write report
    write_report(results, args.output)

    # Print summary and exit with appropriate code
    all_passed = print_summary(results)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
