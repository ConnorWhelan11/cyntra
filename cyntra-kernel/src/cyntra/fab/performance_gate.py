"""
Performance Gate - Runtime performance validation for Godot projects.

This module runs a headless Godot session with FabPerfTest.gd and
evaluates the collected metrics against configured thresholds.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PerformanceMetrics:
    """Collected performance metrics from a test run."""

    avg_fps: float = 0.0
    min_fps: float = 0.0
    max_fps: float = 0.0
    avg_frame_time_ms: float = 0.0
    max_frame_time_ms: float = 0.0
    p95_frame_time_ms: float = 0.0
    p99_frame_time_ms: float = 0.0
    memory_peak_mb: float = 0.0
    startup_time_ms: float = 0.0
    draw_calls_avg: float = 0.0
    frames_rendered: int = 0
    duration_seconds: float = 0.0

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PerformanceMetrics:
        """Create metrics from JSON results dict."""
        return cls(
            avg_fps=data.get("avg_fps", 0.0),
            min_fps=data.get("min_fps", 0.0),
            max_fps=data.get("max_fps", 0.0),
            avg_frame_time_ms=data.get("avg_frame_time_ms", 0.0),
            max_frame_time_ms=data.get("max_frame_time_ms", 0.0),
            p95_frame_time_ms=data.get("p95_frame_time_ms", 0.0),
            p99_frame_time_ms=data.get("p99_frame_time_ms", 0.0),
            memory_peak_mb=data.get("memory_peak_mb", 0.0),
            startup_time_ms=data.get("startup_time_ms", 0.0),
            draw_calls_avg=data.get("draw_calls_avg", 0.0),
            frames_rendered=data.get("frames_rendered", 0),
            duration_seconds=data.get("duration_seconds", 0.0),
        )


@dataclass
class PerformanceThresholds:
    """Performance thresholds from gate config."""

    fps_floor: float = 25.0
    fps_target: float = 30.0
    fps_warning: float = 45.0
    max_frame_time_ms: float = 33.3
    frame_spike_max_ms: float = 100.0
    memory_budget_mb: float = 512.0
    memory_spike_max_mb: float = 768.0
    startup_time_max_ms: float = 10000.0

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> PerformanceThresholds:
        """Create thresholds from gate config."""
        perf = config.get("performance", {})
        thresholds = config.get("thresholds", {})
        return cls(
            fps_floor=thresholds.get("fps_floor", 25.0),
            fps_target=perf.get("target_fps", 30.0),
            fps_warning=thresholds.get("fps_warning", 45.0),
            max_frame_time_ms=perf.get("max_frame_time_ms", 33.3),
            frame_spike_max_ms=thresholds.get("frame_spike_max_ms", 100.0),
            memory_budget_mb=perf.get("memory_budget_mb", 512.0),
            memory_spike_max_mb=thresholds.get("memory_spike_max_mb", 768.0),
            startup_time_max_ms=perf.get("startup_time_max_ms", 10000.0),
        )


@dataclass
class PerformanceGateResult:
    """Result of a performance gate evaluation."""

    success: bool = False
    metrics: PerformanceMetrics = field(default_factory=PerformanceMetrics)
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    raw_output: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "success": self.success,
            "metrics": {
                "avg_fps": self.metrics.avg_fps,
                "min_fps": self.metrics.min_fps,
                "max_fps": self.metrics.max_fps,
                "avg_frame_time_ms": self.metrics.avg_frame_time_ms,
                "max_frame_time_ms": self.metrics.max_frame_time_ms,
                "memory_peak_mb": self.metrics.memory_peak_mb,
                "startup_time_ms": self.metrics.startup_time_ms,
                "frames_rendered": self.metrics.frames_rendered,
            },
            "failures": self.failures,
            "warnings": self.warnings,
        }


def find_godot_binary() -> Path | None:
    """Find the Godot executable on the system."""
    import shutil

    # Check common locations
    candidates = [
        # macOS
        Path("/Applications/Godot.app/Contents/MacOS/Godot"),
        Path("/Applications/Godot_mono.app/Contents/MacOS/Godot"),
        # Linux / PATH
        shutil.which("godot4"),
        shutil.which("godot"),
        # Environment variable
        Path(subprocess.os.environ.get("GODOT_BIN", "")),
    ]

    for candidate in candidates:
        if candidate and isinstance(candidate, str):
            candidate = Path(candidate)
        if candidate and candidate.exists():
            return candidate

    return None


def run_performance_gate(
    project_path: Path,
    config: dict[str, Any],
    godot_bin: Path | None = None,
    output_dir: Path | None = None,
) -> PerformanceGateResult:
    """
    Run a performance gate evaluation.

    Args:
        project_path: Path to the Godot project
        config: Gate configuration dict
        godot_bin: Path to Godot executable (auto-detected if None)
        output_dir: Directory for output files (temp if None)

    Returns:
        PerformanceGateResult with metrics and pass/fail status
    """
    result = PerformanceGateResult()

    # Find Godot
    if godot_bin is None:
        godot_bin = find_godot_binary()

    if godot_bin is None or not godot_bin.exists():
        result.failures.append("PERF_GODOT_MISSING")
        return result

    # Get config values
    perf_config = config.get("performance", {})
    godot_config = config.get("godot", {})
    thresholds = PerformanceThresholds.from_config(config)

    duration = perf_config.get("test_duration_seconds", 10.0)
    test_scene = godot_config.get("test_scene", "res://scenes/perf_test.tscn")

    # Setup output
    if output_dir is None:
        output_dir = Path(tempfile.mkdtemp(prefix="fab_perf_"))
    output_dir.mkdir(parents=True, exist_ok=True)
    results_file = output_dir / "perf_results.json"

    # Build command
    cmd = [
        str(godot_bin),
        "--headless",
        "--path", str(project_path),
        test_scene,
        "--",  # Separator for script args
        "--duration", str(duration),
        f"--perf-output={results_file}",
    ]

    # Add custom args from config
    extra_args = godot_config.get("args", [])
    cmd.extend(extra_args)

    print(f"Running performance test: {' '.join(cmd)}")

    # Run Godot
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=duration * 2 + 30,  # Double duration + startup buffer
            cwd=project_path,
        )
        result.raw_output = proc.stdout + proc.stderr

        if proc.returncode != 0:
            print(f"Godot exited with code {proc.returncode}")
            # Non-zero exit might still produce valid results

    except subprocess.TimeoutExpired:
        result.failures.append("PERF_STARTUP_TIMEOUT")
        return result
    except Exception as e:
        result.failures.append("PERF_TEST_CRASH")
        result.raw_output = str(e)
        return result

    # Parse results
    if not results_file.exists():
        result.failures.append("PERF_SCENE_NOT_FOUND")
        return result

    try:
        with open(results_file) as f:
            data = json.load(f)
    except json.JSONDecodeError:
        result.failures.append("PERF_TEST_CRASH")
        return result

    if not data.get("success", False):
        result.failures.append("PERF_TEST_CRASH")
        return result

    # Extract metrics
    result.metrics = PerformanceMetrics.from_dict(data)

    # Evaluate against thresholds
    _evaluate_thresholds(result, thresholds)

    # Set success based on failures
    result.success = len(result.failures) == 0

    return result


def _evaluate_thresholds(
    result: PerformanceGateResult,
    thresholds: PerformanceThresholds,
) -> None:
    """Evaluate metrics against thresholds and populate failures/warnings."""
    metrics = result.metrics

    # FPS checks
    if metrics.avg_fps < thresholds.fps_floor:
        result.failures.append("PERF_FPS_BELOW_FLOOR")
    elif metrics.avg_fps < thresholds.fps_target:
        result.warnings.append("PERF_FPS_BELOW_TARGET")

    # Frame spike check
    if metrics.max_frame_time_ms > thresholds.frame_spike_max_ms:
        result.failures.append("PERF_FRAME_SPIKE")

    # Memory checks
    if metrics.memory_peak_mb > thresholds.memory_spike_max_mb:
        result.failures.append("PERF_MEMORY_EXCEEDED")
    elif metrics.memory_peak_mb > thresholds.memory_budget_mb:
        result.warnings.append("PERF_MEMORY_HIGH")

    # Startup check
    if metrics.startup_time_ms > thresholds.startup_time_max_ms:
        result.failures.append("PERF_STARTUP_TIMEOUT")


def run_from_cli(
    project_path: str,
    config_path: str,
    output_path: str | None = None,
) -> int:
    """CLI entry point for running the performance gate."""
    import yaml

    project = Path(project_path)
    config_file = Path(config_path)

    if not project.exists():
        print(f"Error: Project not found: {project}")
        return 1

    if not config_file.exists():
        print(f"Error: Config not found: {config_file}")
        return 1

    with open(config_file) as f:
        config = yaml.safe_load(f)

    output_dir = Path(output_path) if output_path else None

    result = run_performance_gate(project, config, output_dir=output_dir)

    # Print summary
    print("\n=== Performance Gate Results ===")
    print(f"Success: {result.success}")
    print(f"Avg FPS: {result.metrics.avg_fps:.1f}")
    print(f"Max Frame Time: {result.metrics.max_frame_time_ms:.2f} ms")
    print(f"Memory Peak: {result.metrics.memory_peak_mb:.1f} MB")

    if result.failures:
        print(f"\nFailures: {', '.join(result.failures)}")

    if result.warnings:
        print(f"\nWarnings: {', '.join(result.warnings)}")

    # Write output if specified
    if output_path:
        output_file = Path(output_path) / "gate_result.json"
        with open(output_file, "w") as f:
            json.dump(result.to_dict(), f, indent=2)
        print(f"\nResults written to: {output_file}")

    return 0 if result.success else 1


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python performance_gate.py <project_path> <config_path> [output_dir]")
        sys.exit(1)

    exit_code = run_from_cli(
        sys.argv[1],
        sys.argv[2],
        sys.argv[3] if len(sys.argv) > 3 else None,
    )
    sys.exit(exit_code)
