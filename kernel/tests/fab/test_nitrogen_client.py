"""
Unit tests for NitroGen client with retry logic and connection monitoring.
"""

import contextlib
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from cyntra.fab.nitrogen_client import (
    ConnectionMetrics,
    ConnectionState,
    GamepadAction,
    NitroGenClient,
    NitroGenConnectionError,
    NitroGenServerError,
    NitroGenTimeoutError,
    RetryConfig,
)


class TestRetryConfig:
    """Tests for RetryConfig."""

    def test_default_values(self):
        config = RetryConfig()
        assert config.max_retries == 3
        assert config.base_delay_ms == 100
        assert config.max_delay_ms == 5000
        assert config.exponential_base == 2.0

    def test_get_delay_exponential_increase(self):
        config = RetryConfig(base_delay_ms=100, max_delay_ms=10000, jitter_factor=0)

        delay0 = config.get_delay(0)
        delay1 = config.get_delay(1)
        delay2 = config.get_delay(2)

        # Delays should increase exponentially
        assert delay0 == pytest.approx(0.1, rel=0.01)  # 100ms
        assert delay1 == pytest.approx(0.2, rel=0.01)  # 200ms
        assert delay2 == pytest.approx(0.4, rel=0.01)  # 400ms

    def test_get_delay_respects_max(self):
        config = RetryConfig(base_delay_ms=1000, max_delay_ms=2000, jitter_factor=0)

        # At attempt 10, exponential would be huge, but should cap at max
        delay = config.get_delay(10)
        assert delay <= 2.0  # max_delay_ms / 1000

    def test_get_delay_with_jitter(self):
        config = RetryConfig(base_delay_ms=100, jitter_factor=0.5)

        # With jitter, delays should vary
        delays = [config.get_delay(1) for _ in range(10)]
        # Not all delays should be identical
        assert len({round(d, 4) for d in delays}) > 1


class TestConnectionMetrics:
    """Tests for ConnectionMetrics."""

    def test_initial_state(self):
        metrics = ConnectionMetrics()
        assert metrics.total_requests == 0
        assert metrics.successful_requests == 0
        assert metrics.failed_requests == 0
        assert metrics.success_rate == 1.0  # No requests = 100% success
        assert metrics.avg_latency_ms == 0.0

    def test_record_success(self):
        metrics = ConnectionMetrics()

        metrics.record_success(100.0)
        metrics.record_success(200.0)

        assert metrics.total_requests == 2
        assert metrics.successful_requests == 2
        assert metrics.success_rate == 1.0
        assert metrics.avg_latency_ms == 150.0
        assert metrics.consecutive_failures == 0

    def test_record_failure(self):
        metrics = ConnectionMetrics()

        metrics.record_success(100.0)
        metrics.record_failure()
        metrics.record_failure()

        assert metrics.total_requests == 3
        assert metrics.failed_requests == 2
        assert metrics.success_rate == pytest.approx(1 / 3)
        assert metrics.consecutive_failures == 2

    def test_consecutive_failures_reset_on_success(self):
        metrics = ConnectionMetrics()

        metrics.record_failure()
        metrics.record_failure()
        assert metrics.consecutive_failures == 2

        metrics.record_success(100.0)
        assert metrics.consecutive_failures == 0

    def test_record_retry(self):
        metrics = ConnectionMetrics()

        metrics.record_retry()
        metrics.record_retry()

        assert metrics.total_retries == 2

    def test_record_reconnect(self):
        metrics = ConnectionMetrics()

        metrics.record_reconnect()

        assert metrics.reconnect_count == 1


class TestGamepadAction:
    """Tests for GamepadAction dataclass."""

    def test_from_nitrogen_output(self):
        # Simulate NitroGen output format
        pred = {
            "j_left": np.array([[0.5, -0.3], [0.1, 0.2]]),
            "j_right": np.array([[0.0, 0.1], [0.2, 0.3]]),
            "buttons": np.array(
                [
                    [
                        0.9,
                        0.1,
                        0.8,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.7,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                    ],
                    [
                        0.1,
                        0.1,
                        0.1,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.1,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                    ],
                ]
            ),
        }

        action = GamepadAction.from_nitrogen_output(pred, timestep=0)

        assert action.move_x == pytest.approx(0.5)
        assert action.move_y == pytest.approx(-0.3)
        assert action.look_x == pytest.approx(0.0)
        assert action.look_y == pytest.approx(0.1)
        assert action.jump is True  # button[0] > 0.5
        assert action.interact is True  # button[2] > 0.5
        assert action.sprint is True  # button[8] > 0.5

    def test_from_nitrogen_output_different_timestep(self):
        pred = {
            "j_left": np.array([[0.5, -0.3], [0.1, 0.2]]),
            "j_right": np.array([[0.0, 0.1], [0.2, 0.3]]),
            "buttons": np.array(
                [
                    [
                        0.9,
                        0.1,
                        0.8,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.7,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                    ],
                    [
                        0.1,
                        0.1,
                        0.1,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.1,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                    ],
                ]
            ),
        }

        action = GamepadAction.from_nitrogen_output(pred, timestep=1)

        assert action.move_x == pytest.approx(0.1)
        assert action.move_y == pytest.approx(0.2)
        assert action.jump is False  # button[0] < 0.5 at timestep 1


