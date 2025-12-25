---
name: deterministic-world-builder
description: |
  Run fab-world with SHA manifest generation for full reproducibility.
  High-level wrapper for deterministic world pipeline execution.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "critical"
---

# Deterministic World Builder

Run fab-world with SHA manifest generation for full reproducibility.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `world_recipe_path` | string | Yes | - | Path to world.yaml recipe |
| `output_dir` | string | Yes | - | Output directory for run |
| `seed` | integer | No | 42 | Master seed |
| `validate` | boolean | No | true | Run validation gates after build |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `manifest_path` | string | Path to manifest.json with SHA tracking |
| `glb_path` | string | Path to exported world GLB |
| `validation_results` | object | Gate validation results (if requested) |
| `sha256` | string | Overall content SHA256 |

## Usage

```bash
python scripts/deterministic-world-builder.py [arguments]
```

---

*Generated from [`skills/fab/deterministic-world-builder.yaml`](../../skills/fab/deterministic-world-builder.yaml)*
