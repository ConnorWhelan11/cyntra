---
name: dynamics-reporter
description: |
  Generate dynamics_report.json with V(state), action metrics, trap warnings.
  Produces comprehensive dynamics analysis for exploration tuning.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "high"
---

# Dynamics Reporter

Generate dynamics_report.json with V(state), action metrics, trap warnings.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dynamics_db_path` | string | Yes | - | Path to dynamics SQLite database |
| `window_days` | integer | No | 30 | Number of days to include in window |
| `smoothing_alpha` | number | No | 1.0 | Smoothing parameter for estimates |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `report_path` | string | Path to generated dynamics_report.json |
| `traps_detected` | array | States with trapping behavior |
| `controller_recommendations` | object | Per-domain exploration parameter recommendations |

## Usage

```bash
python scripts/dynamics-reporter.py [arguments]
```

---

*Generated from [`skills/development/dynamics-reporter.yaml`](../../skills/development/dynamics-reporter.yaml)*
