"""Tests for performance_gate.py module."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from cyntra.fab.performance_gate import (
    PerformanceGateResult,
    PerformanceMetrics,
    PerformanceThresholds,
    _evaluate_thresholds,
    find_godot_binary,
    run_performance_gate,
)


class TestPerformanceMetrics:
    """Test PerformanceMetrics dataclass."""

    def test_default_values(self):
        """Default values should be zero/empty."""
        metrics = PerformanceMetrics()
        assert metrics.avg_fps == 0.0
        assert metrics.min_fps == 0.0
        assert metrics.max_fps == 0.0
        assert metrics.avg_frame_time_ms == 0.0
        assert metrics.max_frame_time_ms == 0.0
        assert metrics.memory_peak_mb == 0.0
        assert metrics.frames_rendered == 0

    def test_from_dict_complete(self):
        """Should parse complete metrics dict."""
        data = {
            "avg_fps": 60.0,
            "min_fps": 55.0,
            "max_fps": 65.0,
            "avg_frame_time_ms": 16.67,
            "max_frame_time_ms": 20.0,
            "p95_frame_time_ms": 18.0,
            "p99_frame_time_ms": 19.0,
            "memory_peak_mb": 256.0,
            "startup_time_ms": 1500.0,
            "draw_calls_avg": 500.0,
            "frames_rendered": 600,
            "duration_seconds": 10.0,
        }
        metrics = PerformanceMetrics.from_dict(data)
        assert metrics.avg_fps == 60.0
        assert metrics.min_fps == 55.0
        assert metrics.max_fps == 65.0
        assert metrics.avg_frame_time_ms == 16.67
        assert metrics.max_frame_time_ms == 20.0
        assert metrics.p95_frame_time_ms == 18.0
        assert metrics.p99_frame_time_ms == 19.0
        assert metrics.memory_peak_mb == 256.0
        assert metrics.startup_time_ms == 1500.0
        assert metrics.draw_calls_avg == 500.0
        assert metrics.frames_rendered == 600
        assert metrics.duration_seconds == 10.0

    def test_from_dict_partial(self):
        """Should handle partial data with defaults."""
        data = {"avg_fps": 45.0, "memory_peak_mb": 128.0}
        metrics = PerformanceMetrics.from_dict(data)
        assert metrics.avg_fps == 45.0
        assert metrics.min_fps == 0.0  # Default
        assert metrics.memory_peak_mb == 128.0
        assert metrics.frames_rendered == 0  # Default

    def test_from_dict_empty(self):
        """Should handle empty dict."""
        metrics = PerformanceMetrics.from_dict({})
        assert metrics.avg_fps == 0.0
        assert metrics.memory_peak_mb == 0.0


class TestPerformanceThresholds:
    """Test PerformanceThresholds dataclass."""

    def test_default_values(self):
        """Default thresholds should be reasonable."""
        thresholds = PerformanceThresholds()
        assert thresholds.fps_floor == 25.0
        assert thresholds.fps_target == 30.0
        assert thresholds.fps_warning == 45.0
        assert thresholds.max_frame_time_ms == 33.3
        assert thresholds.frame_spike_max_ms == 100.0
        assert thresholds.memory_budget_mb == 512.0
        assert thresholds.memory_spike_max_mb == 768.0
        assert thresholds.startup_time_max_ms == 10000.0

    def test_from_config_complete(self):
        """Should parse complete config."""
        config = {
            "performance": {
                "target_fps": 60,
                "max_frame_time_ms": 16.67,
                "memory_budget_mb": 256.0,
                "startup_time_max_ms": 5000.0,
            },
            "thresholds": {
                "fps_floor": 50.0,
                "fps_warning": 55.0,
                "frame_spike_max_ms": 50.0,
                "memory_spike_max_mb": 384.0,
            },
        }
        thresholds = PerformanceThresholds.from_config(config)
        assert thresholds.fps_floor == 50.0
        assert thresholds.fps_target == 60
        assert thresholds.fps_warning == 55.0
        assert thresholds.max_frame_time_ms == 16.67
        assert thresholds.frame_spike_max_ms == 50.0
        assert thresholds.memory_budget_mb == 256.0
        assert thresholds.memory_spike_max_mb == 384.0
        assert thresholds.startup_time_max_ms == 5000.0

    def test_from_config_empty(self):
        """Should use defaults for empty config."""
        thresholds = PerformanceThresholds.from_config({})
        assert thresholds.fps_floor == 25.0
        assert thresholds.fps_target == 30.0
        assert thresholds.memory_budget_mb == 512.0


class TestPerformanceGateResult:
    """Test PerformanceGateResult dataclass."""

    def test_default_values(self):
        """Default result should be failure with empty lists."""
        result = PerformanceGateResult()
        assert result.success is False
        assert result.failures == []
        assert result.warnings == []
        assert result.raw_output == ""

    def test_to_dict(self):
        """Should serialize to dict correctly."""
        metrics = PerformanceMetrics(avg_fps=60.0, min_fps=55.0, max_fps=65.0)
        result = PerformanceGateResult(
            success=True,
            metrics=metrics,
            failures=[],
            warnings=["PERF_FPS_BELOW_TARGET"],
            raw_output="test output",
        )
        d = result.to_dict()
        assert d["success"] is True
        assert d["metrics"]["avg_fps"] == 60.0
        assert d["metrics"]["min_fps"] == 55.0
        assert d["failures"] == []
        assert d["warnings"] == ["PERF_FPS_BELOW_TARGET"]


class TestEvaluateThresholds:
    """Test _evaluate_thresholds function."""

    def test_passing_metrics(self):
        """Good metrics should pass without failures/warnings."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(
                avg_fps=60.0,
                max_frame_time_ms=20.0,
                memory_peak_mb=256.0,
                startup_time_ms=2000.0,
            )
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert result.failures == []
        assert result.warnings == []

    def test_fps_below_floor(self):
        """FPS below floor should fail."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(avg_fps=20.0)  # Below 25 floor
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert "PERF_FPS_BELOW_FLOOR" in result.failures

    def test_fps_below_target(self):
        """FPS below target but above floor should warn."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(avg_fps=27.0)  # Above 25 floor, below 30 target
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert result.failures == []
        assert "PERF_FPS_BELOW_TARGET" in result.warnings

    def test_frame_spike(self):
        """Frame spike should fail."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(
                avg_fps=60.0,
                max_frame_time_ms=150.0,  # Above 100ms spike limit
            )
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert "PERF_FRAME_SPIKE" in result.failures

    def test_memory_exceeded(self):
        """Memory above spike max should fail."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(
                avg_fps=60.0,
                memory_peak_mb=800.0,  # Above 768 spike max
            )
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert "PERF_MEMORY_EXCEEDED" in result.failures

    def test_memory_high(self):
        """Memory above budget but below spike max should warn."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(
                avg_fps=60.0,
                memory_peak_mb=600.0,  # Above 512 budget, below 768 spike
            )
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert result.failures == []
        assert "PERF_MEMORY_HIGH" in result.warnings

    def test_startup_timeout(self):
        """Slow startup should fail."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(
                avg_fps=60.0,
                startup_time_ms=15000.0,  # Above 10000ms limit
            )
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert "PERF_STARTUP_TIMEOUT" in result.failures

    def test_multiple_issues(self):
        """Multiple issues should all be reported."""
        result = PerformanceGateResult(
            metrics=PerformanceMetrics(
                avg_fps=20.0,  # Below floor
                max_frame_time_ms=150.0,  # Spike
                memory_peak_mb=800.0,  # Exceeded
            )
        )
        thresholds = PerformanceThresholds()
        _evaluate_thresholds(result, thresholds)
        assert "PERF_FPS_BELOW_FLOOR" in result.failures
        assert "PERF_FRAME_SPIKE" in result.failures
        assert "PERF_MEMORY_EXCEEDED" in result.failures


