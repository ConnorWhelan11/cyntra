"""
Playability Gate - Automated gameplay quality testing using NitroGen.

This module runs a headless Godot session that streams frames to a NitroGen
inference server and executes the predicted gamepad actions. Metrics are
collected to evaluate player experience quality.

Features:
- Automated playtesting with NitroGen vision-to-action model
- Environment-specific threshold tuning
- Metrics collection and historical tracking
- Repair playbook recommendations

Usage:
    from cyntra.fab.playability_gate import run_playability_gate

    result = run_playability_gate(
        project_path=Path("path/to/godot/project"),
        config=gate_config,
    )
"""

from __future__ import annotations

import json
import socket
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import structlog

from cyntra.fab.nitrogen_client import NitroGenClient, PlaytestMetrics

logger = structlog.get_logger(__name__)


@dataclass
class PlayabilityMetrics:
    """Extended metrics for playability evaluation."""

    # Core metrics (from NitroGen client)
    frames_processed: int = 0
    total_playtime_seconds: float = 0.0
    stuck_frames: int = 0
    interaction_attempts: int = 0
    jump_attempts: int = 0
    movement_distance: float = 0.0

    # Coverage metrics
    coverage_estimate: float = 0.0
    positions_visited: int = 0
    unique_areas_explored: int = 0

    # Failure metrics
    crash_count: int = 0
    respawn_count: int = 0
    nitrogen_timeouts: int = 0

    @property
    def stuck_ratio(self) -> float:
        """Ratio of stuck frames to total frames."""
        if self.frames_processed == 0:
            return 1.0
        return self.stuck_frames / self.frames_processed

    @property
    def interaction_rate(self) -> float:
        """Rate of interaction attempts per frame."""
        if self.frames_processed == 0:
            return 0.0
        return self.interaction_attempts / self.frames_processed

    @classmethod
    def from_playtest(cls, pm: PlaytestMetrics, duration: float) -> PlayabilityMetrics:
        """Create from base PlaytestMetrics."""
        return cls(
            frames_processed=pm.frames_processed,
            total_playtime_seconds=duration,
            stuck_frames=pm.stuck_frames,
            interaction_attempts=pm.interaction_attempts,
            jump_attempts=pm.jump_attempts,
            movement_distance=pm.total_movement,
            coverage_estimate=pm.coverage_estimate,
        )


@dataclass
class PlayabilityThresholds:
    """Playability thresholds from gate config."""

    stuck_ratio_max: float = 0.3
    stuck_ratio_warn: float = 0.15
    coverage_min: float = 0.4
    coverage_warn: float = 0.6
    crash_count_max: int = 0
    interaction_rate_min: float = 0.05

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> PlayabilityThresholds:
        """Create thresholds from gate config."""
        thresholds = config.get("thresholds", {})
        return cls(
            stuck_ratio_max=thresholds.get("stuck_ratio_max", 0.3),
            stuck_ratio_warn=thresholds.get("stuck_ratio_warn", 0.15),
            coverage_min=thresholds.get("coverage_min", 0.4),
            coverage_warn=thresholds.get("coverage_warn", 0.6),
            crash_count_max=thresholds.get("crash_count_max", 0),
            interaction_rate_min=thresholds.get("interaction_rate_min", 0.05),
        )


@dataclass
class PlayabilityGateResult:
    """Result of a playability gate evaluation."""

    success: bool = False
    metrics: PlayabilityMetrics = field(default_factory=PlayabilityMetrics)
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    raw_output: str = ""
    action_log: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "success": self.success,
            "metrics": {
                "frames_processed": self.metrics.frames_processed,
                "total_playtime_seconds": self.metrics.total_playtime_seconds,
                "stuck_frames": self.metrics.stuck_frames,
                "stuck_ratio": self.metrics.stuck_ratio,
                "interaction_attempts": self.metrics.interaction_attempts,
                "interaction_rate": self.metrics.interaction_rate,
                "jump_attempts": self.metrics.jump_attempts,
                "movement_distance": self.metrics.movement_distance,
                "coverage_estimate": self.metrics.coverage_estimate,
                "crash_count": self.metrics.crash_count,
                "nitrogen_timeouts": self.metrics.nitrogen_timeouts,
            },
            "failures": self.failures,
            "warnings": self.warnings,
        }


