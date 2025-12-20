# Migration Guide - Old Pipeline → Fab World System

## Overview

This guide helps you migrate from the legacy `fab/outora-library/` pipeline to the new Fab World system at `fab/worlds/outora_library/`.

**Why Migrate?**
- ✓ Deterministic builds (reproducible outputs)
- ✓ Portable (runs in isolated workcells)
- ✓ Integrated quality gates
- ✓ Dev-kernel automation support
- ✓ Parameter override system
- ✓ Proper Git LFS handling

## Migration Path

### Phase 1: Parallel Operation (Current State)

**Status**: ✓ Complete

Both systems coexist:
- **Old**: `fab/outora-library/` - Legacy scripts, manual invocation
- **New**: `fab/worlds/outora_library/` - World system, automated

**What Works**:
- New world system builds use old scripts via imports
- Original `fab/outora-library/` remains intact
- No breaking changes to existing workflows

### Phase 2: Transition Period (Recommended)

**Action Items**:

1. **Install fab-world CLI**:
   ```bash
   cd dev-kernel
   pip install -e .
   fab-world --help
   ```

2. **Test new system**:
   ```bash
   # Quick test (prepare stage only)
   fab-world build \
     --world fab/worlds/outora_library \
     --output .glia-fab/runs/test \
     --until prepare

   # Full build
   fab-world build \
     --world fab/worlds/outora_library \
     --output .glia-fab/runs/full_build
   ```

3. **Compare outputs**:
   ```bash
   # Old way (manual script execution)
   cd fab/outora-library/blender
   blender --background outora_library_v0.4.0.blend --python export_fab_game_glb.py

   # New way (fab-world)
   fab-world build --world fab/worlds/outora_library --output .glia-fab/runs/comparison

   # Compare GLB sizes, vertex counts, etc.
   ```

4. **Update documentation references**:
   - Point build instructions to `fab-world` CLI
   - Update README with new commands
   - Add migration notes

### Phase 3: Full Migration (Future)

**When to Complete**:
- After testing world system in production
- After validating determinism works
- After team is comfortable with new CLI

**Final Steps**:

1. **Archive old blend files**:
   ```bash
   # See fab/worlds/outora_library/ARCHIVE_NOTES.md
   mkdir ~/Archives/outora-library-archive
   mv fab/outora-library/blender/*.blend ~/Archives/
   ```

2. **Deprecate old scripts**:
   - Add deprecation warnings to `fab/outora-library/blender/*.py`
   - Update imports in stage scripts to use local copies

3. **Update all documentation**:
   - Replace all references to old pipeline
   - Point to `fab-world` as primary method

## Script Mapping

### Old Scripts → New Stages

| Old Script | New Stage | Notes |
|------------|-----------|-------|
| `gothic_kit_generator.py` | `stages/generate.py` | Imported by generate stage |
| `bake_gothic_v2.py` | `stages/bake.py` | Imports and calls bake module |
| `gothic_materials.py` | `stages/materials.py` | Material application |
| `gothic_lighting.py` | `stages/lighting.py` | Lighting setup |
| `export_fab_game_glb.py` | `stages/export.py` | GLB export with Godot markers |
| `run_pipeline.py` | `fab-world build` | Replaced by CLI orchestration |
| `gate_validation.py` | Quality gates | Replaced by gate YAML + critics |

### Parameter Changes

| Old Approach | New Approach |
|--------------|--------------|
| Hard-coded in Python | `world.yaml` defaults |
| Edit script, re-run | `--param` CLI overrides |
| No validation | Schema validation in `world.yaml` |

### Output Locations

| Old Location | New Location |
|--------------|--------------|
| `fab/outora-library/blender/*.blend1` | Gitignored |
| `fab/outora-library/exports/*.glb` | `.glia-fab/runs/<run_id>/world/` (gitignored) |
| Manual `/tmp/` usage | `FAB_RUN_DIR`, `FAB_STAGE_DIR` env vars |
| `fab/outora-library/viewer/assets/` | Published via `fab-world publish --viewer` |

## Common Migration Issues

### Issue 1: Import Errors

**Symptom**:
```
ModuleNotFoundError: No module named 'gothic_kit_generator'
```

**Solution**:
Stage scripts add the old `blender/` directory to `sys.path`:

```python
# In stage script
import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parents[5]
original_blender_dir = repo_root / "fab" / "outora-library" / "blender"
sys.path.insert(0, str(original_blender_dir))

import gothic_kit_generator  # Now works
```

### Issue 2: Hard-coded Paths

**Old Code**:
```python
output_dir = "/tmp/outora_renders"
```

**New Code**:
```python
import os
from pathlib import Path

# Use environment variables
run_dir = Path(os.environ.get("FAB_RUN_DIR", "."))
stage_dir = Path(os.environ.get("FAB_STAGE_DIR", "stages/current"))

output_dir = run_dir / "renders"
```

### Issue 3: Random Seed Not Set

**Old Code**:
```python
import random
random.shuffle(objects)  # Non-deterministic!
```

**New Code**:
```python
def execute(*, run_dir, stage_dir, inputs, params, manifest):
    # Seed is in manifest
    seed = manifest["determinism"]["seed"]

    import random
    random.seed(seed)  # Now deterministic

    random.shuffle(objects)  # Reproducible
```

