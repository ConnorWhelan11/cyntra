---
name: strategic-forgetter
description: |
  Prune outdated and low-value memories to maintain efficiency.
  Uses decay rates, usage stats, and recency.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "medium"
---

# Strategic Forgetter

Prune outdated and low-value memories to maintain efficiency.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `memory_path` | string | Yes | - | Path to memory store directory |
| `decay_rate` | number | No | 0.1 | Daily decay rate for unused blocks |
| `min_usage` | integer | No | 2 | Minimum usage count for retention |
| `max_age_days` | integer | No | 30 | Maximum age before mandatory review |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `pruned_blocks` | array | IDs of pruned blocks |
| `archived_blocks` | array | IDs of archived (not deleted) blocks |
| `space_freed_kb` | number | Storage space freed |

## Usage

```bash
python scripts/strategic-forgetter.py [arguments]
```

---

*Generated from [`skills/sleeptime/strategic-forgetter.yaml`](../../skills/sleeptime/strategic-forgetter.yaml)*
