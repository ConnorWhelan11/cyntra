"""
Unit tests for Playability Gate.
"""

import subprocess
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cyntra.fab.playability_gate import (
    GodotPlaytestSession,
    PlayabilityGateResult,
    PlayabilityMetrics,
    PlayabilityThresholds,
    _evaluate_thresholds,
    check_nitrogen_server,
    find_godot_binary,
    run_playability_gate,
)


class TestPlayabilityMetrics:
    """Tests for PlayabilityMetrics."""

    def test_default_values(self):
        metrics = PlayabilityMetrics()

        assert metrics.frames_processed == 0
        assert metrics.total_playtime_seconds == 0.0
        assert metrics.stuck_frames == 0
        assert metrics.interaction_attempts == 0
        assert metrics.jump_attempts == 0
        assert metrics.movement_distance == 0.0
        assert metrics.coverage_estimate == 0.0
        assert metrics.crash_count == 0
        assert metrics.nitrogen_timeouts == 0

    def test_stuck_ratio_no_frames(self):
        metrics = PlayabilityMetrics(frames_processed=0)
        assert metrics.stuck_ratio == 1.0

    def test_stuck_ratio_calculation(self):
        metrics = PlayabilityMetrics(
            frames_processed=100,
            stuck_frames=25,
        )
        assert metrics.stuck_ratio == 0.25

    def test_interaction_rate_no_frames(self):
        metrics = PlayabilityMetrics(frames_processed=0)
        assert metrics.interaction_rate == 0.0

    def test_interaction_rate_calculation(self):
        metrics = PlayabilityMetrics(
            frames_processed=200,
            interaction_attempts=20,
        )
        assert metrics.interaction_rate == 0.1

    def test_from_playtest(self):
        # PlaytestMetrics is a dataclass, create it properly
        from cyntra.fab.nitrogen_client import PlaytestMetrics

        pm = PlaytestMetrics(
            frames_processed=500,
            stuck_frames=50,
            interaction_attempts=25,
            jump_attempts=10,
            total_movement=100.0,
            coverage_estimate=0.75,
        )

        metrics = PlayabilityMetrics.from_playtest(pm, duration=30.0)

        assert metrics.frames_processed == 500
        assert metrics.stuck_frames == 50
        assert metrics.interaction_attempts == 25
        assert metrics.jump_attempts == 10
        assert metrics.movement_distance == 100.0
        assert metrics.total_playtime_seconds == 30.0
        assert metrics.coverage_estimate == 0.75


class TestPlayabilityThresholds:
    """Tests for PlayabilityThresholds."""

    def test_default_values(self):
        thresholds = PlayabilityThresholds()

        assert thresholds.stuck_ratio_max == 0.3
        assert thresholds.stuck_ratio_warn == 0.15
        assert thresholds.coverage_min == 0.4
        assert thresholds.coverage_warn == 0.6
        assert thresholds.crash_count_max == 0
        assert thresholds.interaction_rate_min == 0.05

    def test_from_config_empty(self):
        thresholds = PlayabilityThresholds.from_config({})

        # Should use defaults
        assert thresholds.stuck_ratio_max == 0.3
        assert thresholds.coverage_min == 0.4

    def test_from_config_partial(self):
        config = {
            "thresholds": {
                "stuck_ratio_max": 0.5,
            }
        }
        thresholds = PlayabilityThresholds.from_config(config)

        assert thresholds.stuck_ratio_max == 0.5
        assert thresholds.coverage_min == 0.4  # Default

    def test_from_config_full(self):
        config = {
            "thresholds": {
                "stuck_ratio_max": 0.4,
                "stuck_ratio_warn": 0.2,
                "coverage_min": 0.3,
                "coverage_warn": 0.5,
                "crash_count_max": 1,
                "interaction_rate_min": 0.02,
            }
        }
        thresholds = PlayabilityThresholds.from_config(config)

        assert thresholds.stuck_ratio_max == 0.4
        assert thresholds.stuck_ratio_warn == 0.2
        assert thresholds.coverage_min == 0.3
        assert thresholds.coverage_warn == 0.5
        assert thresholds.crash_count_max == 1
        assert thresholds.interaction_rate_min == 0.02


