"""Frame capture and state extraction module."""

from capture.frame_capture import FrameCapture, MockFrameCapture
from capture.frame_buffer import FrameBuffer
from capture.state_extractor import StateExtractor

__all__ = [
    "FrameCapture",
    "MockFrameCapture",
    "FrameBuffer",
    "StateExtractor",
]
