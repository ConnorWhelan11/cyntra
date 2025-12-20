# LLM Telemetry System

This document describes the telemetry collection system for observing LLM adapter executions in real-time.

## Overview

The telemetry system provides real-time visibility into what LLM adapters (Claude, Codex, etc.) are doing during workcell execution. This solves the "black box" problem where you could see a workcell running but had no insight into the LLM's thought process, tool usage, or progress.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Adapter (Claude/Codex/etc)                      │
│  - Streams events to telemetry writer           │
│  - Records: prompts, responses, tool calls, etc │
└──────────────────┬──────────────────────────────┘
                   │ writes to
┌──────────────────▼──────────────────────────────┐
│ Workcell Telemetry Log                          │
│  .workcells/wc-XXX/telemetry.jsonl              │
│  - One JSON event per line                      │
│  - Timestamped, typed events                    │
└──────────────────┬──────────────────────────────┘
                   │ reads via
┌──────────────────▼──────────────────────────────┐
│ Kernel API (Tauri commands)                     │
│  - workcell_get_info(params)                    │
│  - workcell_get_telemetry(params)               │
└──────────────────┬──────────────────────────────┘
                   │ consumed by
┌──────────────────▼──────────────────────────────┐
│ Desktop App UI                                  │
│  - Workcell detail modal                        │
│  - Live conversation view                       │
│  - Tool calls, file changes, etc                │
└─────────────────────────────────────────────────┘
```

## Telemetry Events

Events are written as JSONL (JSON Lines) with one event per line. Each event has:
- `type`: Event type identifier
- `timestamp`: ISO 8601 timestamp in UTC
- Additional fields specific to event type

### Event Types

#### `started`
Emitted when adapter execution begins.

```json
{
  "type": "started",
  "timestamp": "2025-12-18T22:41:05.312Z",
  "toolchain": "claude",
  "model": "opus",
  "issue_id": "1",
  "workcell_id": "wc-1-20251218T221223Z"
}
```

#### `prompt_sent`
Emitted when initial prompt is sent to LLM.

```json
{
  "type": "prompt_sent",
  "timestamp": "2025-12-18T22:41:05.414Z",
  "prompt": "# Task: ...",
  "tokens": 150
}
```

#### `response_chunk`
Emitted for each chunk of LLM response (real-time streaming).

```json
{
  "type": "response_chunk",
  "timestamp": "2025-12-18T22:41:05.615Z",
  "content": "I'll help you create...",
  "role": "assistant"
}
```

#### `response_complete`
Emitted when full response is received.

```json
{
  "type": "response_complete",
  "timestamp": "2025-12-18T22:41:10.123Z",
  "content": "Complete response text...",
  "role": "assistant",
  "tokens": 250
}
```

#### `tool_call`
Emitted when LLM requests a tool execution.

```json
{
  "type": "tool_call",
  "timestamp": "2025-12-18T22:41:06.123Z",
  "tool": "Read",
  "args": {
    "file_path": "fab/scripts/generate.py"
  }
}
```

#### `tool_result`
Emitted when tool execution completes.

```json
{
  "type": "tool_result",
  "timestamp": "2025-12-18T22:41:06.234Z",
  "tool": "Read",
  "result": "<file contents>",
  "error": null
}
```

#### `completed`
Emitted when adapter execution finishes.

```json
{
  "type": "completed",
  "timestamp": "2025-12-18T22:41:15.456Z",
  "status": "success",
  "exit_code": 0,
  "duration_ms": 12500
}
```

#### `error`
Emitted when errors occur.

```json
{
  "type": "error",
  "timestamp": "2025-12-18T22:41:08.789Z",
  "error": "Failed to execute command: ..."
}
```

## Usage

### For Adapter Developers

When implementing a new adapter, use `TelemetryWriter` to emit events:

```python
from dev_kernel.adapters.telemetry import TelemetryWriter

async def execute(self, manifest, workcell_path, timeout):
    telemetry = TelemetryWriter(workcell_path / "telemetry.jsonl")

    try:
        # Emit start event
        telemetry.started(
            toolchain=self.name,
            model=model,
            issue_id=manifest["issue"]["id"],
            workcell_id=manifest["workcell_id"],
        )

        # Emit prompt
        prompt = self._build_prompt(manifest)
        telemetry.prompt_sent(prompt=prompt)

        # Stream LLM output
        async for chunk in llm_stream():
            telemetry.response_chunk(content=chunk)

        # Emit tool calls
        telemetry.tool_call(tool="Read", args={"file_path": "..."})
        telemetry.tool_result(tool="Read", result="...")

        # Emit completion
        telemetry.completed(status="success", exit_code=0, duration_ms=1000)

    except Exception as e:
        telemetry.error(str(e))
        raise
    finally:
        telemetry.close()