### Issue 4: exec(open(...).read())

**Old Code**:
```python
exec(open("gothic_lighting.py").read())
```

**New Code**:
```python
import importlib
import gothic_lighting

importlib.reload(gothic_lighting)  # Fresh import
gothic_lighting.setup_lighting()  # Call function
```

### Issue 5: Missing Godot Markers

**Old Export**:
```python
# Just export mesh
bpy.ops.export_scene.gltf(filepath="output.glb")
```

**New Export**:
```python
# Add Godot contract markers first
spawn_marker = bpy.data.objects.get("SPAWN_PLAYER")
if not spawn_marker:
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 2))
    spawn_marker = bpy.context.active_object
    spawn_marker.name = "SPAWN_PLAYER"

# Then export
bpy.ops.export_scene.gltf(filepath="output.glb", use_selection=True)
```

## CLI Equivalents

### Old Manual Process

```bash
cd fab/outora-library/blender

# 1. Generate kit
blender --background template.blend --python gothic_kit_generator.py

# 2. Bake layout
blender --background kit_output.blend --python bake_gothic_v2.py

# 3. Apply materials
blender --background baked.blend --python gothic_materials.py

# 4. Setup lighting
blender --background materials.blend --python gothic_lighting.py

# 5. Export
blender --background lit.blend --python export_fab_game_glb.py

# 6. Validate (separate script)
python gate_validation.py --asset output.glb
```

### New Automated Process

```bash
# Single command replaces entire pipeline
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/auto_build

# Manifest tracks all stages, SHA256 hashes, timing
cat .glia-fab/runs/auto_build/manifest.json
```

## Verification Checklist

After migration, verify:

- [ ] `fab-world list` shows `outora_library`
- [ ] `fab-world inspect fab/worlds/outora_library` shows config
- [ ] `fab-world build --until prepare` completes successfully
- [ ] Full build produces GLB with expected size (~50-100MB)
- [ ] Manifest contains SHA256 hashes for all outputs
- [ ] Two builds with same seed produce identical SHA256
- [ ] Godot export (if enabled) loads in browser
- [ ] Quality gates pass (or produce actionable failures)

## Rollback Plan

If migration causes issues:

1. **Immediate rollback**:
   ```bash
   # Old scripts still work
   cd fab/outora-library/blender
   blender --background outora_library_v0.4.0.blend --python run_pipeline.py
   ```

2. **Preserve old artifacts**:
   ```bash
   # Backup before cleanup
   tar -czf outora-library-backup-$(date +%Y%m%d).tar.gz fab/outora-library/
   ```

3. **Report issues**:
   - Check logs: `.glia-fab/runs/<run_id>/logs/*.log`
   - File issue with manifest.json attached
   - Include Blender version, Python version

## Dev-Kernel Integration

### Old Approach (Manual)

1. Developer manually runs Blender scripts
2. Developer manually validates output
3. Developer manually commits results
4. No iteration loop

### New Approach (Automated)

1. Create Beads issue with tags:
   ```json
   {
     "id": 123,
     "title": "Generate Outora Library v0.6.0",
     "tags": [
       "asset:world",
       "world:outora_library",
       "seed:42"
     ]
   }
   ```

2. Dev-kernel automatically:
   - Spawns workcell
   - Runs `fab-world build`
   - Validates with quality gates
   - Creates repair issues if gates fail
   - Iterates up to 3 times

3. Result:
   - GLB committed to export directory
   - Manifest tracks reproducibility
   - Gate verdicts archived

## FAQ

**Q: Can I use old and new systems together?**
A: Yes! They're independent. Old scripts still work. New system imports them.

**Q: Do I need to rewrite all scripts?**
A: No. Stage scripts wrap/import existing scripts. Refactor incrementally.

**Q: What if Blender version changes?**
A: Manifest tracks version. Non-determinism across versions is expected. Pin Blender version for reproducibility.

**Q: How do I customize parameters?**
A: Use `--param` CLI flag or edit `world.yaml` defaults. No code changes needed.

**Q: What if gates fail?**
A: Gates produce repair playbooks. Fix issues and re-run. Dev-kernel can automate iteration.

**Q: Can I skip Godot export?**
A: Yes. Set `optional: true` on godot stage or use `--until export` flag.

**Q: How do I publish to viewer?**
A: Use `fab-world publish --run <run_dir> --viewer <path>`. Automates copying GLB and game build.

**Q: Do I need Git LFS?**
A: Yes, for blend files >100MB. Already configured in `.gitattributes`.

**Q: How do I test determinism?**
A: Build twice with same seed, compare SHA256 in manifests. Should be identical.

**Q: Can I use this for other worlds?**
A: Yes! Copy `fab/worlds/outora_library` as template. Update `world_id` and customize stages.

## Next Steps

1. Review [Fab World System](fab-world-system.md) for architecture details
2. Read [Schema Reference](fab-world-schema.md) for `world.yaml` options
3. Try [Quick Start Guide](../FAB_WORLD_QUICKSTART.md) for hands-on tutorial
4. Check [Implementation Summary](../FAB_WORLD_IMPLEMENTATION_SUMMARY.md) for what's been built

## Support

- Issues: File in GitHub issue tracker
- Questions: Check world README (`fab/worlds/outora_library/README.md`)
- Examples: See existing world configs in `fab/worlds/`