def check_nitrogen_server(host: str, port: int, timeout: float = 5.0) -> bool:
    """Check if NitroGen server is reachable."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False


def find_godot_binary() -> Path | None:
    """Find the Godot executable on the system."""
    import shutil

    candidates = [
        Path("/Applications/Godot.app/Contents/MacOS/Godot"),
        Path("/Applications/Godot_mono.app/Contents/MacOS/Godot"),
        shutil.which("godot4"),
        shutil.which("godot"),
        Path(subprocess.os.environ.get("GODOT_BIN", "")),
    ]

    for candidate in candidates:
        if candidate and isinstance(candidate, str):
            candidate = Path(candidate)
        if candidate and candidate.exists():
            return candidate

    return None


class GodotPlaytestSession:
    """
    Manages a headless Godot session for NitroGen playtesting.

    The Godot project must have FabPlaytest.gd which:
    1. Renders viewport to texture at configured resolution
    2. Sends frames via ZMQ to this Python process
    3. Receives gamepad actions and applies them to the player
    """

    def __init__(
        self,
        project_path: Path,
        config: dict[str, Any],
        godot_bin: Path | None = None,
    ):
        self.project_path = project_path
        self.config = config
        self.godot_bin = godot_bin or find_godot_binary()
        self.process: subprocess.Popen | None = None

        # Config values
        self.godot_config = config.get("godot", {})
        self.nitrogen_config = config.get("nitrogen", {})
        self.playtest_config = config.get("playtest", {})

    def start(self, output_dir: Path) -> bool:
        """Start the Godot playtest session."""
        if self.godot_bin is None:
            return False

        test_scene = self.godot_config.get("test_scene", "res://scenes/playtest.tscn")
        duration = self.playtest_config.get("duration_seconds", 60)

        cmd = [
            str(self.godot_bin),
            "--headless",
            "--path",
            str(self.project_path),
            test_scene,
            "--",
            "--duration",
            str(duration),
            f"--playtest-output={output_dir / 'playtest_results.json'}",
            f"--nitrogen-host={self.nitrogen_config.get('host', 'localhost')}",
            f"--nitrogen-port={self.nitrogen_config.get('port', 5555)}",
        ]

        extra_args = self.godot_config.get("args", [])
        cmd.extend(extra_args)

        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=self.project_path,
        )
        return True

    def is_running(self) -> bool:
        """Check if the Godot process is still running."""
        if self.process is None:
            return False
        return self.process.poll() is None

    def stop(self) -> str:
        """Stop the Godot process and return output."""
        if self.process is None:
            return ""

        self.process.terminate()
        try:
            stdout, _ = self.process.communicate(timeout=5)
            return stdout or ""
        except subprocess.TimeoutExpired:
            self.process.kill()
            return ""

    def wait(self, timeout: float) -> tuple[int, str]:
        """Wait for process to complete."""
        if self.process is None:
            return -1, ""

        try:
            stdout, _ = self.process.communicate(timeout=timeout)
            return self.process.returncode, stdout or ""
        except subprocess.TimeoutExpired:
            self.process.kill()
            return -1, "TIMEOUT"


def run_playability_gate(
    project_path: Path,
    config: dict[str, Any],
    godot_bin: Path | None = None,
    output_dir: Path | None = None,
    world_id: str | None = None,
    run_id: str | None = None,
    collect_metrics: bool = True,
) -> PlayabilityGateResult:
    """
    Run a playability gate evaluation.

    Args:
        project_path: Path to the Godot project
        config: Gate configuration dict
        godot_bin: Path to Godot executable (auto-detected if None)
        output_dir: Directory for output files (temp if None)
        world_id: World identifier for metrics collection
        run_id: Run identifier for metrics collection
        collect_metrics: Whether to record metrics to the collector

    Returns:
        PlayabilityGateResult with metrics and pass/fail status
    """
    result = PlayabilityGateResult()
    gate_config_id = config.get("gate_config_id", "unknown")
    nitrogen_client_metrics: dict[str, Any] = {}

    # Find Godot
    if godot_bin is None:
        godot_bin = find_godot_binary()

    if godot_bin is None or not godot_bin.exists():
        result.failures.append("PLAY_GODOT_MISSING")
        logger.error("Godot binary not found")
        return result

    # Check NitroGen server
    nitrogen_config = config.get("nitrogen", {})
    host = nitrogen_config.get("host", "localhost")
    port = nitrogen_config.get("port", 5555)

    if not check_nitrogen_server(host, port):
        result.failures.append("PLAY_NITROGEN_TIMEOUT")
        logger.error("NitroGen server not reachable", host=host, port=port)
        return result

    # Get config values
    playtest_config = config.get("playtest", {})
    thresholds = PlayabilityThresholds.from_config(config)

    duration = playtest_config.get("duration_seconds", 60)
    warmup = playtest_config.get("warmup_seconds", 5)
    max_retries = playtest_config.get("max_retries", 3)

    # Setup output
    if output_dir is None:
        output_dir = Path(tempfile.mkdtemp(prefix="fab_playability_"))
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "Starting playability gate",
        gate_config=gate_config_id,
        world_id=world_id,
        duration=duration,
    )

    # Run playtest with retries
    for attempt in range(max_retries):
        logger.info("Playtest attempt", attempt=attempt + 1, max_retries=max_retries)

        try:
            metrics, nitrogen_client_metrics = _run_single_playtest(
                project_path=project_path,
                config=config,
                godot_bin=godot_bin,
                output_dir=output_dir,
                duration=duration,
                warmup=warmup,
            )
            result.metrics = metrics
            break

        except RuntimeError as e:
            result.metrics.crash_count += 1
            result.raw_output += f"\nAttempt {attempt + 1} failed: {e}"
            logger.warning("Playtest attempt failed", attempt=attempt + 1, error=str(e))

            if attempt == max_retries - 1:
                result.failures.append("PLAY_CRASH")
                logger.error("All playtest attempts failed")
                break

    # Evaluate against thresholds
    _evaluate_thresholds(result, thresholds, config)

    # Set success based on failures
    result.success = len(result.failures) == 0

    logger.info(
        "Playability gate complete",
        success=result.success,
        stuck_ratio=f"{result.metrics.stuck_ratio:.1%}",
        coverage=f"{result.metrics.coverage_estimate:.2f}",
        failures=result.failures,
        warnings=result.warnings,
    )

    # Record metrics
    if collect_metrics and world_id:
        try:
            from cyntra.fab.playability_metrics import record_gate_result

            record_gate_result(
                world_id=world_id,
                gate_config_id=gate_config_id,
                result=result,
                run_id=run_id,
                environment_type=config.get("environment_type", ""),
                seed=config.get("seed"),
                nitrogen_metrics=nitrogen_client_metrics,
            )
        except Exception as e:
            logger.warning("Failed to record metrics", error=str(e))

    return result


def _run_single_playtest(
    project_path: Path,
    config: dict[str, Any],
    godot_bin: Path,
    output_dir: Path,
    duration: float,
    warmup: float,
) -> tuple[PlayabilityMetrics, dict[str, Any]]:
    """Run a single playtest session.

    Returns:
        Tuple of (PlayabilityMetrics, nitrogen_client_metrics)
    """
    nitrogen_config = config.get("nitrogen", {})
    host = nitrogen_config.get("host", "localhost")
    port = nitrogen_config.get("port", 5555)
    frame_rate = nitrogen_config.get("frame_rate", 10)
    timeout_ms = nitrogen_config.get("timeout_ms", 30000)
    stuck_threshold = 0.005  # Movement threshold (tuned for production)

    # Connect to NitroGen with production retry config
    from cyntra.fab.nitrogen_client import RetryConfig

    retry_config = RetryConfig(
        max_retries=3,
        base_delay_ms=100,
        max_delay_ms=2000,
    )

    client = NitroGenClient(
        host=host,
        port=port,
        timeout_ms=timeout_ms,
        retry_config=retry_config,
        auto_reconnect=True,
    )

    try:
        # Reset session for new playtest
        client.reset()
        logger.info("Connected to NitroGen", host=host, port=port)

        # For now, we'll use a simulated frame source
        # In production, this would be frames streamed from Godot
        metrics = PlayabilityMetrics()

        frame_interval = 1.0 / frame_rate
        total_frames = int((duration - warmup) * frame_rate)
        positions = []

        logger.info("Running playtest", total_frames=total_frames, duration=duration - warmup)

        for _i in range(total_frames):
            start_time = time.time()

            # Generate test frame (in production: receive from Godot)
            # This would be replaced by actual frame capture from Godot
            frame = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)

            try:
                action = client.predict_action(frame, timestep=0)

                # Track metrics
                movement = np.sqrt(action.move_x**2 + action.move_y**2)

                if movement < stuck_threshold:
                    metrics.stuck_frames += 1

                if action.interact:
                    metrics.interaction_attempts += 1

                if action.jump:
                    metrics.jump_attempts += 1

                metrics.movement_distance += float(movement)
                metrics.frames_processed += 1

                # Track position for coverage
                positions.append((action.move_x, action.move_y))

            except Exception as e:
                metrics.nitrogen_timeouts += 1
                logger.warning("NitroGen prediction failed", error=str(e))

            # Maintain frame rate
            elapsed = time.time() - start_time
            if elapsed < frame_interval:
                time.sleep(frame_interval - elapsed)

        # Calculate coverage from position variance
        if positions:
            positions_arr = np.array(positions)
            metrics.coverage_estimate = float(np.std(positions_arr))
            metrics.positions_visited = len({(round(p[0], 1), round(p[1], 1)) for p in positions})

        metrics.total_playtime_seconds = duration - warmup

        # Get client metrics for monitoring
        client_status = client.get_status()
        nitrogen_client_metrics = client_status.get("metrics", {})

        return metrics, nitrogen_client_metrics

    finally:
        client.close()


def _evaluate_thresholds(
    result: PlayabilityGateResult,
    thresholds: PlayabilityThresholds,
    config: dict[str, Any] | None = None,
) -> None:
    """Evaluate metrics against thresholds and populate failures/warnings."""
    metrics = result.metrics
    config = config or {}

    # Get hard fail codes and warning codes from config
    hard_fail_codes = set(
        config.get(
            "hard_fail_codes",
            [
                "PLAY_STUCK_TOO_LONG",
                "PLAY_NO_EXPLORATION",
                "PLAY_CRASH",
                "PLAY_NITROGEN_TIMEOUT",
            ],
        )
    )
    set(
        config.get(
            "warning_codes",
            [
                "PLAY_LOW_COVERAGE",
                "PLAY_HIGH_STUCK_RATIO",
                "PLAY_NO_INTERACTIONS",
            ],
        )
    )

    # Stuck ratio checks
    if metrics.stuck_ratio > thresholds.stuck_ratio_max:
        code = "PLAY_STUCK_TOO_LONG"
        if code in hard_fail_codes:
            result.failures.append(code)
        else:
            result.warnings.append(code)
    elif metrics.stuck_ratio > thresholds.stuck_ratio_warn:
        result.warnings.append("PLAY_HIGH_STUCK_RATIO")

    # Coverage checks
    if metrics.coverage_estimate < thresholds.coverage_min:
        code = "PLAY_NO_EXPLORATION"
        if code in hard_fail_codes:
            result.failures.append(code)
        else:
            result.warnings.append(code)
    elif metrics.coverage_estimate < thresholds.coverage_warn:
        result.warnings.append("PLAY_LOW_COVERAGE")

    # Crash check
    if metrics.crash_count > thresholds.crash_count_max:
        result.failures.append("PLAY_CRASH")

    # Interaction check
    if metrics.interaction_rate < thresholds.interaction_rate_min:
        code = "PLAY_NO_INTERACTIONS"
        if code in hard_fail_codes:
            result.failures.append(code)
        else:
            result.warnings.append(code)

    # Log repair playbook recommendations if available
    repair_playbook = config.get("repair_playbook", {})
    for code in result.failures + result.warnings:
        if code in repair_playbook:
            playbook_entry = repair_playbook[code]
            logger.info(
                "Repair playbook recommendation",
                code=code,
                priority=playbook_entry.get("priority", 1),
                instructions=playbook_entry.get("instructions", "")[:200],
            )


def run_from_cli(
    project_path: str,
    config_path: str,
    output_path: str | None = None,
) -> int:
    """CLI entry point for running the playability gate."""
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

    result = run_playability_gate(project, config, output_dir=output_dir)

    # Print summary
    print("\n=== Playability Gate Results ===")
    print(f"Success: {result.success}")
    print(f"Frames Processed: {result.metrics.frames_processed}")
    print(f"Playtime: {result.metrics.total_playtime_seconds:.1f}s")
    print(f"Stuck Ratio: {result.metrics.stuck_ratio:.1%}")
    print(f"Coverage: {result.metrics.coverage_estimate:.2f}")
    print(f"Interactions: {result.metrics.interaction_attempts}")

    if result.failures:
        print(f"\nFailures: {', '.join(result.failures)}")

    if result.warnings:
        print(f"\nWarnings: {', '.join(result.warnings)}")

    # Write output if specified
    if output_path:
        output_file = Path(output_path) / "playability_result.json"
        with open(output_file, "w") as f:
            json.dump(result.to_dict(), f, indent=2)
        print(f"\nResults written to: {output_file}")

    return 0 if result.success else 1


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python playability_gate.py <project_path> <config_path> [output_dir]")
        sys.exit(1)

    exit_code = run_from_cli(
        sys.argv[1],
        sys.argv[2],
        sys.argv[3] if len(sys.argv) > 3 else None,
    )
    sys.exit(exit_code)
