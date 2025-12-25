---
name: lookdev-render-harness
description: |
  Apply lookdev scene, render from camera rig, export multi-view renders.
  Standardized rendering for asset evaluation.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "high"
---

# Lookdev Render Harness

Apply lookdev scene, render from camera rig, export multi-view renders.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `asset_path` | string | Yes | - | Path to asset to evaluate |
| `lookdev_scene` | string | Yes | - | Path to lookdev .blend scene |
| `output_dir` | string | Yes | - | Directory for renders |
| `seed` | integer | No | 42 | Random seed |
| `views` | array | No | `['front', 'three_quarter', 'detail']` | Camera views to render |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `renders` | object | View name → render path mapping |
| `manifest_path` | string | Render manifest with parameters |

## Usage

```bash
python scripts/lookdev-render-harness.py [arguments]
```

---

*Generated from [`skills/fab/lookdev-render-harness.yaml`](../../skills/fab/lookdev-render-harness.yaml)*