class TestPlayabilityGateResult:
    """Tests for PlayabilityGateResult."""

    def test_default_values(self):
        result = PlayabilityGateResult()

        assert result.success is False
        assert result.failures == []
        assert result.warnings == []
        assert result.raw_output == ""
        assert result.action_log == []
        assert isinstance(result.metrics, PlayabilityMetrics)

    def test_to_dict(self):
        result = PlayabilityGateResult(
            success=True,
            failures=[],
            warnings=["LOW_COVERAGE"],
            metrics=PlayabilityMetrics(
                frames_processed=1000,
                total_playtime_seconds=60.0,
                stuck_frames=100,
                coverage_estimate=0.75,
            ),
        )

        data = result.to_dict()

        assert data["success"] is True
        assert data["failures"] == []
        assert data["warnings"] == ["LOW_COVERAGE"]
        assert data["metrics"]["frames_processed"] == 1000
        assert data["metrics"]["total_playtime_seconds"] == 60.0
        assert data["metrics"]["stuck_ratio"] == 0.1
        assert data["metrics"]["coverage_estimate"] == 0.75


class TestCheckNitrogenServer:
    """Tests for check_nitrogen_server function."""

    @patch("cyntra.fab.playability_gate.socket.socket")
    def test_server_reachable(self, mock_socket_class):
        mock_socket = MagicMock()
        mock_socket.connect_ex.return_value = 0
        mock_socket_class.return_value = mock_socket

        result = check_nitrogen_server("localhost", 5555)

        assert result is True
        mock_socket.settimeout.assert_called_once_with(5.0)
        mock_socket.close.assert_called_once()

    @patch("cyntra.fab.playability_gate.socket.socket")
    def test_server_unreachable(self, mock_socket_class):
        mock_socket = MagicMock()
        mock_socket.connect_ex.return_value = 1
        mock_socket_class.return_value = mock_socket

        result = check_nitrogen_server("localhost", 5555)

        assert result is False

    @patch("cyntra.fab.playability_gate.socket.socket")
    def test_exception_handling(self, mock_socket_class):
        mock_socket_class.side_effect = Exception("Network error")

        result = check_nitrogen_server("localhost", 5555)

        assert result is False


class TestFindGodotBinary:
    """Tests for find_godot_binary function."""

    def test_returns_path_or_none(self):
        # This is an integration test - just verify it doesn't crash
        # and returns a Path or None
        result = find_godot_binary()

        assert result is None or isinstance(result, Path)

    def test_finds_app_bundle_if_exists(self):
        # If the standard macOS app bundle exists, it should be found
        app_path = Path("/Applications/Godot.app/Contents/MacOS/Godot")
        if app_path.exists():
            result = find_godot_binary()
            assert result is not None
            assert "Godot" in str(result)

    @patch("cyntra.fab.playability_gate.subprocess.os.environ", {"GODOT_BIN": "/custom/godot"})
    def test_respects_godot_bin_env(self):
        # Test that GODOT_BIN environment variable is checked
        # (This just verifies the code path, not actual finding)
        result = find_godot_binary()
        # Result depends on whether /custom/godot exists
        assert result is None or isinstance(result, Path)


