---
name: memory-consolidator
description: |
  Compress observations and patterns into memory blocks.
  Maintains the shared memory store with consolidated knowledge.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "critical"
---

# Memory Consolidator

Compress observations and patterns into memory blocks.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `memory_path` | string | Yes | - | Path to memory store directory |
| `patterns` | array | Yes | - | Patterns from pattern-extractor |
| `confidence_threshold` | number | No | 0.7 | Minimum confidence for block creation |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `blocks_created` | array | IDs of new memory blocks |
| `blocks_updated` | array | IDs of updated blocks |
| `blocks_pruned` | array | IDs of pruned low-value blocks |

## Usage

```bash
python scripts/memory-consolidator.py [arguments]
```

---

*Generated from [`skills/sleeptime/memory-consolidator.yaml`](../../skills/sleeptime/memory-consolidator.yaml)*
