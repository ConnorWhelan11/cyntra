---
name: fab-gate-evaluator
description: |
  Run gate config (YAML) against asset, produce verdict JSON with critic reports.
  Core quality checking for 3D assets.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "critical"
---

# Fab Gate Evaluator

Run gate config (YAML) against asset, produce verdict JSON with critic reports.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `gate_config_path` | string | Yes | - | Path to gate YAML config |
| `asset_path` | string | Yes | - | Path to asset (.glb or .blend) |
| `output_dir` | string | Yes | - | Directory for verdict and reports |
| `render_samples` | integer | No | - | Override render samples from config |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `verdict_path` | string | Path to gate verdict JSON |
| `passed` | boolean | True if asset passed gate |
| `overall_score` | number | Weighted overall score |
| `critic_reports` | array | Paths to individual critic report JSONs |
| `blocking_failures` | array | Hard failures requiring fixes |

## Usage

```bash
python scripts/fab-gate-evaluator.py [arguments]
```

---

*Generated from [`skills/fab/fab-gate-evaluator.yaml`](../../skills/fab/fab-gate-evaluator.yaml)*
