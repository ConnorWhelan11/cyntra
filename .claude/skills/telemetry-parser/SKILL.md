---
name: telemetry-parser
description: |
  Parse adapter-specific telemetry formats into normalized event stream.
  Handles different formats from Codex/Claude/OpenCode/Crush adapters.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "high"
---

# Telemetry Parser

Parse adapter-specific telemetry formats into normalized event stream.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `telemetry_path` | string | Yes | - | Path to telemetry.jsonl file |
| `adapter_type` | string | No | auto-detect | Adapter type (codex, claude, opencode, crush, auto-detect) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `events` | array | Normalized event stream |
| `summary` | object | Event summary (counts by type, tools used, etc.) |
| `adapter_detected` | string | Detected adapter type |

## Usage

```bash
python scripts/telemetry-parser.py [arguments]
```

---

*Generated from [`skills/development/telemetry-parser.yaml`](../../skills/development/telemetry-parser.yaml)*
