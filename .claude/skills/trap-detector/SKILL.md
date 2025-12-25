---
name: trap-detector
description: |
  Use dynamics data to identify stuck states and create trap warnings.
  Integrates with dynamics layer potential/action metrics.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "high"
---

# Trap Detector

Use dynamics data to identify stuck states and create trap warnings.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dynamics_report_path` | string | Yes | - | Path to dynamics_report.json |
| `memory_path` | string | Yes | - | Path to memory store directory |
| `action_threshold` | number | No | 0.2 | Action rate below which state is considered trapped |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `traps_detected` | array | Newly detected trap states |
| `trap_blocks_created` | array | Memory blocks created for traps |
| `recommendations` | array | Recommendations to escape traps |

## Usage

```bash
python scripts/trap-detector.py [arguments]
```

---

*Generated from [`skills/sleeptime/trap-detector.yaml`](../../skills/sleeptime/trap-detector.yaml)*
