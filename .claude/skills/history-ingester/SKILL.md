---
name: history-ingester
description: |
  Scan .cyntra/runs/ for recent completions not yet processed by sleeptime.
  Yields structured summaries for downstream consolidation. Tracks watermark
  to avoid reprocessing.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "high"
---

# History Ingester

Scan .cyntra/runs/ for recent completions not yet processed by sleeptime.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `since_timestamp` | string | No | - | ISO timestamp to scan from (or use stored watermark) |
| `include_only` | string | No | all | Filter by outcome (all, failures, successes) |
| `max_runs` | integer | No | 20 | Maximum runs to process in one batch |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `run_summaries` | array | Structured summaries of each run: - run_id, outcome, duration_ms - toolchain, genome_id - tool_sequence (ordered list of tools called) - error_signature (if failed) - files_modified - gate_results |
| `unprocessed_count` | integer | Remaining runs not yet processed |
| `watermark` | string | New watermark timestamp for next invocation |

## Usage

```bash
python scripts/history-ingester.py [arguments]
```

## Examples

### Ingest last 10 failed runs

**Inputs:**
```yaml
include_only: failures
max_runs: 10
```

**Outputs:**
```yaml
run_summaries:
- '...'
unprocessed_count: 3
```

---

*Generated from [`skills/sleeptime/history-ingester.yaml`](../../skills/sleeptime/history-ingester.yaml)*
