#!/usr/bin/env python3
"""
Telemetry Parser Skill

Parse adapter-specific telemetry formats into normalized event stream.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def detect_adapter_type(events: list[dict[str, Any]]) -> str:
    """Auto-detect adapter type from event patterns."""
    # Check first few events for adapter-specific patterns
    for event in events[:10]:
        event_type = event.get("type", "")

        # Codex typically has specific event types
        if event_type in ("codex_prompt", "codex_response"):
            return "codex"

        # Claude has different patterns
        if event_type in ("claude_prompt", "claude_response"):
            return "claude"

    # Default to generic
    return "generic"


def normalize_event(event: dict[str, Any], adapter_type: str) -> dict[str, Any] | None:
    """Normalize event to common format."""
    event_type = event.get("type", "")

    # Common normalized event structure
    normalized = {
        "timestamp": event.get("timestamp"),
        "type": event_type,
        "raw_type": event_type,
        "adapter": adapter_type,
    }

    # File operations
    if event_type == "file_read":
        normalized["category"] = "file_io"
        normalized["operation"] = "read"
        normalized["path"] = event.get("path")
        normalized["size_bytes"] = event.get("size_bytes")

    elif event_type == "file_write":
        normalized["category"] = "file_io"
        normalized["operation"] = "write"
        normalized["path"] = event.get("path")
        normalized["size_bytes"] = event.get("size_bytes")

    # Command execution
    elif event_type in ("bash_command", "command"):
        normalized["category"] = "execution"
        normalized["operation"] = "command"
        normalized["command"] = event.get("command")

    elif event_type in ("bash_output", "command_output"):
        normalized["category"] = "execution"
        normalized["operation"] = "output"
        normalized["exit_code"] = event.get("exit_code")

    # Tool calls
    elif event_type == "tool_call":
        normalized["category"] = "tool"
        normalized["operation"] = "call"
        normalized["tool"] = event.get("tool")
        normalized["args"] = event.get("args")

    # LLM interactions
    elif "prompt" in event_type:
        normalized["category"] = "llm"
        normalized["operation"] = "prompt"
        normalized["model"] = event.get("model")
        normalized["tokens"] = event.get("tokens")

    elif "response" in event_type:
        normalized["category"] = "llm"
        normalized["operation"] = "response"
        normalized["model"] = event.get("model")
        normalized["tokens"] = event.get("tokens")

    else:
        # Unknown event type, include raw
        normalized["category"] = "unknown"
        normalized["raw_event"] = event

    return normalized


def execute(
    telemetry_path: str | Path,
    adapter_type: str = "auto-detect",
) -> dict[str, Any]:
    """
    Parse telemetry file into normalized events.

    Args:
        telemetry_path: Path to telemetry.jsonl
        adapter_type: Adapter type or "auto-detect"

    Returns:
        {
            "events": [...],
            "summary": {...},
            "adapter_detected": str
        }
    """
    telemetry_path = Path(telemetry_path)

    if not telemetry_path.exists():
        return {
            "success": False,
            "error": f"Telemetry file not found: {telemetry_path}",
        }

    # Read all events
    raw_events = []
    try:
        with open(telemetry_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    raw_events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError as e:
        return {
            "success": False,
            "error": f"Failed to read telemetry: {e}",
        }

    if not raw_events:
        return {
            "success": True,
            "events": [],
            "summary": {"event_count": 0, "by_category": {}},
            "adapter_detected": "none",
        }

    # Auto-detect adapter if needed
    if adapter_type == "auto-detect":
        adapter_type = detect_adapter_type(raw_events)

    # Normalize events
    events = []
    for raw_event in raw_events:
        normalized = normalize_event(raw_event, adapter_type)
        if normalized:
            events.append(normalized)

    # Build summary
    by_category = {}
    by_type = {}

    for event in events:
        category = event.get("category", "unknown")
        event_type = event.get("type", "unknown")

        by_category[category] = by_category.get(category, 0) + 1
        by_type[event_type] = by_type.get(event_type, 0) + 1

    summary = {
        "event_count": len(events),
        "raw_event_count": len(raw_events),
        "by_category": by_category,
        "by_type": by_type,
    }

    return {
        "success": True,
        "events": events,
        "summary": summary,
        "adapter_detected": adapter_type,
    }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Parse telemetry file")
    parser.add_argument("telemetry_path", help="Path to telemetry.jsonl")
    parser.add_argument("--adapter", default="auto-detect", help="Adapter type")
    parser.add_argument("--output", help="Output path for parsed events JSON")

    args = parser.parse_args()

    result = execute(args.telemetry_path, args.adapter)

    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
