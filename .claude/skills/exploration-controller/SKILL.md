---
name: exploration-controller
description: |
  Adjust temperature/parallelism/M based on action bands and ΔV trends.
  Closed-loop exploration/exploitation control.
  
  Use when working on evolution tasks.
metadata:
  version: "1.0.0"
  category: "evolution"
  priority: "critical"
---

# Exploration Controller

Adjust temperature/parallelism/M based on action bands and ΔV trends.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dynamics_report_path` | string | Yes | - | Path to current dynamics_report.json |
| `domain` | string | Yes | - | Domain to tune (code, fab_asset, fab_world) |
| `current_config` | object | Yes | - | Current exploration configuration |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `updated_config` | object | New exploration parameters |
| `adjustments` | array | List of parameter changes made |
| `rationale` | string | Explanation for adjustments |
| `mode` | string | Control mode (explore, exploit, balanced) |

## Usage

```bash
python scripts/exploration-controller.py [arguments]
```

---

*Generated from [`skills/evolution/exploration-controller.yaml`](../../skills/evolution/exploration-controller.yaml)*
