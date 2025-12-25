---
name: sverchok-scaffold-generator
description: |
  Create procedural geometry using Sverchok node trees from templates.
  Generates parametric 3D structures.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "medium"
---

# Sverchok Scaffold Generator

Create procedural geometry using Sverchok node trees from templates.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `template_name` | string | Yes | - | Name of Sverchok template to use |
| `parameters` | object | Yes | - | Template parameters (dimensions, counts, etc.) |
| `output_path` | string | Yes | - | Output .blend file path |
| `seed` | integer | No | 42 | Random seed for procedural generation |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `blend_path` | string | Path to generated .blend file |
| `geometry_stats` | object | Triangle count, bounds, etc. |
| `parameters_used` | object | Final parameters after validation |

## Usage

```bash
python scripts/sverchok-scaffold-generator.py [arguments]
```

---

*Generated from [`skills/fab/sverchok-scaffold-generator.yaml`](../../skills/fab/sverchok-scaffold-generator.yaml)*
