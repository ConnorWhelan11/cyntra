"""Ring buffer for storing recent frames."""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class TimestampedFrame:
    """A frame with its capture timestamp."""

    frame: np.ndarray
    timestamp: float
    frame_id: int


class FrameBuffer:
    """Ring buffer storing recent frames with timestamps.

    Provides access to:
    - Latest frame
    - Frames at specific timestamps
    - Context frames for temporal reasoning
    """

    def __init__(
        self,
        max_frames: int = 120,  # 2 seconds at 60 FPS
    ) -> None:
        """Initialize frame buffer.

        Args:
            max_frames: Maximum frames to store
        """
        self.max_frames = max_frames
        self._buffer: deque[TimestampedFrame] = deque(maxlen=max_frames)
        self._frame_counter = 0

    def add(self, frame: np.ndarray) -> int:
        """Add a frame to the buffer.

        Args:
            frame: Frame as numpy array

        Returns:
            Frame ID
        """
        self._frame_counter += 1
        entry = TimestampedFrame(
            frame=frame.copy(),
            timestamp=time.time(),
            frame_id=self._frame_counter,
        )
        self._buffer.append(entry)
        return self._frame_counter

    def get_latest(self) -> np.ndarray | None:
        """Get the most recent frame.

        Returns:
            Latest frame or None if buffer is empty
        """
        if not self._buffer:
            return None
        return self._buffer[-1].frame

    def get_latest_with_timestamp(self) -> tuple[np.ndarray, float, int] | None:
        """Get latest frame with metadata.

        Returns:
            Tuple of (frame, timestamp, frame_id) or None
        """
        if not self._buffer:
            return None
        entry = self._buffer[-1]
        return entry.frame, entry.timestamp, entry.frame_id

    def get_context_frames(self, n: int = 4) -> list[np.ndarray]:
        """Get the last N frames for temporal context.

        Args:
            n: Number of frames to retrieve

        Returns:
            List of frames (oldest first)
        """
        if not self._buffer:
            return []

        frames = list(self._buffer)[-n:]
        return [f.frame for f in frames]

    def get_frame_at(self, seconds_ago: float) -> np.ndarray | None:
        """Get frame from approximately N seconds ago.

        Args:
            seconds_ago: How far back to look

        Returns:
            Frame from that time, or None if not available
        """
        if not self._buffer:
            return None

        target_ts = time.time() - seconds_ago

        # Binary search for closest frame
        best: TimestampedFrame | None = None
        best_diff = float("inf")

        for entry in self._buffer:
            diff = abs(entry.timestamp - target_ts)
            if diff < best_diff:
                best_diff = diff
                best = entry

        return best.frame if best else None

    def get_frames_in_range(
        self,
        start_seconds_ago: float,
        end_seconds_ago: float = 0,
    ) -> list[TimestampedFrame]:
        """Get all frames in a time range.

        Args:
            start_seconds_ago: Start of range (further back)
            end_seconds_ago: End of range (closer to now)

        Returns:
            List of TimestampedFrame in range
        """
        now = time.time()
        start_ts = now - start_seconds_ago
        end_ts = now - end_seconds_ago

        return [
            entry
            for entry in self._buffer
            if start_ts <= entry.timestamp <= end_ts
        ]

    def __len__(self) -> int:
        """Get current buffer size."""
        return len(self._buffer)

    def clear(self) -> None:
        """Clear the buffer."""
        self._buffer.clear()

    def get_stats(self) -> dict[str, Any]:
        """Get buffer statistics."""
        if not self._buffer:
            return {
                "size": 0,
                "max_size": self.max_frames,
                "duration_s": 0,
            }

        oldest_ts = self._buffer[0].timestamp
        newest_ts = self._buffer[-1].timestamp

        return {
            "size": len(self._buffer),
            "max_size": self.max_frames,
            "duration_s": newest_ts - oldest_ts,
            "oldest_frame_id": self._buffer[0].frame_id,
            "newest_frame_id": self._buffer[-1].frame_id,
            "total_frames_processed": self._frame_counter,
        }
