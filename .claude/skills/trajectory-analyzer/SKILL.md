---
name: trajectory-analyzer
description: |
  Compute tool usage stats, file change summaries, transition boundaries.
  Analyzes agent trajectories for patterns and metrics.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "medium"
---

# Trajectory Analyzer

Compute tool usage stats, file change summaries, transition boundaries.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rollout_path` | string | Yes | - | Path to rollout.json |
| `compute_transitions` | boolean | No | false | Compute T1 state transitions |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `tool_summary` | object | Tool usage counts and patterns |
| `file_changes` | array | Files modified with change types |
| `transitions` | array | State transitions (if requested) |
| `metrics` | object | Duration, cost, quality metrics |

## Usage

```bash
python scripts/trajectory-analyzer.py [arguments]
```

---

*Generated from [`skills/development/trajectory-analyzer.yaml`](../../skills/development/trajectory-analyzer.yaml)*
