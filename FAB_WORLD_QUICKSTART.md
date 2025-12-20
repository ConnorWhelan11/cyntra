# Fab World - Quick Start Guide

## Installation

```bash
# Navigate to dev-kernel
cd dev-kernel

# Install in development mode
pip install -e .

# Verify installation
fab-world --help
```

Expected output:
```
usage: fab-world [-h] {build,validate,list,inspect} ...

Fab World - Build deterministic 3D worlds

commands:
  {build,validate,list,inspect}
    build               Build a world
    validate            Validate an asset against world gates
    list                List available worlds
    inspect             Inspect world configuration
```

## First Steps

### 1. List Available Worlds

```bash
fab-world list
```

Should show:
```
Available worlds:

  outora_library (v0.5.0)
    Type: interior_architecture
    Name: Outora Gothic Mega Library
    Path: fab/worlds/outora_library
```

### 2. Inspect Configuration

```bash
fab-world inspect fab/worlds/outora_library
```

Shows world details, parameters, and stages.

### 3. Test Build (Prepare Stage Only)

```bash
# Quick test - only runs prepare stage (doesn't need full Blender scene)
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/test_prepare \
  --until prepare
```

**Prerequisites**: Blender 4.0+ must be installed and in PATH

### 4. Check Results

```bash
# View manifest
cat .glia-fab/runs/test_prepare/manifest.json | jq .

# View logs
cat .glia-fab/runs/test_prepare/logs/prepare.log
```

## Full Build (Requires Full Setup)

### Prerequisites

1. **Blender 4.0+** installed
2. **Sverchok addon** installed in Blender
3. **Godot 4.x** (optional, for playable export)

### Build Command

```bash
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/full_build_$(date +%Y%m%d_%H%M%S)
```

Build time: ~5-15 minutes (depends on hardware)

### Check Outputs

```bash
RUN_DIR=.glia-fab/runs/full_build_*  # Use actual run directory

# Main GLB export
ls -lh $RUN_DIR/world/outora_library.glb

# Preview renders
ls $RUN_DIR/render/beauty/
ls $RUN_DIR/render/clay/

# Godot web export (if completed)
open $RUN_DIR/godot/index.html
```

## Common Use Cases

### Build with Custom Parameters

```bash
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/cosmic_variant \
  --param lighting.preset=cosmic \
  --param lighting.window_emission=3.5
```

Available presets:
- `lighting.preset`: `dramatic` | `warm_reading` | `cosmic`
- `layout.complexity`: `low` | `medium` | `high`
- `bake.mode`: `all` | `layout_only` | `test`

### Build with Different Seed

```bash
# Generate variation with different seed
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/variant_1337 \
  --seed 1337
```

### Incremental Build (Skip Later Stages)

```bash
# Stop after export (skip validation and Godot)
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/quick_export \
  --until export
```

## Troubleshooting

### "Blender not found"

**Solution**: Ensure Blender is in PATH or create symlink:

```bash
# macOS
sudo ln -s /Applications/Blender.app/Contents/MacOS/Blender /usr/local/bin/blender

# Verify
blender --version
```

### "Sverchok addon not found"

**Solution**: Install Sverchok in Blender:

1. Download Sverchok from GitHub
2. In Blender: Edit > Preferences > Add-ons > Install
3. Select Sverchok .zip file
4. Enable the addon

### "Stage script execution failed"

**Solution**: Check logs in `.glia-fab/runs/<run_id>/logs/<stage>.log`

Common issues:
- Missing dependencies in stage script
- Incorrect blend file structure
- Out of memory (reduce complexity or resolution)

### "manifest.json not found"

**Solution**: Build may have failed early. Check:

```bash
# Look for error in stage logs
grep -r "error\|Error\|ERROR" .glia-fab/runs/<run_id>/logs/
```

## Verify Determinism

Build twice with same seed and compare:

```bash
# Build 1
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/build1 \
  --seed 42

# Build 2
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/build2 \
  --seed 42

# Compare SHA256 hashes in manifests
diff \
  <(jq -S '.final_outputs' .glia-fab/runs/build1/manifest.json) \
  <(jq -S '.final_outputs' .glia-fab/runs/build2/manifest.json)
```

No output = identical builds (deterministic!) ✓

## Next Steps

1. **Read Full Schema**: `docs/fab-world-schema.md`
2. **Create Custom World**: Copy `fab/worlds/outora_library` as template
3. **Customize Stages**: Edit stage scripts in `blender/stages/`
4. **Add Parameters**: Extend `world.yaml` parameters section
5. **Run Tests**: `cd dev-kernel && pytest tests/fab/test_world_config.py -v`

## Reference

- **Spec**: `composed-pondering-wilkes.md`
- **Summary**: `FAB_WORLD_IMPLEMENTATION_SUMMARY.md`
- **World README**: `fab/worlds/outora_library/README.md`
- **Schema Docs**: `docs/fab-world-schema.md`

## Getting Help

```bash
# CLI help
fab-world build --help
fab-world inspect --help

# Check world configuration
fab-world inspect fab/worlds/outora_library --json | jq .

# List all stages
fab-world inspect fab/worlds/outora_library | grep "Stages:"
```
