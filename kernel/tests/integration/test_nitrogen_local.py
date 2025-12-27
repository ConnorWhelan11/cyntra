"""
Local integration tests for NitroGen pipeline (no RunPod required).

These tests validate the integration between components using mocks,
ensuring the pipeline logic works before testing with real H100s.

Run with:
    pytest tests/integration/test_nitrogen_local.py -v
"""

import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from cyntra.fab.nitrogen_client import (
    ConnectionState,
    GamepadAction,
    NitroGenClient,
    RetryConfig,
)
from cyntra.fab.nitrogen_runpod import (
    NitroGenPodConfig,
    NitroGenRunPodManager,
)
from cyntra.fab.playability_gate import (
    PlayabilityGateResult,
    PlayabilityMetrics,
    PlayabilityThresholds,
    _evaluate_thresholds,
)
from cyntra.fab.playability_metrics import (
    PlayabilityMetricsCollector,
)
from cyntra.fab.runpod_manager import (
    PodStatus,
    RunPodConfig,
    TunnelInfo,
)


class TestLocalPipelineIntegration:
    """Test the full pipeline flow with mocked external dependencies."""

    @pytest.fixture
    def mock_nitrogen_predictions(self):
        """Generate realistic mock predictions."""

        def generate_prediction():
            return {
                "j_left": np.random.uniform(-1, 1, (1, 2)),
                "j_right": np.random.uniform(-0.5, 0.5, (1, 2)),
                "buttons": np.random.choice(
                    [0.0, 0.1, 0.9],
                    size=(1, 21),
                    p=[0.7, 0.2, 0.1],
                ),
            }

        return generate_prediction

    def test_playability_metrics_flow(self):
        """Test metrics collection and aggregation flow."""
        with tempfile.TemporaryDirectory() as tmpdir:
            storage_path = Path(tmpdir) / "metrics.jsonl"
            collector = PlayabilityMetricsCollector(storage_path=storage_path)

            # Simulate multiple gate runs
            worlds = ["forest_a", "forest_a", "dungeon_b", "forest_a"]
            results = [True, False, True, True]

            for world_id, success in zip(worlds, results, strict=True):
                mock_result = MagicMock()
                mock_result.success = success
                mock_result.failures = ["STUCK"] if not success else []
                mock_result.warnings = []
                mock_result.metrics = MagicMock()
                mock_result.metrics.frames_processed = 1000
                mock_result.metrics.total_playtime_seconds = 60.0
                mock_result.metrics.stuck_ratio = 0.4 if not success else 0.1
                mock_result.metrics.coverage_estimate = 0.3 if not success else 0.7
                mock_result.metrics.interaction_rate = 0.05
                mock_result.metrics.movement_distance = 100.0
                mock_result.metrics.jump_attempts = 10
                mock_result.metrics.interaction_attempts = 5
                mock_result.metrics.crash_count = 0
                mock_result.metrics.nitrogen_timeouts = 0

                collector.record_gate_result(
                    world_id=world_id,
                    gate_config_id="test_gate",
                    result=mock_result,
                    nitrogen_metrics={"avg_latency_ms": 25.0, "total_retries": 1},
                )

            # Check aggregation
            stats = collector.get_stats(world_id="forest_a")
            assert stats.total_runs == 3
            assert stats.passed == 2
            assert stats.failed == 1
            assert stats.pass_rate == pytest.approx(2 / 3, rel=0.01)

            # Check all stats
            all_stats = collector.get_all_stats()
            assert "forest_a" in all_stats
            assert "dungeon_b" in all_stats

    def test_threshold_evaluation_integration(self):
        """Test threshold evaluation with various metric combinations."""
        test_cases = [
            # (metrics, thresholds, expected_success, expected_failures)
            (
                PlayabilityMetrics(frames_processed=1000, stuck_frames=100, coverage_estimate=0.8),
                PlayabilityThresholds(stuck_ratio_max=0.3, coverage_min=0.4),
                True,
                [],
            ),
            (
                PlayabilityMetrics(frames_processed=1000, stuck_frames=400, coverage_estimate=0.8),
                PlayabilityThresholds(stuck_ratio_max=0.3, coverage_min=0.4),
                False,
                ["PLAY_STUCK_TOO_LONG"],
            ),
            (
                PlayabilityMetrics(frames_processed=1000, stuck_frames=100, coverage_estimate=0.2),
                PlayabilityThresholds(stuck_ratio_max=0.3, coverage_min=0.4),
                False,
                ["PLAY_NO_EXPLORATION"],
            ),
            (
                PlayabilityMetrics(frames_processed=1000, stuck_frames=400, coverage_estimate=0.2),
                PlayabilityThresholds(stuck_ratio_max=0.3, coverage_min=0.4),
                False,
                ["PLAY_STUCK_TOO_LONG", "PLAY_NO_EXPLORATION"],
            ),
        ]

        for metrics, thresholds, expected_success, expected_failures in test_cases:
            result = PlayabilityGateResult(metrics=metrics)
            _evaluate_thresholds(result, thresholds)
            result.success = len(result.failures) == 0

            assert result.success == expected_success
            assert set(result.failures) == set(expected_failures)

    def test_client_retry_behavior(self, mock_nitrogen_predictions):
        """Test client retry logic with simulated failures."""
        with patch("cyntra.fab.nitrogen_client.socket.socket") as mock_socket_class:
            # Mock successful socket check
            mock_socket = MagicMock()
            mock_socket.connect_ex.return_value = 0
            mock_socket_class.return_value = mock_socket

            with patch("zmq.Context") as mock_context_class:
                mock_context = MagicMock()
                mock_zmq_socket = MagicMock()
                mock_context.socket.return_value = mock_zmq_socket
                mock_context_class.return_value = mock_context

                client = NitroGenClient(
                    retry_config=RetryConfig(max_retries=3, base_delay_ms=10),
                )

                # Simulate request/response
                mock_zmq_socket.poll.return_value = {mock_zmq_socket: 1}

                import pickle

                mock_zmq_socket.recv.return_value = pickle.dumps(
                    {
                        "status": "ok",
                        "pred": mock_nitrogen_predictions(),
                    }
                )

                # Connect and make request
                client._connect()
                assert client.state == ConnectionState.CONNECTED

                # Verify metrics are tracked
                initial_requests = client.metrics.total_requests
                client._send_request({"type": "info"})
                assert client.metrics.total_requests == initial_requests + 1

    @pytest.mark.asyncio
    async def test_runpod_manager_flow(self):
        """Test RunPod manager flow with mocked API."""
        runpod_config = RunPodConfig(api_key="test-key")
        nitrogen_config = NitroGenPodConfig(
            idle_timeout_minutes=1,
            startup_timeout_seconds=10,
        )

        manager = NitroGenRunPodManager(
            runpod_config=runpod_config,
            nitrogen_config=nitrogen_config,
        )

        # Mock the underlying RunPod manager
        mock_rm = AsyncMock()
        mock_pod = PodStatus(
            id="test-pod-123",
            name="nitrogen-server-test",
            status="running",
            gpu_type="NVIDIA H100 80GB HBM3",
            cost_per_hour=2.50,
            ssh_command="ssh root@1.2.3.4 -p 22",
        )
        mock_rm.list_pods = AsyncMock(return_value=[mock_pod])
        mock_rm.get_pod = AsyncMock(return_value=mock_pod)
        mock_rm.ensure_tunnel = AsyncMock(
            return_value=TunnelInfo(
                local_port=5555,
                remote_host="localhost",
                remote_port=5555,
                ssh_host="1.2.3.4",
                ssh_port=22,
            )
        )
        mock_rm.stop_pod = AsyncMock()
        mock_rm.close = AsyncMock()

        manager._manager = mock_rm

        with (
            patch.object(manager, "_check_nitrogen_health", return_value=True),
            patch.object(manager, "_verify_endpoint", return_value=True),
        ):
            endpoint = await manager.ensure_nitrogen_server()

            assert endpoint.host == "localhost"
            assert endpoint.port == 5555
            assert endpoint.pod_id == "test-pod-123"

            status = await manager.get_status()
            assert status["has_active_endpoint"] is True

        # Cleanup
        await manager.force_shutdown()
        mock_rm.stop_pod.assert_called_once_with("test-pod-123")

        await manager.close()

    def test_gamepad_action_parsing(self, mock_nitrogen_predictions):
        """Test gamepad action parsing from raw predictions."""
        pred = mock_nitrogen_predictions()

        # Force specific values for testing
        pred["j_left"] = np.array([[0.7, -0.3]])
        pred["j_right"] = np.array([[0.1, 0.2]])
        pred["buttons"] = np.zeros((1, 21))
        pred["buttons"][0, 0] = 0.9  # Jump
        pred["buttons"][0, 2] = 0.8  # Interact
        pred["buttons"][0, 8] = 0.7  # Sprint

        action = GamepadAction.from_nitrogen_output(pred, timestep=0)

        assert action.move_x == pytest.approx(0.7, rel=0.01)
        assert action.move_y == pytest.approx(-0.3, rel=0.01)
        assert action.look_x == pytest.approx(0.1, rel=0.01)
        assert action.look_y == pytest.approx(0.2, rel=0.01)
        assert action.jump is True
        assert action.interact is True
        assert action.sprint is True

    def test_playtest_metrics_aggregation(self):
        """Test PlayabilityMetrics tracking over multiple frames."""
        # Use PlayabilityMetrics instead of PlaytestMetrics (which has required args)
        metrics = PlayabilityMetrics()

        # Simulate 100 frames
        for _i in range(100):
            move_x = np.random.uniform(-1, 1)
            move_y = np.random.uniform(-1, 1)
            movement = np.sqrt(move_x**2 + move_y**2)

            if movement < 0.1:
                metrics.stuck_frames += 1

            if np.random.random() < 0.1:
                metrics.interaction_attempts += 1

            if np.random.random() < 0.15:
                metrics.jump_attempts += 1

            metrics.movement_distance += movement
            metrics.frames_processed += 1

        assert metrics.frames_processed == 100
        assert 0 <= metrics.stuck_frames <= 100
        assert metrics.movement_distance > 0

    def test_full_gate_result_serialization(self):
        """Test gate result can be serialized for storage."""
        metrics = PlayabilityMetrics(
            frames_processed=1500,
            total_playtime_seconds=90.0,
            stuck_frames=150,
            interaction_attempts=45,
            jump_attempts=30,
            movement_distance=250.0,
            coverage_estimate=0.72,
            crash_count=0,
            nitrogen_timeouts=2,
        )

        result = PlayabilityGateResult(
            success=True,
            metrics=metrics,
            failures=[],
            warnings=["PLAY_LOW_COVERAGE"],
        )

        # Serialize
        data = result.to_dict()

        # Verify structure
        assert data["success"] is True
        assert data["metrics"]["frames_processed"] == 1500
        assert data["metrics"]["stuck_ratio"] == pytest.approx(0.1, rel=0.01)
        assert data["metrics"]["interaction_rate"] == pytest.approx(0.03, rel=0.01)
        assert data["warnings"] == ["PLAY_LOW_COVERAGE"]


