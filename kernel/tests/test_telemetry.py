"""
Test telemetry collection.
"""

import tempfile
from pathlib import Path

from cyntra.adapters.telemetry import TelemetryWriter, read_telemetry_events


def test_telemetry_writer_basic():
    """Test basic telemetry writer functionality."""
    with tempfile.TemporaryDirectory() as tmpdir:
        telemetry_path = Path(tmpdir) / "telemetry.jsonl"

        with TelemetryWriter(telemetry_path) as writer:
            writer.started(
                toolchain="test",
                model="test-model",
                issue_id="1",
                workcell_id="wc-test",
            )
            writer.prompt_sent(prompt="Test prompt", tokens=100)
            writer.response_chunk(content="Response chunk 1")
            writer.response_chunk(content="Response chunk 2")
            writer.completed(status="success", exit_code=0, duration_ms=5000)

        # Verify file exists
        assert telemetry_path.exists()

        # Read and verify events
        events = read_telemetry_events(telemetry_path)
        assert len(events) == 5

        # Check started event
        assert events[0]["type"] == "started"
        assert events[0]["toolchain"] == "test"
        assert events[0]["model"] == "test-model"
        assert events[0]["issue_id"] == "1"

        # Check prompt event
        assert events[1]["type"] == "prompt_sent"
        assert events[1]["prompt"] == "Test prompt"
        assert events[1]["tokens"] == 100

        # Check response chunks
        assert events[2]["type"] == "response_chunk"
        assert events[2]["content"] == "Response chunk 1"
        assert events[3]["type"] == "response_chunk"
        assert events[3]["content"] == "Response chunk 2"

        # Check completed event
        assert events[4]["type"] == "completed"
        assert events[4]["status"] == "success"
        assert events[4]["exit_code"] == 0
        assert events[4]["duration_ms"] == 5000


def test_telemetry_writer_tool_calls():
    """Test telemetry for tool calls and results."""
    with tempfile.TemporaryDirectory() as tmpdir:
        telemetry_path = Path(tmpdir) / "telemetry.jsonl"

        with TelemetryWriter(telemetry_path) as writer:
            writer.tool_call(tool="Read", args={"file_path": "/test/file.py"})
            writer.tool_result(tool="Read", result="file contents here")

            writer.tool_call(tool="Bash", args={"command": "ls -la"})
            writer.tool_result(
                tool="Bash",
                result="",
                error="Command failed",
            )

        events = read_telemetry_events(telemetry_path)
        assert len(events) == 4

        # Check first tool call
        assert events[0]["type"] == "tool_call"
        assert events[0]["tool"] == "Read"
        assert events[0]["args"]["file_path"] == "/test/file.py"

        # Check first tool result
        assert events[1]["type"] == "tool_result"
        assert events[1]["tool"] == "Read"
        assert events[1]["result"] == "file contents here"

        # Check second tool call
        assert events[2]["type"] == "tool_call"
        assert events[2]["tool"] == "Bash"

        # Check error in tool result
        assert events[3]["type"] == "tool_result"
        assert events[3]["error"] == "Command failed"


def test_read_telemetry_with_offset_and_limit():
    """Test reading telemetry with offset and limit."""
    with tempfile.TemporaryDirectory() as tmpdir:
        telemetry_path = Path(tmpdir) / "telemetry.jsonl"

        with TelemetryWriter(telemetry_path) as writer:
            for i in range(10):
                writer.response_chunk(content=f"Chunk {i}")

        # Read all events
        all_events = read_telemetry_events(telemetry_path)
        assert len(all_events) == 10

        # Read with offset
        events = read_telemetry_events(telemetry_path, offset=5)
        assert len(events) == 5
        assert events[0]["content"] == "Chunk 5"

        # Read with limit
        events = read_telemetry_events(telemetry_path, limit=3)
        assert len(events) == 3
        assert events[0]["content"] == "Chunk 0"
        assert events[2]["content"] == "Chunk 2"

        # Read with offset and limit
        events = read_telemetry_events(telemetry_path, offset=3, limit=2)
        assert len(events) == 2
        assert events[0]["content"] == "Chunk 3"
        assert events[1]["content"] == "Chunk 4"


def test_telemetry_writer_error_event():
    """Test error event logging."""
    with tempfile.TemporaryDirectory() as tmpdir:
        telemetry_path = Path(tmpdir) / "telemetry.jsonl"

        with TelemetryWriter(telemetry_path) as writer:
            writer.error("Something went wrong", extra_field="extra_value")

        events = read_telemetry_events(telemetry_path)
        assert len(events) == 1
        assert events[0]["type"] == "error"
        assert events[0]["error"] == "Something went wrong"
        assert events[0]["extra_field"] == "extra_value"


def test_read_empty_telemetry():
    """Test reading non-existent telemetry file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        telemetry_path = Path(tmpdir) / "nonexistent.jsonl"
        events = read_telemetry_events(telemetry_path)
        assert len(events) == 0
