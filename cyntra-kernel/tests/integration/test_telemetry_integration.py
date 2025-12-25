"""
Integration test for telemetry collection in adapters.
"""

import asyncio
import json
import tempfile
from datetime import timedelta
from pathlib import Path

import pytest

from cyntra.adapters.telemetry import TelemetryWriter, read_telemetry_events


@pytest.mark.asyncio
async def test_telemetry_integration_with_adapter():
    """Test telemetry collection in a simulated adapter execution."""
    with tempfile.TemporaryDirectory() as tmpdir:
        workcell_path = Path(tmpdir)
        telemetry_path = workcell_path / "telemetry.jsonl"

        # Simulate what an adapter does during execution
        manifest = {
            "workcell_id": "wc-test-123",
            "issue": {"id": "42", "title": "Test issue"},
            "toolchain": "test",
        }

        # Create telemetry writer
        telemetry = TelemetryWriter(telemetry_path)

        try:
            # Simulate adapter workflow
            telemetry.started(
                toolchain="test",
                model="test-model-v1",
                issue_id=manifest["issue"]["id"],
                workcell_id=manifest["workcell_id"],
            )

            # Simulate sending prompt
            prompt = "Write a function to calculate fibonacci numbers"
            telemetry.prompt_sent(prompt=prompt, tokens=50)

            # Simulate some work happening
            await asyncio.sleep(0.01)

            # Simulate response chunks
            chunks = [
                "def fibonacci(n):",
                "    if n <= 1:",
                "        return n",
                "    return fibonacci(n-1) + fibonacci(n-2)",
            ]
            for chunk in chunks:
                telemetry.response_chunk(content=chunk)
                await asyncio.sleep(0.005)

            # Simulate tool calls
            telemetry.tool_call(tool="Write", args={"file_path": "fibonacci.py"})
            telemetry.tool_result(tool="Write", result="File written successfully")

            telemetry.tool_call(tool="Bash", args={"command": "python fibonacci.py"})
            telemetry.tool_result(tool="Bash", result="Tests passed", exit_code=0)

            # Simulate completion
            telemetry.completed(status="success", exit_code=0, duration_ms=1500)

        finally:
            telemetry.close()

        # Verify telemetry file was created
        assert telemetry_path.exists()

        # Read and verify events
        events = read_telemetry_events(telemetry_path)

        # Should have: started, prompt, 4 chunks, 2 tool_calls, 2 tool_results, completed
        assert len(events) >= 10

        # Verify event sequence
        event_types = [e["type"] for e in events]
        assert event_types[0] == "started"
        assert event_types[1] == "prompt_sent"
        assert "response_chunk" in event_types
        assert "tool_call" in event_types
        assert "tool_result" in event_types
        assert event_types[-1] == "completed"

        # Verify event contents
        started = events[0]
        assert started["toolchain"] == "test"
        assert started["model"] == "test-model-v1"
        assert started["issue_id"] == "42"

        prompt_event = events[1]
        assert prompt_event["prompt"] == prompt

        completed = events[-1]
        assert completed["status"] == "success"
        assert completed["exit_code"] == 0


@pytest.mark.asyncio
async def test_telemetry_with_errors():
    """Test telemetry collection when errors occur."""
    with tempfile.TemporaryDirectory() as tmpdir:
        workcell_path = Path(tmpdir)
        telemetry_path = workcell_path / "telemetry.jsonl"

        telemetry = TelemetryWriter(telemetry_path)

        try:
            telemetry.started(
                toolchain="test",
                model="test-model",
                issue_id="99",
                workcell_id="wc-error-test",
            )

            telemetry.prompt_sent(prompt="Test prompt")

            # Simulate a tool call that fails
            telemetry.tool_call(tool="Bash", args={"command": "invalid-command"})
            telemetry.tool_result(
                tool="Bash",
                result="",
                error="Command not found: invalid-command",
                exit_code=127,
            )

            # Simulate adapter error
            telemetry.error("Execution failed due to tool error")

            # Mark as failed
            telemetry.completed(status="failed", exit_code=1, duration_ms=500)

        finally:
            telemetry.close()

        # Read and verify error events
        events = read_telemetry_events(telemetry_path)

        # Find error events
        tool_result = next(e for e in events if e["type"] == "tool_result")
        assert tool_result["error"] == "Command not found: invalid-command"
        assert tool_result["exit_code"] == 127

        error_event = next(e for e in events if e["type"] == "error")
        assert error_event["error"] == "Execution failed due to tool error"

        completed = events[-1]
        assert completed["status"] == "failed"
        assert completed["exit_code"] == 1


def test_telemetry_file_format():
    """Verify telemetry file uses correct JSONL format."""
    with tempfile.TemporaryDirectory() as tmpdir:
        telemetry_path = Path(tmpdir) / "telemetry.jsonl"

        with TelemetryWriter(telemetry_path) as writer:
            writer.started(
                toolchain="test", model="test", issue_id="1", workcell_id="wc-1"
            )
            writer.prompt_sent(prompt="test")
            writer.completed(status="success", exit_code=0, duration_ms=100)

        # Read raw file and verify each line is valid JSON
        with open(telemetry_path, "r") as f:
            lines = f.readlines()

        assert len(lines) == 3

        for line in lines:
            # Each line should be valid JSON
            event = json.loads(line)
            # Each event should have type and timestamp
            assert "type" in event
            assert "timestamp" in event
            # Timestamp should be ISO format
            assert "T" in event["timestamp"]
            assert "Z" in event["timestamp"]