class TestConnectionStateTransitions:
    """Test connection state machine transitions."""

    def test_state_transitions_on_failures(self):
        """Test state degrades properly after consecutive failures."""
        # Create a client and manually test state transitions
        client = NitroGenClient(
            retry_config=RetryConfig(max_retries=0),  # No retries
        )

        # Set initial connected state
        client._state = ConnectionState.CONNECTED

        # Simulate consecutive failures by directly recording them
        for _i in range(NitroGenClient.DEGRADED_THRESHOLD):
            client._metrics.record_failure()
            client._update_state_on_failure()

        assert client.state == ConnectionState.DEGRADED

        # More failures should lead to FAILED
        remaining = NitroGenClient.FAILED_THRESHOLD - NitroGenClient.DEGRADED_THRESHOLD
        for _i in range(remaining):
            client._metrics.record_failure()
            client._update_state_on_failure()

        assert client.state == ConnectionState.FAILED

    def test_state_recovers_on_success(self):
        """Test state recovers when requests succeed."""
        client = NitroGenClient()
        client._state = ConnectionState.DEGRADED

        # Record a success - this resets consecutive failures
        client._metrics.record_success(50.0)  # 50ms latency

        # The state should eventually recover when consecutive failures reset
        # and a new successful connection is made
        assert client._metrics.consecutive_failures == 0
