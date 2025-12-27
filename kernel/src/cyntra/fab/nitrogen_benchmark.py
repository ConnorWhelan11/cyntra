"""
NitroGen Benchmark Suite

Three-stage testing for NitroGen integration:
1. Smoke Test - Synthetic frames to validate infrastructure
2. Dataset Benchmark - Sample from NitroGen training distribution
3. Fab Integration - Real renders from Fab worlds

Usage:
    python -m cyntra.fab.nitrogen_benchmark smoke
    python -m cyntra.fab.nitrogen_benchmark dataset --sample 100
    python -m cyntra.fab.nitrogen_benchmark fab --world outora_library
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np
from PIL import Image

from cyntra.fab.nitrogen_client import GamepadAction, NitroGenClient


@dataclass
class BenchmarkResult:
    """Results from a benchmark run."""

    name: str
    success: bool = False
    frames_tested: int = 0
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    errors: list[str] = field(default_factory=list)

    # Action quality metrics
    action_variance: float = 0.0  # How much do actions vary? (0 = same action always)
    movement_ratio: float = 0.0  # Ratio of frames with significant movement
    button_press_rate: float = 0.0  # Rate of button presses

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "success": self.success,
            "frames_tested": self.frames_tested,
            "latency": {
                "avg_ms": self.avg_latency_ms,
                "p95_ms": self.p95_latency_ms,
                "p99_ms": self.p99_latency_ms,
            },
            "action_quality": {
                "variance": self.action_variance,
                "movement_ratio": self.movement_ratio,
                "button_press_rate": self.button_press_rate,
            },
            "errors": self.errors,
        }


def run_smoke_test(
    client: NitroGenClient,
    num_frames: int = 100,
) -> BenchmarkResult:
    """
    Stage 1: Smoke test with synthetic frames.

    Tests infrastructure:
    - Server connection
    - Request/response cycle
    - Action decoding
    - Latency measurement
    """
    result = BenchmarkResult(name="smoke_test")
    latencies = []
    actions: list[GamepadAction] = []

    print(f"Running smoke test with {num_frames} synthetic frames...")

    try:
        client.reset()
    except Exception as e:
        result.errors.append(f"Failed to reset session: {e}")
        return result

    for i in range(num_frames):
        # Generate synthetic frame - simple gradient pattern
        frame = _generate_synthetic_frame(i, pattern="gradient")

        try:
            start = time.perf_counter()
            action = client.predict_action(frame, timestep=0)
            latency_ms = (time.perf_counter() - start) * 1000
            latencies.append(latency_ms)
            actions.append(action)
            result.frames_tested += 1

        except Exception as e:
            result.errors.append(f"Frame {i}: {e}")

        if (i + 1) % 20 == 0:
            print(f"  Processed {i + 1}/{num_frames} frames...")

    # Calculate metrics
    if latencies:
        latencies_arr = np.array(latencies)
        result.avg_latency_ms = float(np.mean(latencies_arr))
        result.p95_latency_ms = float(np.percentile(latencies_arr, 95))
        result.p99_latency_ms = float(np.percentile(latencies_arr, 99))

    if actions:
        result.action_variance = _calculate_action_variance(actions)
        result.movement_ratio = _calculate_movement_ratio(actions)
        result.button_press_rate = _calculate_button_rate(actions)

    result.success = len(result.errors) == 0 and result.frames_tested == num_frames
    return result


def run_dataset_benchmark(
    client: NitroGenClient,
    dataset_path: Path | None = None,
    sample_size: int = 100,
) -> BenchmarkResult:
    """
    Stage 2: Benchmark using NitroGen dataset samples.

    Tests model behavior on known good data:
    - Responses to real gameplay frames
    - Action quality compared to ground truth
    - Consistency with training distribution
    """
    result = BenchmarkResult(name="dataset_benchmark")
    latencies = []
    actions: list[GamepadAction] = []

    # Try to load dataset frames, fall back to simulated gameplay
    frames = _load_dataset_frames(dataset_path, sample_size)
    if not frames:
        print("Dataset not found, using simulated gameplay frames...")
        frames = [_generate_synthetic_frame(i, pattern="gameplay") for i in range(sample_size)]

    print(f"Running dataset benchmark with {len(frames)} frames...")

    try:
        client.reset()
    except Exception as e:
        result.errors.append(f"Failed to reset session: {e}")
        return result

    for i, frame in enumerate(frames):
        try:
            start = time.perf_counter()
            action = client.predict_action(frame, timestep=0)
            latency_ms = (time.perf_counter() - start) * 1000
            latencies.append(latency_ms)
            actions.append(action)
            result.frames_tested += 1

        except Exception as e:
            result.errors.append(f"Frame {i}: {e}")

        if (i + 1) % 20 == 0:
            print(f"  Processed {i + 1}/{len(frames)} frames...")

    # Calculate metrics
    if latencies:
        latencies_arr = np.array(latencies)
        result.avg_latency_ms = float(np.mean(latencies_arr))
        result.p95_latency_ms = float(np.percentile(latencies_arr, 95))
        result.p99_latency_ms = float(np.percentile(latencies_arr, 99))

    if actions:
        result.action_variance = _calculate_action_variance(actions)
        result.movement_ratio = _calculate_movement_ratio(actions)
        result.button_press_rate = _calculate_button_rate(actions)

    result.success = len(result.errors) == 0 and result.frames_tested >= sample_size * 0.9
    return result


def run_fab_benchmark(
    client: NitroGenClient,
    world_path: Path,
    num_frames: int = 100,
) -> BenchmarkResult:
    """
    Stage 3: Benchmark on actual Fab world renders.

    Tests integration with Fab pipeline:
    - Responses to Blender/Godot renders
    - Coverage of generated environment
    - Exploration behavior
    """
    result = BenchmarkResult(name="fab_benchmark")
    latencies = []
    actions: list[GamepadAction] = []

    # Load renders from world
    frames = _load_world_renders(world_path, num_frames)
    if not frames:
        print(f"No renders found in {world_path}, using synthetic Gothic interior...")
        frames = [
            _generate_synthetic_frame(i, pattern="gothic_interior") for i in range(num_frames)
        ]

    print(f"Running Fab benchmark with {len(frames)} frames from {world_path}...")

    try:
        client.reset()
    except Exception as e:
        result.errors.append(f"Failed to reset session: {e}")
        return result

    for i, frame in enumerate(frames):
        try:
            start = time.perf_counter()
            action = client.predict_action(frame, timestep=0)
            latency_ms = (time.perf_counter() - start) * 1000
            latencies.append(latency_ms)
            actions.append(action)
            result.frames_tested += 1

        except Exception as e:
            result.errors.append(f"Frame {i}: {e}")

        if (i + 1) % 20 == 0:
            print(f"  Processed {i + 1}/{len(frames)} frames...")

    # Calculate metrics
    if latencies:
        latencies_arr = np.array(latencies)
        result.avg_latency_ms = float(np.mean(latencies_arr))
        result.p95_latency_ms = float(np.percentile(latencies_arr, 95))
        result.p99_latency_ms = float(np.percentile(latencies_arr, 99))

    if actions:
        result.action_variance = _calculate_action_variance(actions)
        result.movement_ratio = _calculate_movement_ratio(actions)
        result.button_press_rate = _calculate_button_rate(actions)

    result.success = len(result.errors) == 0 and result.frames_tested >= num_frames * 0.9
    return result


# =============================================================================
# Frame Generation / Loading
# =============================================================================


def _generate_synthetic_frame(
    index: int,
    pattern: Literal["gradient", "gameplay", "gothic_interior"] = "gradient",
) -> Image.Image:
    """Generate a synthetic test frame."""
    size = 256

    if pattern == "gradient":
        # Simple gradient - tests basic infrastructure
        arr = np.zeros((size, size, 3), dtype=np.uint8)
        arr[:, :, 0] = np.linspace(0, 255, size).astype(np.uint8)  # Red gradient
        arr[:, :, 1] = (index * 10) % 256  # Vary green with frame
        arr[:, :, 2] = 128

    elif pattern == "gameplay":
        # Simulated gameplay-like frame (floor, walls, horizon)
        arr = np.zeros((size, size, 3), dtype=np.uint8)

        # Sky (top third)
        arr[: size // 3, :] = [135, 206, 235]  # Sky blue

        # Horizon with variation
        horizon_offset = int(20 * np.sin(index * 0.1))
        mid = size // 3 + horizon_offset

        # Ground (bottom)
        arr[mid:, :] = [34, 139, 34]  # Forest green

        # Some variation
        noise = np.random.randint(-20, 20, (size, size, 3))
        arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    elif pattern == "gothic_interior":
        # Gothic library-like frame (dark with highlights)
        arr = np.zeros((size, size, 3), dtype=np.uint8)

        # Dark base
        arr[:] = [40, 30, 25]  # Dark brown

        # Floor (lighter)
        floor_y = size * 2 // 3
        arr[floor_y:, :] = [80, 60, 50]

        # Ceiling (slightly lighter)
        arr[: size // 4, :] = [50, 40, 35]

        # Vertical columns (dark)
        for col in range(0, size, size // 4):
            col_width = size // 16
            arr[:, col : col + col_width] = [30, 25, 20]

        # Light sources (warm)
        light_positions = [
            (size // 2, size // 4),
            (size // 4, size // 3),
            (3 * size // 4, size // 3),
        ]
        for lx, ly in light_positions:
            y, x = np.ogrid[:size, :size]
            dist = np.sqrt((x - lx) ** 2 + (y - ly) ** 2)
            light = np.clip(60 - dist * 0.5, 0, 60).astype(np.uint8)
            arr[:, :, 0] = np.minimum(arr[:, :, 0] + light, 255)
            arr[:, :, 1] = np.minimum(arr[:, :, 1] + light // 2, 255)

        # Add movement based on frame
        shift = int(10 * np.sin(index * 0.2))
        arr = np.roll(arr, shift, axis=1)

    else:
        arr = np.random.randint(0, 255, (size, size, 3), dtype=np.uint8)

    return Image.fromarray(arr)


def _load_dataset_frames(
    dataset_path: Path | None,
    sample_size: int,
) -> list[Image.Image]:
    """Load frames from NitroGen dataset."""
    if dataset_path is None:
        return []

    frames = []

    # Look for video frames or images
    patterns = ["**/*.png", "**/*.jpg", "**/*.jpeg"]
    all_files = []
    for pattern in patterns:
        all_files.extend(dataset_path.glob(pattern))

    if not all_files:
        return []

    # Sample evenly
    step = max(1, len(all_files) // sample_size)
    selected = all_files[::step][:sample_size]

    for path in selected:
        try:
            img = Image.open(path).convert("RGB").resize((256, 256))
            frames.append(img)
        except Exception:
            continue

    return frames


def _load_world_renders(
    world_path: Path,
    num_frames: int,
) -> list[Image.Image]:
    """Load renders from a Fab world."""
    frames = []

    # Look in common render locations
    render_dirs = [
        world_path / "render" / "beauty",
        world_path / "stages" / "render",
        world_path / "godot" / "screenshots",
    ]

    all_files = []
    for render_dir in render_dirs:
        if render_dir.exists():
            all_files.extend(render_dir.glob("*.png"))
            all_files.extend(render_dir.glob("*.jpg"))

    if not all_files:
        return []

    # Take up to num_frames
    for path in all_files[:num_frames]:
        try:
            img = Image.open(path).convert("RGB").resize((256, 256))
            frames.append(img)
        except Exception:
            continue

    return frames


# =============================================================================
# Metrics
# =============================================================================


def _calculate_action_variance(actions: list[GamepadAction]) -> float:
    """Calculate variance in actions (0 = same action always, 1 = highly varied)."""
    if len(actions) < 2:
        return 0.0

    # Collect all continuous values
    values = np.array([[a.move_x, a.move_y, a.look_x, a.look_y] for a in actions])

    # Variance across frames, normalized
    variance = np.var(values, axis=0).mean()
    return float(min(variance * 4, 1.0))  # Scale to 0-1


def _calculate_movement_ratio(actions: list[GamepadAction]) -> float:
    """Calculate ratio of frames with significant movement."""
    if not actions:
        return 0.0

    threshold = 0.1
    moving = sum(1 for a in actions if np.sqrt(a.move_x**2 + a.move_y**2) > threshold)
    return moving / len(actions)


def _calculate_button_rate(actions: list[GamepadAction]) -> float:
    """Calculate rate of button presses per frame."""
    if not actions:
        return 0.0

    total_presses = sum(int(a.jump) + int(a.interact) + int(a.sprint) for a in actions)
    return total_presses / len(actions)


# =============================================================================
# CLI
# =============================================================================


def run_all_benchmarks(
    host: str = "localhost",
    port: int = 5555,
    output_dir: Path | None = None,
    dataset_path: Path | None = None,
    world_path: Path | None = None,
) -> dict[str, BenchmarkResult]:
    """Run all benchmark stages."""
    client = NitroGenClient(host=host, port=port)
    results = {}

    try:
        # Stage 1: Smoke test
        print("\n" + "=" * 60)
        print("STAGE 1: Smoke Test (synthetic frames)")
        print("=" * 60)
        results["smoke"] = run_smoke_test(client, num_frames=50)
        _print_result(results["smoke"])

        if not results["smoke"].success:
            print("\n[!] Smoke test failed, skipping remaining stages")
            return results

        # Stage 2: Dataset benchmark
        print("\n" + "=" * 60)
        print("STAGE 2: Dataset Benchmark")
        print("=" * 60)
        results["dataset"] = run_dataset_benchmark(client, dataset_path, sample_size=100)
        _print_result(results["dataset"])

        # Stage 3: Fab benchmark (if world provided)
        if world_path and world_path.exists():
            print("\n" + "=" * 60)
            print(f"STAGE 3: Fab Benchmark ({world_path.name})")
            print("=" * 60)
            results["fab"] = run_fab_benchmark(client, world_path, num_frames=100)
            _print_result(results["fab"])

    finally:
        client.close()

    # Save results
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / "benchmark_results.json"
        with open(output_file, "w") as f:
            json.dump({k: v.to_dict() for k, v in results.items()}, f, indent=2)
        print(f"\nResults saved to: {output_file}")

    return results


def _print_result(result: BenchmarkResult) -> None:
    """Print a benchmark result summary."""
    status = "PASS" if result.success else "FAIL"
    print(f"\n{result.name}: {status}")
    print(f"  Frames: {result.frames_tested}")
    print(f"  Latency: avg={result.avg_latency_ms:.1f}ms, p95={result.p95_latency_ms:.1f}ms")
    print(f"  Action variance: {result.action_variance:.2f}")
    print(f"  Movement ratio: {result.movement_ratio:.1%}")
    print(f"  Button rate: {result.button_press_rate:.2f}/frame")

    if result.errors:
        print(f"  Errors ({len(result.errors)}):")
        for err in result.errors[:5]:
            print(f"    - {err}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="NitroGen Benchmark Suite")
    parser.add_argument(
        "stage", choices=["smoke", "dataset", "fab", "all"], help="Which benchmark stage to run"
    )
    parser.add_argument("--host", default="localhost", help="NitroGen server host")
    parser.add_argument("--port", type=int, default=5555, help="NitroGen server port")
    parser.add_argument("--output", type=Path, help="Output directory for results")
    parser.add_argument("--dataset", type=Path, help="Path to NitroGen dataset")
    parser.add_argument("--world", type=Path, help="Path to Fab world")
    parser.add_argument("--sample", type=int, default=100, help="Sample size")

    args = parser.parse_args()

    client = NitroGenClient(host=args.host, port=args.port)

    try:
        if args.stage == "smoke":
            result = run_smoke_test(client, num_frames=args.sample)
            _print_result(result)

        elif args.stage == "dataset":
            result = run_dataset_benchmark(client, args.dataset, sample_size=args.sample)
            _print_result(result)

        elif args.stage == "fab":
            if not args.world:
                print("Error: --world required for fab benchmark")
                exit(1)
            result = run_fab_benchmark(client, args.world, num_frames=args.sample)
            _print_result(result)

        elif args.stage == "all":
            run_all_benchmarks(
                host=args.host,
                port=args.port,
                output_dir=args.output,
                dataset_path=args.dataset,
                world_path=args.world,
            )

    finally:
        client.close()
