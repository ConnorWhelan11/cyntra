---
name: context-injector
description: |
  Prepare memory context for injection into new workcell prompts.
  Uses progressive disclosure to limit token usage.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "critical"
---

# Context Injector

Prepare memory context for injection into new workcell prompts.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issue` | object | Yes | - | Issue/task being executed |
| `memory_path` | string | Yes | - | Path to memory store directory |
| `max_tokens` | integer | No | 2000 | Maximum tokens for context |
| `domain` | string | No | - | Domain filter (code, fab_asset, fab_world) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `context` | object | Memory context for injection |
| `blocks_used` | array | Block IDs included in context |
| `token_count` | integer | Estimated token count |

## Usage

```bash
python scripts/context-injector.py [arguments]
```

---

*Generated from [`skills/sleeptime/context-injector.yaml`](../../skills/sleeptime/context-injector.yaml)*
