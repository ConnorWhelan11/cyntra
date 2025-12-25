---
name: material-library-sampler
description: |
  Apply materials from library with deterministic selection based on seed.
  Ensures reproducible material assignment.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "medium"
---

# Material Library Sampler

Apply materials from library with deterministic selection based on seed.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `asset_path` | string | Yes | - | Path to asset (.blend or .glb) |
| `material_tags` | array | No | - | Tags to filter materials (e.g., ['pbr', 'interior']) |
| `seed` | integer | No | 42 | Random seed for selection |
| `output_path` | string | Yes | - | Output path for asset with materials |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `asset_path` | string | Path to asset with materials applied |
| `materials_used` | array | List of materials assigned |
| `mapping` | object | Mesh → material mapping |

## Usage

```bash
python scripts/material-library-sampler.py [arguments]
```

---

*Generated from [`skills/fab/material-library-sampler.yaml`](../../skills/fab/material-library-sampler.yaml)*