class TestNitroGenClient:
    """Tests for NitroGenClient."""

    def test_initial_state(self):
        client = NitroGenClient(host="localhost", port=5555)

        assert client.host == "localhost"
        assert client.port == 5555
        assert client.state == ConnectionState.DISCONNECTED
        assert client.is_healthy is False

    def test_custom_retry_config(self):
        retry_config = RetryConfig(max_retries=5, base_delay_ms=50)
        client = NitroGenClient(retry_config=retry_config)

        assert client.retry_config.max_retries == 5
        assert client.retry_config.base_delay_ms == 50

    @patch("cyntra.fab.nitrogen_client.socket.socket")
    def test_check_server_reachable_success(self, mock_socket_class):
        mock_socket = MagicMock()
        mock_socket.connect_ex.return_value = 0
        mock_socket_class.return_value = mock_socket

        client = NitroGenClient()
        result = client._check_server_reachable()

        assert result is True
        mock_socket.close.assert_called_once()

    @patch("cyntra.fab.nitrogen_client.socket.socket")
    def test_check_server_reachable_failure(self, mock_socket_class):
        mock_socket = MagicMock()
        mock_socket.connect_ex.return_value = 1  # Connection refused
        mock_socket_class.return_value = mock_socket

        client = NitroGenClient()
        result = client._check_server_reachable()

        assert result is False

    @patch("cyntra.fab.nitrogen_client.socket.socket")
    def test_connect_server_unreachable(self, mock_socket_class):
        mock_socket = MagicMock()
        mock_socket.connect_ex.return_value = 1
        mock_socket_class.return_value = mock_socket

        client = NitroGenClient()

        with pytest.raises(NitroGenConnectionError, match="not reachable"):
            client._connect()

        assert client.state == ConnectionState.DISCONNECTED

    @patch("cyntra.fab.nitrogen_client.socket.socket")
    @patch("zmq.Context")
    def test_connect_success(self, mock_context_class, mock_socket_class):
        # Mock socket check
        mock_tcp_socket = MagicMock()
        mock_tcp_socket.connect_ex.return_value = 0
        mock_socket_class.return_value = mock_tcp_socket

        # Mock ZMQ
        mock_context = MagicMock()
        mock_zmq_socket = MagicMock()
        mock_context.socket.return_value = mock_zmq_socket
        mock_context_class.return_value = mock_context

        client = NitroGenClient()
        client._connect()

        assert client.state == ConnectionState.CONNECTED
        mock_zmq_socket.connect.assert_called_once_with("tcp://localhost:5555")

    def test_cleanup_socket(self):
        client = NitroGenClient()
        client._socket = MagicMock()
        client._context = MagicMock()

        client._cleanup_socket()

        assert client._socket is None
        assert client._context is None

    def test_get_status(self):
        client = NitroGenClient(host="testhost", port=1234)
        client._metrics.record_success(100.0)
        client._metrics.record_failure()

        status = client.get_status()

        assert status["host"] == "testhost"
        assert status["port"] == 1234
        assert status["state"] == "disconnected"
        assert status["metrics"]["total_requests"] == 2
        assert status["metrics"]["success_rate"] == 0.5

    @patch.object(NitroGenClient, "_send_request_raw")
    @patch.object(NitroGenClient, "_ensure_connected")
    def test_send_request_success(self, mock_ensure, mock_send_raw):
        mock_send_raw.return_value = {"status": "ok", "data": "test"}

        client = NitroGenClient()
        client._state = ConnectionState.CONNECTED

        response = client._send_request({"type": "info"})

        assert response["data"] == "test"
        assert client.metrics.successful_requests == 1

    @patch.object(NitroGenClient, "_send_request_raw")
    @patch.object(NitroGenClient, "_ensure_connected")
    def test_send_request_server_error(self, mock_ensure, mock_send_raw):
        mock_send_raw.return_value = {"status": "error", "message": "Test error"}

        client = NitroGenClient()
        client._state = ConnectionState.CONNECTED

        with pytest.raises(NitroGenServerError, match="Test error"):
            client._send_request({"type": "info"})

        assert client.metrics.failed_requests == 1

    @patch.object(NitroGenClient, "_send_request_raw")
    @patch.object(NitroGenClient, "_ensure_connected")
    def test_send_request_retry_on_timeout(self, mock_ensure, mock_send_raw):
        # First call times out, second succeeds
        mock_send_raw.side_effect = [
            NitroGenTimeoutError("Timeout"),
            {"status": "ok", "data": "test"},
        ]

        client = NitroGenClient(retry_config=RetryConfig(max_retries=2, base_delay_ms=1))
        client._state = ConnectionState.CONNECTED

        response = client._send_request({"type": "info"})

        assert response["data"] == "test"
        assert client.metrics.total_retries == 1
        assert client.metrics.successful_requests == 1

    @patch.object(NitroGenClient, "_send_request_raw")
    @patch.object(NitroGenClient, "_ensure_connected")
    def test_send_request_all_retries_exhausted(self, mock_ensure, mock_send_raw):
        mock_send_raw.side_effect = NitroGenTimeoutError("Timeout")

        client = NitroGenClient(retry_config=RetryConfig(max_retries=2, base_delay_ms=1))
        client._state = ConnectionState.CONNECTED

        with pytest.raises(NitroGenTimeoutError):
            client._send_request({"type": "info"})

        # Should have tried 3 times (initial + 2 retries)
        assert mock_send_raw.call_count == 3

    @patch.object(NitroGenClient, "_send_request_raw")
    @patch.object(NitroGenClient, "_ensure_connected")
    def test_state_degrades_after_failures(self, mock_ensure, mock_send_raw):
        mock_send_raw.side_effect = NitroGenTimeoutError("Timeout")

        client = NitroGenClient(retry_config=RetryConfig(max_retries=0, base_delay_ms=1))
        client._state = ConnectionState.CONNECTED

        # First few failures
        for _ in range(3):
            with contextlib.suppress(NitroGenTimeoutError):
                client._send_request({"type": "info"})

        assert client.state == ConnectionState.DEGRADED

    @patch.object(NitroGenClient, "_send_request_raw")
    @patch.object(NitroGenClient, "_ensure_connected")
    def test_state_fails_after_many_failures(self, mock_ensure, mock_send_raw):
        mock_send_raw.side_effect = NitroGenTimeoutError("Timeout")

        client = NitroGenClient(retry_config=RetryConfig(max_retries=0, base_delay_ms=1))
        client._state = ConnectionState.CONNECTED

        # Many failures
        for _ in range(10):
            with contextlib.suppress(NitroGenTimeoutError):
                client._send_request({"type": "info"})

        assert client.state == ConnectionState.FAILED

    @patch.object(NitroGenClient, "_send_request")
    def test_info(self, mock_send):
        mock_send.return_value = {"status": "ok", "info": {"model": "nitrogen", "version": "1.0"}}

        client = NitroGenClient()
        info = client.info()

        assert info["model"] == "nitrogen"
        mock_send.assert_called_once_with({"type": "info"})

    @patch.object(NitroGenClient, "_send_request")
    def test_reset(self, mock_send):
        mock_send.return_value = {"status": "ok"}

        client = NitroGenClient()
        client.reset()

        mock_send.assert_called_once_with({"type": "reset"})

    @patch.object(NitroGenClient, "_send_request")
    def test_predict(self, mock_send):
        mock_send.return_value = {
            "status": "ok",
            "pred": {
                "j_left": np.zeros((18, 2)),
                "j_right": np.zeros((18, 2)),
                "buttons": np.zeros((18, 21)),
            },
        }

        client = NitroGenClient()

        # Create test image
        from PIL import Image

        img = Image.new("RGB", (256, 256))

        pred = client.predict(img)

        assert "j_left" in pred
        assert "j_right" in pred
        assert "buttons" in pred

    def test_context_manager(self):
        client = NitroGenClient()
        client._socket = MagicMock()
        client._context = MagicMock()

        with client as c:
            assert c is client

        # Should have cleaned up
        assert client._socket is None
