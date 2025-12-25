# Outora Library World

Procedurally generated Gothic cathedral library with deterministic builds.

## Overview

- **Type**: Interior Architecture
- **Generator**: Outora Gothic Mega Library
- **Version**: 0.5.0

A massive Gothic cathedral library featuring:
- 3-tier architectural structure
- Symmetrical wings with study pods
- Procedural furniture placement
- Physically-based materials and lighting

## Requirements

### Software
- Blender 4.0.0 or higher
- Python 3.10+
- cyntra-kernel (provides `fab-world` CLI)

### Blender Add-ons
- **Sverchok** (required) - Procedural node-based generation

## Quick Start

Build the entire world:

```bash
fab-world build \
  --world fab/worlds/outora_library \
  --output .cyntra/runs/outora_001 \
  --seed 42
```

Build with custom parameters:

```bash
fab-world build \
  --world fab/worlds/outora_library \
  --output .cyntra/runs/cosmic_variant \
  --param lighting.preset=cosmic \
  --param layout.complexity=high
```

Build up to a specific stage:

```bash
fab-world build \
  --world fab/worlds/outora_library \
  --until export
```

## Parameters

### Layout
- `bay_size_m`: Structural bay spacing (default: 6.0m)
- `tier_count`: Number of vertical levels (default: 3)
- `wing_depth`: Wing depth in bays (default: 3)
- `complexity`: Detail level [low, medium, high] (default: medium)

### Lighting
- `preset`: Lighting style [dramatic, warm_reading, cosmic] (default: dramatic)
- `window_emission`: Window light strength (default: 2.5)
- `chandelier_count`: Number of chandeliers (default: 8)

### Materials
- `stone_variant`: Stone material [limestone_weathered, granite_polished, ...]
- `wood_variant`: Wood material [oak_aged, walnut_dark, ...]
- `color_palette`: Overall color scheme [warm_academic, cool_monastic, ...]

### Furniture
- `desk_count`: Number of study desks (default: 24)
- `chair_count`: Number of chairs (default: 48)
- `shelf_count`: Number of bookshelves (default: 16)

## Build Pipeline Stages

1. **prepare** - Initialize Blender, enable addons, inject seed
2. **generate** - Generate architectural kit pieces
3. **bake** - Instance and bake layout geometry
4. **materials** - Apply materials and textures
5. **lighting** - Set up lighting and atmosphere
6. **render** - Generate preview renders (beauty + clay)
7. **export** - Export GLB files (full + sections)
8. **validate** - Run quality gates
9. **godot** - Build playable Godot export (optional)

## Outputs

Build outputs are written to `.cyntra/runs/<run_id>/`:

- `world/outora_library.glb` - Main GLB export
- `world/sections/*.glb` - Sectioned exports for streaming
- `render/beauty/*.png` - Final rendered previews
- `render/clay/*.png` - Material-free clay renders
- `godot/index.html` - Playable web export
- `manifest.json` - Build metadata with SHA256 hashes

## Determinism

Builds are deterministic when using the same:
- Seed value
- Blender version
- Sverchok version
- world.yaml configuration

The manifest.json tracks all versions and produces SHA256 hashes to verify reproducibility.

## Integration

### Godot Contract

The exported GLB includes special markers for Godot integration:
- `SPAWN_PLAYER` - Player spawn location
- `COLLIDER_*` - Collision meshes
- Navigation mesh baking support

### Viewer Publishing

Successful builds can publish to the viewer:

```bash
fab-world publish \
  --run .cyntra/runs/outora_001 \
  --viewer fab/outora-library/viewer
```

## Development

### Adding Custom Stages

1. Create stage script in `blender/stages/my_stage.py`
2. Implement `execute()` function with standard contract
3. Add stage entry to `world.yaml`

### Troubleshooting

**Sverchok not found:**
```
Install Sverchok addon in Blender:
Edit > Preferences > Add-ons > Install > select sverchok.zip
```

**Non-deterministic builds:**
- Verify same Blender version
- Check for unseeded random() calls
- Ensure PYTHONHASHSEED=0 is set

**Missing outputs:**
- Check logs in `.cyntra/runs/<run_id>/logs/`
- Verify stage dependencies are met
- Ensure sufficient disk space

## Architecture Notes

This world uses the Fab World system, designed for:
- **Portability**: Runs in isolated workcells
- **Determinism**: Same seed = same output
- **Quality Gates**: Automated validation
- **Repair Loops**: Self-healing builds with LLM critics

See `docs/fab-world-schema.md` for the complete world.yaml specification.
