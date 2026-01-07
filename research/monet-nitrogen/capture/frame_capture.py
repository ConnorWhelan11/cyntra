"""Frame capture from game window."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


class FrameCapture:
    """Capture frames from a game window.

    On Windows, uses DXCAM for high-performance capture.
    Falls back to PIL ImageGrab on other platforms.
    """

    def __init__(
        self,
        target_size: tuple[int, int] = (256, 256),
        target_fps: int = 60,
    ) -> None:
        """Initialize frame capture.

        Args:
            target_size: Target frame size (width, height)
            target_fps: Target capture FPS
        """
        self.target_size = target_size
        self.target_fps = target_fps
        self.frame_interval = 1.0 / target_fps

        self._camera: Any = None
        self._last_frame: np.ndarray | None = None
        self._last_capture_time: float = 0

        # Stats
        self.total_captures = 0
        self.failed_captures = 0

        self._init_capture()

    def _init_capture(self) -> None:
        """Initialize platform-specific capture."""
        try:
            import dxcam

            self._camera = dxcam.create(output_color="RGB")
            self._camera.start(target_fps=self.target_fps, video_mode=True)
            logger.info(f"Initialized DXCAM capture at {self.target_fps} FPS")
        except ImportError:
            logger.warning("DXCAM not available, using PIL fallback")
            self._camera = None
        except Exception as e:
            logger.warning(f"DXCAM init failed: {e}, using PIL fallback")
            self._camera = None

    def grab(self) -> np.ndarray | None:
        """Grab a single frame.

        Returns:
            Frame as RGB numpy array, or None if capture failed
        """
        self.total_captures += 1

        try:
            if self._camera is not None:
                # DXCAM
                frame = self._camera.get_latest_frame()
            else:
                # PIL fallback
                from PIL import ImageGrab

                screenshot = ImageGrab.grab()
                frame = np.array(screenshot)

            if frame is None:
                self.failed_captures += 1
                return self._last_frame

            # Resize to target size
            frame = cv2.resize(frame, self.target_size, interpolation=cv2.INTER_AREA)

            self._last_frame = frame
            self._last_capture_time = time.time()

            return frame

        except Exception as e:
            logger.error(f"Frame capture failed: {e}")
            self.failed_captures += 1
            return self._last_frame

    async def grab_async(self) -> np.ndarray | None:
        """Async frame grab (runs in executor).

        Returns:
            Frame as RGB numpy array
        """
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.grab)

    def get_pil_image(self) -> Image.Image | None:
        """Grab frame as PIL Image.

        Returns:
            Frame as PIL Image
        """
        frame = self.grab()
        if frame is None:
            return None
        return Image.fromarray(frame)

    def get_stats(self) -> dict[str, Any]:
        """Get capture statistics."""
        return {
            "total_captures": self.total_captures,
            "failed_captures": self.failed_captures,
            "success_rate": (
                (self.total_captures - self.failed_captures) / self.total_captures
                if self.total_captures > 0
                else 0
            ),
            "using_dxcam": self._camera is not None,
        }

    def close(self) -> None:
        """Close capture resources."""
        if self._camera is not None:
            try:
                self._camera.stop()
            except Exception:
                pass
        logger.info("Frame capture closed")

    def __enter__(self) -> "FrameCapture":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class MockFrameCapture:
    """Mock frame capture for testing.

    Can load frames from a directory or generate synthetic frames.
    """

    def __init__(
        self,
        frames_dir: Path | str | None = None,
        target_size: tuple[int, int] = (256, 256),
        pattern: str = "*.png",
    ) -> None:
        """Initialize mock capture.

        Args:
            frames_dir: Directory with frame images
            target_size: Target frame size
            pattern: Glob pattern for frame files
        """
        self.target_size = target_size
        self.frame_idx = 0

        self.frames: list[np.ndarray] = []

        if frames_dir:
            self._load_frames(Path(frames_dir), pattern)
        else:
            # Generate synthetic test frames
            self._generate_synthetic_frames()

    def _load_frames(self, frames_dir: Path, pattern: str) -> None:
        """Load frames from directory."""
        for path in sorted(frames_dir.glob(pattern)):
            img = Image.open(path).convert("RGB")
            img = img.resize(self.target_size, Image.Resampling.BILINEAR)
            self.frames.append(np.array(img))

        if not self.frames:
            logger.warning(f"No frames found in {frames_dir}")
            self._generate_synthetic_frames()
        else:
            logger.info(f"Loaded {len(self.frames)} frames from {frames_dir}")

    def _generate_synthetic_frames(self, count: int = 100) -> None:
        """Generate synthetic test frames."""
        for i in range(count):
            # Create gradient frame with moving element
            frame = np.zeros((self.target_size[1], self.target_size[0], 3), dtype=np.uint8)

            # Background gradient
            for y in range(self.target_size[1]):
                frame[y, :, 0] = int(y / self.target_size[1] * 100)  # R
                frame[y, :, 2] = int((1 - y / self.target_size[1]) * 100)  # B

            # Moving circle (simulated target)
            cx = int((i / count) * self.target_size[0])
            cy = self.target_size[1] // 2
            cv2.circle(frame, (cx, cy), 20, (255, 200, 0), -1)

            self.frames.append(frame)

        logger.info(f"Generated {len(self.frames)} synthetic frames")

    def grab(self) -> np.ndarray:
        """Get next frame.

        Returns:
            Frame as RGB numpy array
        """
        if not self.frames:
            # Emergency fallback
            return np.zeros((self.target_size[1], self.target_size[0], 3), dtype=np.uint8)

        frame = self.frames[self.frame_idx % len(self.frames)]
        self.frame_idx += 1
        return frame.copy()

    async def grab_async(self) -> np.ndarray:
        """Async grab (immediate for mock)."""
        return self.grab()

    def get_pil_image(self) -> Image.Image:
        """Get frame as PIL Image."""
        return Image.fromarray(self.grab())

    def reset(self) -> None:
        """Reset to first frame."""
        self.frame_idx = 0

    def get_stats(self) -> dict[str, Any]:
        """Get mock stats."""
        return {
            "mock": True,
            "total_frames": len(self.frames),
            "current_idx": self.frame_idx,
        }

    def close(self) -> None:
        """Close mock (no-op)."""
        pass

    def __enter__(self) -> "MockFrameCapture":
        return self

    def __exit__(self, *args: Any) -> None:
        pass
