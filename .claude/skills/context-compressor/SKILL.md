---
name: context-compressor
description: |
  Compress verbose historical context into dense, actionable summaries.
  Takes raw run logs, conversation histories, or telemetry and produces
  compact representations suitable for injection into agent prompts.
  
  Uses hierarchical summarization: detail -> summary -> headline.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "medium"
---

# Context Compressor

Compress verbose historical context into dense, actionable summaries.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `source_type` | string | Yes | - | Type of content to compress |
| `source_paths` | array | Yes | - | Paths to source files/directories |
| `target_tokens` | integer | No | 500 | Target compressed size in tokens |
| `preserve_priority` | array | No | `['errors', 'tool_calls', 'outcomes']` | Content types to preserve with higher fidelity |
| `compression_level` | string | No | medium | How aggressively to compress |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `compressed_context` | string | Dense markdown summary |
| `compression_ratio` | number | Original tokens / compressed tokens |
| `preserved_items` | object | Counts of each preserved content type |
| `dropped_items` | object | What was omitted and why |

## Usage

```bash
python scripts/context-compressor.py [arguments]
```

## Examples

### Compress 10 run logs into 500 token summary

**Inputs:**
```yaml
compression_level: medium
source_paths:
- .cyntra/runs/run_001/
- .cyntra/runs/run_002/
source_type: run_logs
target_tokens: 500
```

**Outputs:**
```yaml
compressed_context: '## Recent Runs Summary (10 runs, 7 passed)


  ### Failures

  - run_003: pytest failed, missing fixture `db_session`

  - run_007: mypy error in scheduler.py:142

  - run_009: timeout after 120s in Bash(npm test)


  ### Successful Patterns

  - Read->Edit->pytest chain: 6/6 success

  - Grep before Edit: 5/5 success


  ### Files Most Modified

  - src/kernel/scheduler.py (4 runs)

  - tests/unit/test_routing.py (3 runs)

  '
compression_ratio: 12.4
```

---

*Generated from [`skills/sleeptime/context-compressor.yaml`](../../skills/sleeptime/context-compressor.yaml)*