class TestGodotPlaytestSession:
    """Tests for GodotPlaytestSession."""

    def test_initialization(self):
        config = {
            "godot": {
                "test_scene": "res://test.tscn",
            },
            "nitrogen": {
                "host": "localhost",
                "port": 5555,
            },
            "playtest": {
                "duration_seconds": 30,
            },
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            project_path = Path(tmpdir)
            session = GodotPlaytestSession(
                project_path=project_path,
                config=config,
            )

            assert session.project_path == project_path
            assert session.config == config

    def test_is_running_no_process(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        assert session.is_running() is False

    def test_is_running_with_active_process(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        mock_process = MagicMock()
        mock_process.poll.return_value = None  # Still running
        session.process = mock_process

        assert session.is_running() is True

    def test_is_running_with_dead_process(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        mock_process = MagicMock()
        mock_process.poll.return_value = 0  # Exited
        session.process = mock_process

        assert session.is_running() is False

    def test_stop_no_process(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        result = session.stop()

        assert result == ""

    def test_stop_with_process(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        mock_process = MagicMock()
        mock_process.communicate.return_value = ("output", None)
        session.process = mock_process

        result = session.stop()

        assert result == "output"
        mock_process.terminate.assert_called_once()

    def test_wait_no_process(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        returncode, output = session.wait(timeout=5)

        assert returncode == -1
        assert output == ""

    def test_wait_normal_exit(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        mock_process = MagicMock()
        mock_process.communicate.return_value = ("output", None)
        mock_process.returncode = 0
        session.process = mock_process

        returncode, output = session.wait(timeout=5)

        assert returncode == 0
        assert output == "output"

    def test_wait_timeout(self):
        session = GodotPlaytestSession(
            project_path=Path("/tmp"),
            config={},
        )

        mock_process = MagicMock()
        mock_process.communicate.side_effect = subprocess.TimeoutExpired("cmd", 5)
        session.process = mock_process

        returncode, output = session.wait(timeout=5)

        assert returncode == -1
        assert output == "TIMEOUT"
        mock_process.kill.assert_called_once()


class TestEvaluateThresholds:
    """Tests for _evaluate_thresholds function."""

    def test_pass_all_thresholds(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=1000,
                stuck_frames=50,  # 5% stuck ratio
                coverage_estimate=0.8,
                interaction_attempts=100,
            ),
        )
        thresholds = PlayabilityThresholds()

        _evaluate_thresholds(result, thresholds)

        assert result.failures == []
        assert result.warnings == []

    def test_fail_stuck_ratio(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=100,
                stuck_frames=40,  # 40% stuck ratio > 30% max
                coverage_estimate=0.8,
            ),
        )
        thresholds = PlayabilityThresholds()

        _evaluate_thresholds(result, thresholds)

        assert "PLAY_STUCK_TOO_LONG" in result.failures

    def test_warn_stuck_ratio(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=100,
                stuck_frames=20,  # 20% stuck ratio > 15% warn
                coverage_estimate=0.8,
            ),
        )
        thresholds = PlayabilityThresholds()

        _evaluate_thresholds(result, thresholds)

        assert result.failures == []
        assert "PLAY_HIGH_STUCK_RATIO" in result.warnings

    def test_fail_coverage(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=100,
                stuck_frames=5,
                coverage_estimate=0.2,  # 0.2 < 0.4 min
            ),
        )
        thresholds = PlayabilityThresholds()

        _evaluate_thresholds(result, thresholds)

        assert "PLAY_NO_EXPLORATION" in result.failures

    def test_warn_coverage(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=100,
                stuck_frames=5,
                coverage_estimate=0.5,  # 0.5 < 0.6 warn
            ),
        )
        thresholds = PlayabilityThresholds()

        _evaluate_thresholds(result, thresholds)

        assert result.failures == []
        assert "PLAY_LOW_COVERAGE" in result.warnings

    def test_fail_crash_count(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=100,
                stuck_frames=5,
                coverage_estimate=0.8,
                crash_count=2,
            ),
        )
        thresholds = PlayabilityThresholds(crash_count_max=1)

        _evaluate_thresholds(result, thresholds)

        assert "PLAY_CRASH" in result.failures

    def test_warn_no_interactions(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=1000,
                stuck_frames=50,
                coverage_estimate=0.8,
                interaction_attempts=10,  # 1% < 5% min
            ),
        )
        thresholds = PlayabilityThresholds()

        _evaluate_thresholds(result, thresholds)

        # By default, NO_INTERACTIONS is a warning not a failure
        assert "PLAY_NO_INTERACTIONS" in result.warnings

    def test_config_overrides_hard_fail_codes(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=1000,
                stuck_frames=50,
                coverage_estimate=0.8,
                interaction_attempts=10,  # 1% < 5% min
            ),
        )
        thresholds = PlayabilityThresholds()
        config = {
            "hard_fail_codes": ["PLAY_NO_INTERACTIONS"],
        }

        _evaluate_thresholds(result, thresholds, config)

        assert "PLAY_NO_INTERACTIONS" in result.failures

    def test_config_overrides_warning_codes(self):
        result = PlayabilityGateResult(
            metrics=PlayabilityMetrics(
                frames_processed=100,
                stuck_frames=40,  # Would normally fail
                coverage_estimate=0.8,
            ),
        )
        thresholds = PlayabilityThresholds()
        config = {
            "hard_fail_codes": [],  # Empty list = no hard fails
            "warning_codes": ["PLAY_STUCK_TOO_LONG"],
        }

        _evaluate_thresholds(result, thresholds, config)

        assert result.failures == []
        assert "PLAY_STUCK_TOO_LONG" in result.warnings


