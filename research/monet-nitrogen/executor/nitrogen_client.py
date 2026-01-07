"""NitroGen executor client using ZeroMQ."""

from __future__ import annotations

import asyncio
import logging
import pickle
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
import zmq
from PIL import Image

from schemas.executor_action import NitroGenAction, SingleTimestepAction

logger = logging.getLogger(__name__)


class NitroGenExecutor:
    """Client for NitroGen model server.

    NitroGen runs as a separate process serving predictions over ZeroMQ.
    This client sends frames and receives action predictions.

    Usage:
        executor = NitroGenExecutor(port=5555)
        executor.reset()
        actions = executor.predict(frame)
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5555,
        timeout_ms: int = 100,
    ) -> None:
        """Initialize NitroGen client.

        Args:
            host: Server hostname
            port: Server port
            timeout_ms: Receive timeout in milliseconds
        """
        self.host = host
        self.port = port
        self.timeout_ms = timeout_ms

        # ZeroMQ setup
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REQ)
        self.socket.connect(f"tcp://{host}:{port}")
        self.socket.setsockopt(zmq.RCVTIMEO, timeout_ms)
        self.socket.setsockopt(zmq.SNDTIMEO, timeout_ms)
        self.socket.setsockopt(zmq.LINGER, 0)

        # Thread pool for async operations
        self._executor = ThreadPoolExecutor(max_workers=1)

        # Cache server info
        self._info: dict | None = None

        # Stats
        self.total_requests = 0
        self.successful_requests = 0
        self.total_latency_ms = 0.0

    def reset(self) -> dict:
        """Reset the NitroGen session.

        Returns:
            Server response dict
        """
        request = {"type": "reset"}
        self.socket.send(pickle.dumps(request))
        response = pickle.loads(self.socket.recv())
        logger.info("NitroGen session reset")
        return response

    def info(self) -> dict:
        """Get server info.

        Returns:
            Dict with model info including:
            - ckpt_path: Path to checkpoint
            - action_downsample_ratio: Frames per action
        """
        if self._info is not None:
            return self._info

        request = {"type": "info"}
        self.socket.send(pickle.dumps(request))
        response = pickle.loads(self.socket.recv())

        if response.get("status") == "ok":
            self._info = response.get("info", {})
            return self._info
        else:
            raise RuntimeError(f"Failed to get info: {response}")

    def predict(self, frame: Image.Image | np.ndarray) -> NitroGenAction:
        """Get action prediction for a frame.

        Args:
            frame: Game frame as PIL Image or numpy array (RGB, 256x256)

        Returns:
            NitroGenAction with predicted actions for 16 timesteps
        """
        # Convert numpy to PIL if needed
        if isinstance(frame, np.ndarray):
            frame = Image.fromarray(frame)

        # Ensure correct size
        if frame.size != (256, 256):
            frame = frame.resize((256, 256), Image.Resampling.BILINEAR)

        # Ensure RGB
        if frame.mode != "RGB":
            frame = frame.convert("RGB")

        start_time = time.time()
        self.total_requests += 1

        request = {"type": "predict", "image": frame}
        self.socket.send(pickle.dumps(request))

        try:
            response = pickle.loads(self.socket.recv())
        except zmq.Again:
            raise TimeoutError(f"NitroGen prediction timeout ({self.timeout_ms}ms)")

        latency_ms = (time.time() - start_time) * 1000
        self.total_latency_ms += latency_ms

        if response.get("status") != "ok":
            raise RuntimeError(f"NitroGen prediction failed: {response}")

        self.successful_requests += 1
        pred = response["pred"]

        return NitroGenAction(
            j_left=np.array(pred["j_left"], dtype=np.float32),
            j_right=np.array(pred["j_right"], dtype=np.float32),
            buttons=np.array(pred["buttons"], dtype=np.float32),
        )

    async def predict_async(self, frame: Image.Image | np.ndarray) -> NitroGenAction:
        """Async version of predict.

        Args:
            frame: Game frame

        Returns:
            NitroGenAction
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.predict, frame)

    def get_stats(self) -> dict[str, Any]:
        """Get client statistics."""
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "success_rate": (
                self.successful_requests / self.total_requests
                if self.total_requests > 0
                else 0.0
            ),
            "avg_latency_ms": (
                self.total_latency_ms / self.total_requests
                if self.total_requests > 0
                else 0.0
            ),
        }

    def close(self) -> None:
        """Close the connection."""
        self._executor.shutdown(wait=False)
        self.socket.close()
        self.context.term()
        logger.info("NitroGen client closed")

    def __enter__(self) -> "NitroGenExecutor":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class MockNitroGenExecutor:
    """Mock executor for testing without a real NitroGen server."""

    def __init__(self, action_pattern: str = "random") -> None:
        """Initialize mock executor.

        Args:
            action_pattern: Type of mock actions to generate
                - "random": Random joystick and button values
                - "forward": Always move forward
                - "idle": No inputs
        """
        self.action_pattern = action_pattern
        self.call_count = 0
        self._info = {
            "ckpt_path": "mock/ng.pt",
            "action_downsample_ratio": 4,
        }

    def reset(self) -> dict:
        """Reset mock session."""
        self.call_count = 0
        return {"status": "ok"}

    def info(self) -> dict:
        """Get mock server info."""
        return self._info

    def predict(self, frame: Image.Image | np.ndarray) -> NitroGenAction:
        """Generate mock actions.

        Args:
            frame: Ignored in mock

        Returns:
            Mock NitroGenAction
        """
        self.call_count += 1

        if self.action_pattern == "random":
            j_left = np.random.randn(16, 2).astype(np.float32) * 0.5
            j_right = np.random.randn(16, 2).astype(np.float32) * 0.3
            buttons = np.random.rand(16, 17).astype(np.float32)
        elif self.action_pattern == "forward":
            j_left = np.zeros((16, 2), dtype=np.float32)
            j_left[:, 1] = -0.8  # Forward
            j_right = np.zeros((16, 2), dtype=np.float32)
            buttons = np.zeros((16, 17), dtype=np.float32)
        else:  # idle
            j_left = np.zeros((16, 2), dtype=np.float32)
            j_right = np.zeros((16, 2), dtype=np.float32)
            buttons = np.zeros((16, 17), dtype=np.float32)

        return NitroGenAction(j_left=j_left, j_right=j_right, buttons=buttons)

    async def predict_async(self, frame: Image.Image | np.ndarray) -> NitroGenAction:
        """Async mock predict."""
        return self.predict(frame)

    def get_stats(self) -> dict[str, Any]:
        """Get mock stats."""
        return {"mock": True, "call_count": self.call_count}

    def close(self) -> None:
        """Close mock (no-op)."""
        pass

    def __enter__(self) -> "MockNitroGenExecutor":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
