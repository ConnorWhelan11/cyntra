"""
NitroGen Client - Vision-to-Action Model for Gameplay Testing

This module provides a client for NVIDIA's NitroGen model, which takes
game frames as input and outputs gamepad actions for automated playtesting.

Features:
- Automatic retry with exponential backoff
- Connection health monitoring and auto-reconnect
- Graceful degradation on server issues
- Structured logging for production observability

Usage:
    from cyntra.fab.nitrogen_client import NitroGenClient

    client = NitroGenClient()  # Uses localhost:5555 by default

    # Reset session (call before each playtest)
    client.reset()

    # Get action from frame
    action = client.predict(pil_image)
    # action = {
    #     "j_left": [[x, y], ...],   # Left joystick positions (18 timesteps)
    #     "j_right": [[x, y], ...],  # Right joystick positions
    #     "buttons": [[...], ...],   # Button states (18x21)
    # }
"""

from __future__ import annotations

import contextlib
import pickle
import socket
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any

import numpy as np
import structlog

logger = structlog.get_logger(__name__)


class NitroGenError(Exception):
    """Base exception for NitroGen client errors."""

    pass


class NitroGenConnectionError(NitroGenError):
    """Failed to connect to NitroGen server."""

    pass


class NitroGenTimeoutError(NitroGenError):
    """Request timed out."""

    pass


class NitroGenServerError(NitroGenError):
    """Server returned an error response."""

    pass


class ConnectionState(Enum):
    """Connection state for health monitoring."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DEGRADED = "degraded"  # Connected but experiencing errors
    FAILED = "failed"  # Too many failures, needs manual intervention


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_retries: int = 3
    base_delay_ms: int = 100
    max_delay_ms: int = 5000
    exponential_base: float = 2.0
    jitter_factor: float = 0.1  # Add random jitter to prevent thundering herd

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for a given attempt number (0-indexed)."""
        delay = self.base_delay_ms * (self.exponential_base**attempt)
        delay = min(delay, self.max_delay_ms)
        # Add jitter
        jitter = delay * self.jitter_factor * (2 * np.random.random() - 1)
        return max(0, (delay + jitter) / 1000.0)  # Convert to seconds


@dataclass
class ConnectionMetrics:
    """Metrics for connection health monitoring."""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_retries: int = 0
    total_latency_ms: float = 0.0
    last_success_time: float | None = None
    last_failure_time: float | None = None
    consecutive_failures: int = 0
    reconnect_count: int = 0

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 1.0
        return self.successful_requests / self.total_requests

    @property
    def avg_latency_ms(self) -> float:
        if self.successful_requests == 0:
            return 0.0
        return self.total_latency_ms / self.successful_requests

    def record_success(self, latency_ms: float) -> None:
        self.total_requests += 1
        self.successful_requests += 1
        self.total_latency_ms += latency_ms
        self.last_success_time = time.time()
        self.consecutive_failures = 0

    def record_failure(self) -> None:
        self.total_requests += 1
        self.failed_requests += 1
        self.last_failure_time = time.time()
        self.consecutive_failures += 1

    def record_retry(self) -> None:
        self.total_retries += 1

    def record_reconnect(self) -> None:
        self.reconnect_count += 1


@dataclass
class GamepadAction:
    """Decoded gamepad action from NitroGen."""

    # Movement (left stick)
    move_x: float  # -1 to 1 (left/right)
    move_y: float  # -1 to 1 (forward/back)

    # Camera (right stick)
    look_x: float  # -1 to 1
    look_y: float  # -1 to 1

    # Common buttons (decoded from 21-button array)
    jump: bool  # A button (index 0)
    interact: bool  # X button (index 2)
    sprint: bool  # Left stick click (index 8)

    # Raw data
    raw_buttons: np.ndarray

    @classmethod
    def from_nitrogen_output(cls, pred: dict, timestep: int = 0) -> GamepadAction:
        """Create action from NitroGen prediction at given timestep."""
        j_left = pred["j_left"][timestep]
        j_right = pred["j_right"][timestep]
        buttons = pred["buttons"][timestep]

        return cls(
            move_x=float(j_left[0]),
            move_y=float(j_left[1]),
            look_x=float(j_right[0]),
            look_y=float(j_right[1]),
            jump=bool(buttons[0] > 0.5),
            interact=bool(buttons[2] > 0.5),
            sprint=bool(buttons[8] > 0.5),
            raw_buttons=buttons,
        )