class TestRunPlayabilityGate:
    """Tests for run_playability_gate function."""

    @pytest.fixture
    def mock_godot_bin(self, tmp_path):
        """Create a mock godot binary that 'exists'."""
        godot_bin = tmp_path / "godot"
        godot_bin.touch()
        return godot_bin

    @patch("cyntra.fab.playability_gate.find_godot_binary")
    def test_missing_godot(self, mock_find_godot):
        mock_find_godot.return_value = None

        result = run_playability_gate(
            project_path=Path("/tmp/project"),
            config={},
            godot_bin=None,  # Explicitly None
            collect_metrics=False,
        )

        assert result.success is False
        assert "PLAY_GODOT_MISSING" in result.failures

    @patch("cyntra.fab.playability_gate.check_nitrogen_server")
    def test_nitrogen_unreachable(self, mock_check_server, mock_godot_bin):
        mock_check_server.return_value = False

        result = run_playability_gate(
            project_path=Path("/tmp/project"),
            config={},
            godot_bin=mock_godot_bin,
            collect_metrics=False,
        )

        assert result.success is False
        assert "PLAY_NITROGEN_TIMEOUT" in result.failures

    @patch("cyntra.fab.playability_gate._run_single_playtest")
    @patch("cyntra.fab.playability_gate.check_nitrogen_server")
    def test_successful_playtest(self, mock_check_server, mock_run, mock_godot_bin):
        mock_check_server.return_value = True
        mock_run.return_value = (
            PlayabilityMetrics(
                frames_processed=1000,
                stuck_frames=50,
                coverage_estimate=0.8,
                interaction_attempts=100,
            ),
            {"avg_latency_ms": 25.0},
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_playability_gate(
                project_path=Path(tmpdir),
                config={},
                godot_bin=mock_godot_bin,
                collect_metrics=False,
            )

        assert result.success is True
        assert result.failures == []
        assert result.metrics.frames_processed == 1000

    @patch("cyntra.fab.playability_gate._run_single_playtest")
    @patch("cyntra.fab.playability_gate.check_nitrogen_server")
    def test_playtest_crash_retry(self, mock_check_server, mock_run, mock_godot_bin):
        mock_check_server.return_value = True

        # First call fails, second succeeds
        mock_run.side_effect = [
            RuntimeError("Crash"),
            (
                PlayabilityMetrics(
                    frames_processed=1000,
                    stuck_frames=50,
                    coverage_estimate=0.8,
                ),
                {},
            ),
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_playability_gate(
                project_path=Path(tmpdir),
                config={"playtest": {"max_retries": 3}},
                godot_bin=mock_godot_bin,
                collect_metrics=False,
            )

        assert result.success is True
        # Crash info recorded in raw_output
        assert "Attempt 1 failed" in result.raw_output
        assert "Crash" in result.raw_output

    @patch("cyntra.fab.playability_gate._run_single_playtest")
    @patch("cyntra.fab.playability_gate.check_nitrogen_server")
    def test_all_retries_exhausted(self, mock_check_server, mock_run, mock_godot_bin):
        mock_check_server.return_value = True
        mock_run.side_effect = RuntimeError("Crash")

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_playability_gate(
                project_path=Path(tmpdir),
                config={"playtest": {"max_retries": 2}},
                godot_bin=mock_godot_bin,
                collect_metrics=False,
            )

        assert result.success is False
        assert "PLAY_CRASH" in result.failures

    @patch("cyntra.fab.playability_metrics.record_gate_result")
    @patch("cyntra.fab.playability_gate._run_single_playtest")
    @patch("cyntra.fab.playability_gate.check_nitrogen_server")
    def test_metrics_collection(self, mock_check_server, mock_run, mock_record, mock_godot_bin):
        mock_check_server.return_value = True
        mock_run.return_value = (
            PlayabilityMetrics(
                frames_processed=1000,
                coverage_estimate=0.8,
            ),
            {"avg_latency_ms": 25.0},
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            run_playability_gate(
                project_path=Path(tmpdir),
                config={"gate_config_id": "test_gate"},
                godot_bin=mock_godot_bin,
                world_id="test_world",
                run_id="run-123",
                collect_metrics=True,
            )

        mock_record.assert_called_once()
        call_args = mock_record.call_args
        assert call_args.kwargs["world_id"] == "test_world"
        assert call_args.kwargs["gate_config_id"] == "test_gate"
        assert call_args.kwargs["run_id"] == "run-123"

    @patch("cyntra.fab.playability_metrics.record_gate_result")
    @patch("cyntra.fab.playability_gate._run_single_playtest")
    @patch("cyntra.fab.playability_gate.check_nitrogen_server")
    def test_no_metrics_without_world_id(
        self, mock_check_server, mock_run, mock_record, mock_godot_bin
    ):
        mock_check_server.return_value = True
        mock_run.return_value = (
            PlayabilityMetrics(frames_processed=1000, coverage_estimate=0.8),
            {},
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            run_playability_gate(
                project_path=Path(tmpdir),
                config={},
                godot_bin=mock_godot_bin,
                world_id=None,  # No world_id
                collect_metrics=True,
            )

        mock_record.assert_not_called()