```

### For Desktop App Users

1. Open the Kernel tab in Glia Fab Desktop
2. Find the workcell you want to inspect in the Workcells panel
3. Click "View Details" button
4. The Workcell Detail modal will open showing:
   - Real-time telemetry stream (auto-refreshes every 2s)
   - Conversation-style view of prompts and responses
   - Tool calls with expandable arguments
   - Tool results with error highlighting
   - Completion status and timing

## API Reference

### Python API

#### `TelemetryWriter`

Thread-safe JSONL writer for telemetry events.

```python
class TelemetryWriter:
    def __init__(self, telemetry_path: Path)
    def emit(self, event_type: EventType, data: dict | None)
    def started(self, toolchain: str, model: str, issue_id: str, **extra)
    def prompt_sent(self, prompt: str, tokens: int | None, **extra)
    def response_chunk(self, content: str, role: str = "assistant", **extra)
    def response_complete(self, content: str, tokens: int | None, **extra)
    def tool_call(self, tool: str, args: dict | None, **extra)
    def tool_result(self, tool: str, result: Any, error: str | None, **extra)
    def completed(self, status: str, exit_code: int, duration_ms: int, **extra)
    def error(self, error: str, **extra)
    def close(self)
```

#### `read_telemetry_events`

Read telemetry events from JSONL file.

```python
def read_telemetry_events(
    telemetry_path: Path,
    offset: int = 0,
    limit: int | None = None
) -> list[dict[str, Any]]
```

### Tauri Commands

#### `workcell_get_info`

Get workcell metadata.

```typescript
invoke<WorkcellInfo>('workcell_get_info', {
  params: {
    projectRoot: string,
    workcellId: string
  }
})
```

Returns:
```typescript
{
  id: string,
  issueId: string,
  toolchain: string | null,
  created: string | null,
  speculateTag: string | null,
  hasTelemetry: boolean,
  hasProof: boolean,
  hasLogs: boolean
}
```

#### `workcell_get_telemetry`

Get telemetry events.

```typescript
invoke<TelemetryEvent[]>('workcell_get_telemetry', {
  params: {
    projectRoot: string,
    workcellId: string,
    offset?: number,
    limit?: number
  }
})
```

Returns:
```typescript
Array<{
  eventType: string,
  timestamp: string,
  data: Record<string, any>
}>
```

## File Locations

- **Telemetry files**: `.workcells/<workcell-id>/telemetry.jsonl`
- **Python implementation**: `dev-kernel/src/dev_kernel/adapters/telemetry.py`
- **Tauri commands**: `apps/glia-fab-desktop/src-tauri/src/main.rs`
- **UI component**: `apps/glia-fab-desktop/src/WorkcellDetail.tsx`
- **Tests**: `dev-kernel/tests/test_telemetry.py`

## Testing

Run telemetry tests:

```bash
cd dev-kernel
pytest tests/test_telemetry.py -v
pytest tests/integration/test_telemetry_integration.py -v
```

Create demo telemetry for UI testing:

```bash
cd dev-kernel
python scripts/create_demo_telemetry.py
```

## Performance Considerations

- **Async I/O**: Telemetry writing is buffered and flushed after each event
- **Minimal overhead**: Events are written directly to disk without batching
- **Thread-safe**: Multiple threads can write to the same telemetry file
- **Auto-refresh**: Desktop app polls telemetry every 2 seconds (configurable)
- **File size**: JSONL format keeps file size reasonable for long-running tasks

## Future Enhancements

Potential improvements:

1. **WebSocket streaming**: Push events to UI instead of polling
2. **Structured parsing**: Parse LLM tool use from response text
3. **Performance metrics**: Track token usage, cost, latency per tool
4. **Search/filter**: Full-text search across telemetry events
5. **Export**: Download telemetry as JSON or analyze in external tools
6. **Replay**: Re-run failed tasks with same inputs for debugging
