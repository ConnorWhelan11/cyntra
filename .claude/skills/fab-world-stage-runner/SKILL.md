---
name: fab-world-stage-runner
description: |
  Execute world pipeline stages (prepare → generate → bake → export) with manifest tracking.
  Orchestrates deterministic world building.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "critical"
---

# Fab World Stage Runner

Execute world pipeline stages (prepare → generate → bake → export) with manifest tracking.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `world_path` | string | Yes | - | Path to world recipe directory |
| `stages` | array | No | `['all']` | Stages to run (or 'all') |
| `output_dir` | string | Yes | - | Output directory for run artifacts |
| `seed` | integer | No | 42 | Master seed for deterministic generation |
| `param_overrides` | object | No | - | Override world.yaml parameters |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `manifest_path` | string | Path to world run manifest with SHA tracking |
| `stages_completed` | array | Successfully completed stages |
| `artifacts` | object | Paths to generated artifacts per stage |

## Usage

```bash
python scripts/fab-world-stage-runner.py [arguments]
```

---

*Generated from [`skills/fab/fab-world-stage-runner.yaml`](../../skills/fab/fab-world-stage-runner.yaml)*