class TestFindGodotBinary:
    """Test find_godot_binary function."""

    def test_find_godot_from_which(self):
        """Should find godot from PATH via which."""
        with patch("shutil.which") as mock_which:
            mock_which.side_effect = lambda x: "/usr/bin/godot" if x == "godot" else None
            with patch.object(Path, "exists", return_value=True):
                result = find_godot_binary()
                # Result should be a path-like object
                assert result is not None
                assert "godot" in str(result).lower()

    def test_find_godot_not_found(self):
        """Should return None when godot not found."""
        with (
            patch("shutil.which", return_value=None),
            patch.object(Path, "exists", return_value=False),
        ):
            result = find_godot_binary()
            assert result is None


class TestRunPerformanceGate:
    """Test run_performance_gate function."""

    def test_godot_missing(self, tmp_path: Path):
        """Should fail when godot binary not found."""
        project = tmp_path / "project"
        project.mkdir()
        (project / "project.godot").write_text("[gd_resource]")

        config = {}

        # Mock find_godot_binary to return None
        with patch("cyntra.fab.performance_gate.find_godot_binary", return_value=None):
            result = run_performance_gate(
                project_path=project,
                config=config,
                godot_bin=None,  # Will try to find and fail
            )
        assert result.success is False
        assert "PERF_GODOT_MISSING" in result.failures

    def test_godot_bin_not_exists(self, tmp_path: Path):
        """Should fail when specified godot binary doesn't exist."""
        project = tmp_path / "project"
        project.mkdir()
        (project / "project.godot").write_text("[gd_resource]")

        nonexistent = tmp_path / "nonexistent_godot"
        config = {}
        result = run_performance_gate(
            project_path=project,
            config=config,
            godot_bin=nonexistent,
        )
        assert result.success is False
        assert "PERF_GODOT_MISSING" in result.failures

    def test_successful_run(self, tmp_path: Path):
        """Should parse results from successful Godot run."""
        project = tmp_path / "project"
        project.mkdir()
        (project / "project.godot").write_text("[gd_resource]")

        output_dir = tmp_path / "output"
        output_dir.mkdir()

        # Mock Godot binary
        fake_godot = tmp_path / "godot"
        fake_godot.touch()
        fake_godot.chmod(0o755)

        # Create fake results file that the mock process would create
        results_file = output_dir / "perf_results.json"
        results_file.write_text(
            json.dumps(
                {
                    "success": True,
                    "avg_fps": 60.0,
                    "min_fps": 55.0,
                    "max_fps": 65.0,
                    "avg_frame_time_ms": 16.67,
                    "max_frame_time_ms": 20.0,
                    "memory_peak_mb": 256.0,
                    "startup_time_ms": 1500.0,
                    "frames_rendered": 600,
                }
            )
        )

        config = {
            "performance": {"test_duration_seconds": 5.0},
            "godot": {"test_scene": "res://test.tscn"},
        }

        # Mock subprocess.run to simulate Godot run
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="Test complete", stderr="")

            result = run_performance_gate(
                project_path=project,
                config=config,
                godot_bin=fake_godot,
                output_dir=output_dir,
            )

            assert result.success is True
            assert result.metrics.avg_fps == 60.0
            assert result.metrics.memory_peak_mb == 256.0
            assert result.failures == []

    def test_scene_not_found(self, tmp_path: Path):
        """Should fail when results file not created."""
        project = tmp_path / "project"
        project.mkdir()
        (project / "project.godot").write_text("[gd_resource]")

        output_dir = tmp_path / "output"
        output_dir.mkdir()

        fake_godot = tmp_path / "godot"
        fake_godot.touch()
        fake_godot.chmod(0o755)

        config = {}

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

            result = run_performance_gate(
                project_path=project,
                config=config,
                godot_bin=fake_godot,
                output_dir=output_dir,
            )

            assert result.success is False
            assert "PERF_SCENE_NOT_FOUND" in result.failures

    def test_test_crash(self, tmp_path: Path):
        """Should handle test crash (invalid JSON)."""
        project = tmp_path / "project"
        project.mkdir()
        (project / "project.godot").write_text("[gd_resource]")

        output_dir = tmp_path / "output"
        output_dir.mkdir()

        fake_godot = tmp_path / "godot"
        fake_godot.touch()
        fake_godot.chmod(0o755)

        # Create invalid JSON
        results_file = output_dir / "perf_results.json"
        results_file.write_text("invalid json {{{")

        config = {}

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

            result = run_performance_gate(
                project_path=project,
                config=config,
                godot_bin=fake_godot,
                output_dir=output_dir,
            )

            assert result.success is False
            assert "PERF_TEST_CRASH" in result.failures

    def test_timeout(self, tmp_path: Path):
        """Should handle subprocess timeout."""
        import subprocess

        project = tmp_path / "project"
        project.mkdir()
        (project / "project.godot").write_text("[gd_resource]")

        fake_godot = tmp_path / "godot"
        fake_godot.touch()
        fake_godot.chmod(0o755)

        config = {"performance": {"test_duration_seconds": 1.0}}

        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired("godot", 30)

            result = run_performance_gate(
                project_path=project,
                config=config,
                godot_bin=fake_godot,
            )

            assert result.success is False
            assert "PERF_STARTUP_TIMEOUT" in result.failures


class TestIntegration:
    """Integration tests requiring actual config files."""

    def test_load_gate_config(self):
        """Should load actual gate config file."""
        import yaml

        gate_path = (
            Path(__file__).parent.parent.parent.parent
            / "fab"
            / "gates"
            / "godot_performance_v001.yaml"
        )
        if gate_path.exists():
            with open(gate_path) as f:
                config = yaml.safe_load(f)

            thresholds = PerformanceThresholds.from_config(config)
            assert thresholds.fps_target > 0
            assert thresholds.memory_budget_mb > 0
