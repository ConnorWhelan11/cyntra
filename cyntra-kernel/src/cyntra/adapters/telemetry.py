"""
Telemetry system for adapter execution observability.

Provides real-time logging of LLM interactions, tool calls, and execution events
to JSONL files for streaming to the desktop app.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import structlog

logger = structlog.get_logger()

EventType = Literal[
    "started",
    "prompt_sent",
    "response_chunk",
    "response_complete",
    "tool_call",
    "tool_result",
    "file_read",
    "file_write",
    "bash_command",
    "bash_output",
    "thinking",
    "completed",
    "error",
]


def _utc_now() -> str:
    """Get current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class TelemetryWriter:
    """
    Thread-safe JSONL writer for adapter telemetry events.

    Events are written one per line to enable streaming and tail-following
    from the desktop app.
    """

    def __init__(self, telemetry_path: Path) -> None:
        """
        Initialize telemetry writer.

        Args:
            telemetry_path: Path to telemetry.jsonl file
        """
        self.path = telemetry_path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._file: Any = None
        self._open()

    def _open(self) -> None:
        """Open the telemetry file for appending."""
        try:
            self._file = open(self.path, "a", encoding="utf-8", buffering=1)
        except Exception as e:
            logger.error("Failed to open telemetry file", path=str(self.path), error=str(e))

    def emit(self, event_type: EventType, data: dict[str, Any] | None = None) -> None:
        """
        Emit a telemetry event.

        Args:
            event_type: Type of event
            data: Additional event data
        """
        event = {
            "type": event_type,
            "timestamp": _utc_now(),
            **(data or {}),
        }

        with self._lock:
            if self._file and not self._file.closed:
                try:
                    self._file.write(json.dumps(event) + "\n")
                    self._file.flush()
                except Exception as e:
                    logger.error(
                        "Failed to write telemetry event",
                        event_type=event_type,
                        error=str(e),
                    )

    def started(self, toolchain: str, model: str, issue_id: str, **extra: Any) -> None:
        """Emit execution started event."""
        self.emit("started", {"toolchain": toolchain, "model": model, "issue_id": issue_id, **extra})

    def prompt_sent(self, prompt: str, tokens: int | None = None, **extra: Any) -> None:
        """Emit prompt sent event."""
        self.emit("prompt_sent", {"prompt": prompt, "tokens": tokens, **extra})

    def response_chunk(self, content: str, role: str = "assistant", **extra: Any) -> None:
        """Emit response chunk event (for streaming responses)."""
        self.emit("response_chunk", {"content": content, "role": role, **extra})

    def response_complete(self, content: str, role: str = "assistant", tokens: int | None = None, **extra: Any) -> None:
        """Emit complete response event."""
        self.emit("response_complete", {"content": content, "role": role, "tokens": tokens, **extra})

    def tool_call(self, tool: str, args: dict[str, Any] | None = None, **extra: Any) -> None:
        """Emit tool call event."""
        self.emit("tool_call", {"tool": tool, "args": args or {}, **extra})

    def tool_result(self, tool: str, result: Any, error: str | None = None, **extra: Any) -> None:
        """Emit tool result event."""
        self.emit("tool_result", {"tool": tool, "result": result, "error": error, **extra})

    def file_read(self, path: str, **extra: Any) -> None:
        """Emit file read event."""
        self.emit("file_read", {"path": path, **extra})

    def file_write(self, path: str, **extra: Any) -> None:
        """Emit file write event."""
        self.emit("file_write", {"path": path, **extra})

    def bash_command(self, command: str, **extra: Any) -> None:
        """Emit bash command event."""
        self.emit("bash_command", {"command": command, **extra})

    def bash_output(self, output: str, exit_code: int | None = None, **extra: Any) -> None:
        """Emit bash output event."""
        self.emit("bash_output", {"output": output, "exit_code": exit_code, **extra})

    def thinking(self, content: str, **extra: Any) -> None:
        """Emit thinking/planning event."""
        self.emit("thinking", {"content": content, **extra})

    def completed(self, status: str, exit_code: int, duration_ms: int, **extra: Any) -> None:
        """Emit execution completed event."""
        self.emit("completed", {"status": status, "exit_code": exit_code, "duration_ms": duration_ms, **extra})

    def error(self, error: str, **extra: Any) -> None:
        """Emit error event."""
        self.emit("error", {"error": error, **extra})

    def close(self) -> None:
        """Close the telemetry file."""
        with self._lock:
            if self._file and not self._file.closed:
                try:
                    self._file.close()
                except Exception as e:
                    logger.error("Failed to close telemetry file", error=str(e))

    def __enter__(self) -> TelemetryWriter:
        """Context manager entry."""
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.close()


def read_telemetry_events(telemetry_path: Path, offset: int = 0, limit: int | None = None) -> list[dict[str, Any]]:
    """
    Read telemetry events from JSONL file.

    Args:
        telemetry_path: Path to telemetry.jsonl file
        offset: Number of events to skip from start
        limit: Maximum number of events to return

    Returns:
        List of telemetry events
    """
    if not telemetry_path.exists():
        return []

    events: list[dict[str, Any]] = []

    try:
        with open(telemetry_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i < offset:
                    continue
                if limit and len(events) >= limit:
                    break

                try:
                    event = json.loads(line.strip())
                    events.append(event)
                except json.JSONDecodeError as e:
                    logger.warning("Failed to parse telemetry event", line_num=i, error=str(e))

    except Exception as e:
        logger.error("Failed to read telemetry file", path=str(telemetry_path), error=str(e))

    return events
