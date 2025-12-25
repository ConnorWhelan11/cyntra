---
name: multi-signal-critic
description: |
  Aggregate realism/geometry/category critics into weighted overall score.
  Combines multiple evaluation signals.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "high"
---

# Multi Signal Critic

Aggregate realism/geometry/category critics into weighted overall score.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `critic_reports` | array | Yes | - | Paths to individual critic report JSONs |
| `weights` | object | No | - | Per-critic weights for aggregation |
| `thresholds` | object | No | - | Pass/fail thresholds per critic |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `overall_score` | number | Weighted overall score (0-1) |
| `passed` | boolean | True if all thresholds met |
| `breakdown` | object | Per-critic scores and weights |
| `recommendations` | array | Suggested improvements based on scores |

## Usage

```bash
python scripts/multi-signal-critic.py [arguments]
```

---

*Generated from [`skills/fab/multi-signal-critic.yaml`](../../skills/fab/multi-signal-critic.yaml)*