@dataclass
class PlaytestMetrics:
    """Metrics collected during a NitroGen playtest."""

    frames_processed: int
    total_movement: float  # Cumulative distance moved
    stuck_frames: int  # Frames with no movement
    interaction_attempts: int
    jump_attempts: int
    coverage_estimate: float  # Rough estimate of area explored

    @property
    def stuck_ratio(self) -> float:
        """Ratio of stuck frames to total frames."""
        if self.frames_processed == 0:
            return 1.0
        return self.stuck_frames / self.frames_processed


class NitroGenClient:
    """
    Production-ready client for NitroGen inference server.

    Features:
    - Automatic retry with exponential backoff
    - Connection health monitoring
    - Auto-reconnect on connection loss
    - Structured logging for observability

    The server should be running on RunPod (or locally) with:
        python scripts/serve_headless.py weights/ng.pt --port 5555

    Connect via SSH tunnel:
        ssh -L 5555:localhost:5555 root@<runpod-ip> -p <port>
    """

    # Thresholds for connection state transitions
    DEGRADED_THRESHOLD = 3  # Consecutive failures before marking degraded
    FAILED_THRESHOLD = 10  # Consecutive failures before marking failed

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5555,
        timeout_ms: int = 30000,
        retry_config: RetryConfig | None = None,
        auto_reconnect: bool = True,
        health_check_interval: float = 60.0,
    ):
        self.host = host
        self.port = port
        self.timeout_ms = timeout_ms
        self.retry_config = retry_config or RetryConfig()
        self.auto_reconnect = auto_reconnect
        self.health_check_interval = health_check_interval

        self._socket = None
        self._context = None
        self._state = ConnectionState.DISCONNECTED
        self._metrics = ConnectionMetrics()
        self._last_health_check: float = 0.0
        self._server_info: dict[str, Any] = {}

    @property
    def state(self) -> ConnectionState:
        """Current connection state."""
        return self._state

    @property
    def metrics(self) -> ConnectionMetrics:
        """Connection metrics for monitoring."""
        return self._metrics

    @property
    def is_healthy(self) -> bool:
        """Check if connection is in a healthy state."""
        return self._state in (ConnectionState.CONNECTED, ConnectionState.DEGRADED)

    def _check_server_reachable(self) -> bool:
        """Quick TCP check to see if server is reachable."""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            result = sock.connect_ex((self.host, self.port))
            sock.close()
            return result == 0
        except Exception:
            return False

    def _ensure_connected(self) -> None:
        """Lazily connect to the server with error handling."""
        if self._socket is not None:
            # Check if we should do a health check
            if time.time() - self._last_health_check > self.health_check_interval:
                self._perform_health_check()
            return

        self._connect()

    def _connect(self) -> None:
        """Establish connection to the server."""
        self._state = ConnectionState.CONNECTING

        try:
            import zmq
        except ImportError as e:
            self._state = ConnectionState.FAILED
            raise NitroGenConnectionError(
                "pyzmq is required for NitroGen client. Install with: uv pip install pyzmq"
            ) from e

        # Check if server is reachable first
        if not self._check_server_reachable():
            self._state = ConnectionState.DISCONNECTED
            raise NitroGenConnectionError(
                f"NitroGen server not reachable at {self.host}:{self.port}"
            )

        try:
            self._context = zmq.Context()
            self._socket = self._context.socket(zmq.REQ)
            self._socket.connect(f"tcp://{self.host}:{self.port}")
            self._socket.setsockopt(zmq.RCVTIMEO, self.timeout_ms)
            self._socket.setsockopt(zmq.SNDTIMEO, self.timeout_ms)
            self._socket.setsockopt(zmq.LINGER, 0)  # Don't wait on close

            self._state = ConnectionState.CONNECTED
            self._last_health_check = time.time()

            logger.info(
                "Connected to NitroGen server",
                host=self.host,
                port=self.port,
                timeout_ms=self.timeout_ms,
            )

        except Exception as e:
            self._cleanup_socket()
            self._state = ConnectionState.DISCONNECTED
            raise NitroGenConnectionError(f"Failed to connect: {e}") from e

    def _cleanup_socket(self) -> None:
        """Clean up socket resources."""
        if self._socket:
            with contextlib.suppress(Exception):
                self._socket.close()
            self._socket = None

        if self._context:
            with contextlib.suppress(Exception):
                self._context.term()
            self._context = None

    def _reconnect(self) -> None:
        """Attempt to reconnect to the server."""
        logger.info("Attempting to reconnect to NitroGen server")
        self._cleanup_socket()
        self._metrics.record_reconnect()
        self._connect()

    def _perform_health_check(self) -> bool:
        """Perform a health check on the connection."""
        self._last_health_check = time.time()

        try:
            # Send info request as health check
            response = self._send_request_raw({"type": "info"})
            if response.get("status") == "ok":
                self._server_info = response.get("info", {})
                if self._state == ConnectionState.DEGRADED:
                    logger.info("Connection recovered from degraded state")
                    self._state = ConnectionState.CONNECTED
                return True
        except Exception as e:
            logger.warning("Health check failed", error=str(e))

        return False

    def _send_request_raw(self, request: dict) -> dict:
        """Send request without retry logic (for internal use)."""
        import zmq

        if self._socket is None:
            raise NitroGenConnectionError("Not connected to server")

        try:
            self._socket.send(pickle.dumps(request))
            response = pickle.loads(self._socket.recv())
            return response

        except zmq.error.Again as e:
            raise NitroGenTimeoutError("Request timed out") from e
        except zmq.error.ZMQError as e:
            raise NitroGenConnectionError(f"ZMQ error: {e}") from e

    def _send_request(self, request: dict) -> dict:
        """Send request with retry logic and error handling."""
        self._ensure_connected()

        last_error: Exception | None = None

        for attempt in range(self.retry_config.max_retries + 1):
            start_time = time.perf_counter()

            try:
                response = self._send_request_raw(request)

                if response.get("status") != "ok":
                    error_msg = response.get("message", "Unknown error")
                    raise NitroGenServerError(f"Server error: {error_msg}")

                # Record success
                latency_ms = (time.perf_counter() - start_time) * 1000
                self._metrics.record_success(latency_ms)

                return response

            except NitroGenTimeoutError as e:
                last_error = e
                self._metrics.record_failure()
                self._update_state_on_failure()

                if attempt < self.retry_config.max_retries:
                    delay = self.retry_config.get_delay(attempt)
                    self._metrics.record_retry()
                    logger.warning(
                        "Request timeout, retrying",
                        attempt=attempt + 1,
                        max_retries=self.retry_config.max_retries,
                        delay_s=delay,
                    )
                    time.sleep(delay)

            except NitroGenConnectionError as e:
                last_error = e
                self._metrics.record_failure()
                self._update_state_on_failure()

                if self.auto_reconnect and attempt < self.retry_config.max_retries:
                    delay = self.retry_config.get_delay(attempt)
                    self._metrics.record_retry()
                    logger.warning(
                        "Connection error, reconnecting",
                        attempt=attempt + 1,
                        error=str(e),
                        delay_s=delay,
                    )
                    time.sleep(delay)
                    try:
                        self._reconnect()
                    except NitroGenConnectionError:
                        continue
                else:
                    raise

            except NitroGenServerError:
                self._metrics.record_failure()
                self._update_state_on_failure()
                raise

        # All retries exhausted
        raise last_error or NitroGenError("Request failed after all retries")

    def _update_state_on_failure(self) -> None:
        """Update connection state based on failure count."""
        if (
            self._metrics.consecutive_failures >= self.FAILED_THRESHOLD
            and self._state != ConnectionState.FAILED
        ):
            logger.error(
                "Connection marked as FAILED",
                consecutive_failures=self._metrics.consecutive_failures,
            )
            self._state = ConnectionState.FAILED
        elif (
            self._metrics.consecutive_failures >= self.DEGRADED_THRESHOLD
            and self._state == ConnectionState.CONNECTED
        ):
            logger.warning(
                "Connection marked as DEGRADED",
                consecutive_failures=self._metrics.consecutive_failures,
            )
            self._state = ConnectionState.DEGRADED

    def info(self) -> dict:
        """Get server info."""
        response = self._send_request({"type": "info"})
        self._server_info = response.get("info", {})
        return self._server_info

    def reset(self) -> None:
        """Reset the inference session (call before each new playtest)."""
        self._send_request({"type": "reset"})
        logger.debug("NitroGen session reset")

    def predict(self, image) -> dict:
        """
        Get action prediction from a game frame.

        Args:
            image: PIL Image or numpy array (will be resized to 256x256)

        Returns:
            Dict with keys:
                - j_left: np.ndarray of shape (T, 2) - left joystick
                - j_right: np.ndarray of shape (T, 2) - right joystick
                - buttons: np.ndarray of shape (T, 21) - button states
            where T is the action horizon (typically 18 timesteps)
        """
        # Convert numpy to PIL if needed
        from PIL import Image

        if isinstance(image, np.ndarray):
            image = Image.fromarray(image)

        # Resize to expected size
        if image.size != (256, 256):
            image = image.resize((256, 256), Image.Resampling.LANCZOS)

        response = self._send_request({"type": "predict", "image": image})
        return response.get("pred", {})

    def predict_action(self, image, timestep: int = 0) -> GamepadAction:
        """
        Get a single decoded action from a game frame.

        Args:
            image: Game frame
            timestep: Which timestep to extract (0 = next action)

        Returns:
            GamepadAction with decoded controls
        """
        pred = self.predict(image)
        return GamepadAction.from_nitrogen_output(pred, timestep)

    def close(self) -> None:
        """Close connection to server."""
        self._cleanup_socket()
        self._state = ConnectionState.DISCONNECTED
        logger.debug("NitroGen client closed")

    def get_status(self) -> dict[str, Any]:
        """Get current client status for monitoring."""
        return {
            "host": self.host,
            "port": self.port,
            "state": self._state.value,
            "is_healthy": self.is_healthy,
            "server_info": self._server_info,
            "metrics": {
                "total_requests": self._metrics.total_requests,
                "successful_requests": self._metrics.successful_requests,
                "failed_requests": self._metrics.failed_requests,
                "total_retries": self._metrics.total_retries,
                "success_rate": self._metrics.success_rate,
                "avg_latency_ms": self._metrics.avg_latency_ms,
                "consecutive_failures": self._metrics.consecutive_failures,
                "reconnect_count": self._metrics.reconnect_count,
            },
        }

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def run_playtest(
    client: NitroGenClient,
    frame_generator,
    action_callback,
    max_frames: int = 1800,  # 60 seconds at 30fps
    stuck_threshold: float = 0.01,
) -> PlaytestMetrics:
    """
    Run an automated playtest using NitroGen.

    Args:
        client: NitroGenClient instance
        frame_generator: Callable that yields game frames
        action_callback: Callable that applies actions to the game
        max_frames: Maximum frames to process
        stuck_threshold: Movement threshold to consider "stuck"

    Returns:
        PlaytestMetrics with collected data
    """
    client.reset()

    metrics = PlaytestMetrics(
        frames_processed=0,
        total_movement=0.0,
        stuck_frames=0,
        interaction_attempts=0,
        jump_attempts=0,
        coverage_estimate=0.0,
    )

    positions = []

    for i, frame in enumerate(frame_generator()):
        if i >= max_frames:
            break

        action = client.predict_action(frame, timestep=0)

        # Track metrics
        movement = np.sqrt(action.move_x**2 + action.move_y**2)
        metrics.total_movement += movement

        if movement < stuck_threshold:
            metrics.stuck_frames += 1

        if action.interact:
            metrics.interaction_attempts += 1

        if action.jump:
            metrics.jump_attempts += 1

        # Apply action to game
        action_callback(action)

        metrics.frames_processed += 1

        # Rough position tracking (would need actual game state for accuracy)
        if i > 0:
            positions.append((action.move_x, action.move_y))

    # Estimate coverage from movement variance
    if positions:
        positions = np.array(positions)
        metrics.coverage_estimate = float(np.std(positions))

    return metrics
