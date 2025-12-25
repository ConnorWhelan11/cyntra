---
name: blender-deterministic-render
description: |
  Invoke Blender with fixed seeds, CPU-only, factory startup for reproducible renders.
  Ensures deterministic 3D rendering output.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "critical"
---

# Blender Deterministic Render

Invoke Blender with fixed seeds, CPU-only, factory startup for reproducible renders.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `blend_file` | string | Yes | - | Path to .blend file |
| `output_dir` | string | Yes | - | Directory for render outputs |
| `seed` | integer | No | 42 | Random seed |
| `camera_rig` | string | No | - | Camera rig to use for multi-view renders |
| `resolution` | array | No | `[1920, 1080]` | [width, height] in pixels |
| `samples` | integer | No | 128 | Render samples |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `renders` | array | Paths to rendered images |
| `manifest_path` | string | Path to render manifest with parameters |
| `duration_ms` | integer | Render duration in milliseconds |

## Usage

```bash
python scripts/blender-deterministic-render.py [arguments]
```

---

*Generated from [`skills/fab/blender-deterministic-render.yaml`](../../skills/fab/blender-deterministic-render.yaml)*
