# Fab World System - Architecture Overview

## Introduction

The Fab World system transforms 3D asset generation from ad-hoc scripts into a deterministic, portable, and testable pipeline. Worlds are self-contained recipes that can be built, validated, and iterated automatically by Cyntra.

**Key Benefits**:

- **Deterministic**: Same seed → same output (SHA256-verified)
- **Portable**: Runs in isolated workcells with explicit dependencies
- **Testable**: Quality gates validate geometry, materials, realism
- **Iterable**: Failed gates generate repair playbooks for LLM-driven fixes
- **Composable**: Reuses existing fab-gate, fab-render, fab-godot infrastructure

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Issue Tags: ["asset:world", "world:outora_library"]         │
└────────────────────┬─────────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │  Kernel Dispatcher   │
          │  Detects job_type    │
          │  = "fab-world"       │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │ Spawns Workcell      │
          │ Git worktree sandbox │
          └──────────┬──────────┘
                     │
          ┌──────────▼────────────┐
          │  FabWorldAdapter       │
          │  Executes fab-world    │
          │  CLI in workcell       │
          └──────────┬────────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼─────┐  ┌─────▼──────┐  ┌────▼──────┐
│ Blender  │  │ Quality     │  │ Godot     │
│ Stages   │  │ Gates       │  │ Export    │
│ (7x)     │  │ (critics)   │  │ (playable)│
└──────────┘  └─────┬──────┘  └───────────┘
                    │
          ┌─────────▼──────────┐
          │  Verdict + Proof    │
          │  Pass/Fail + SHA256 │
          └─────────┬──────────┘
                    │
       ┌────────────▼────────────┐
       │  Verifier               │
       │  If fail → repair issue │
       │  with playbook          │
       └─────────────────────────┘
```

## World Structure

### Directory Layout

```
fab/worlds/<world_id>/
├── world.yaml              # World recipe configuration
├── README.md               # World-specific documentation
├── blender/
│   ├── template.blend      # Source template (Git LFS)
│   └── stages/             # Blender execution stages
│       ├── prepare.py      # Seed injection, addon enable
│       ├── generate.py     # Procedural generation
│       ├── bake.py         # Layout baking
│       ├── materials.py    # Material application
│       ├── lighting.py     # Lighting setup
│       ├── render.py       # Preview renders
│       └── export.py       # GLB export
├── gates/                  # Optional world-specific gate tuning
│   └── custom_checks.yaml
├── assets/                 # Source-only assets
│   ├── models/
│   ├── textures/
│   └── licenses/
└── export/                 # Curated releases (committed to Git LFS)
    ├── v0.5.0.glb
    └── v0.5.0_metadata.json
```

### Build Outputs (Gitignored)

```
.cyntra/runs/<run_id>/
├── manifest.json           # SHA256 hashes, versions, timing
├── stages/                 # Intermediate stage outputs
│   ├── prepare/prepared.blend
│   ├── generate/kit_pieces.blend
│   └── ...
├── world/                  # Final baked outputs
│   ├── outora_library_baked.blend
│   ├── outora_library.glb
│   └── sections/*.glb
├── render/                 # Preview renders
│   ├── beauty/*.png
│   └── clay/*.png
├── godot/                  # Playable web export
│   ├── index.html
│   └── project/
└── logs/                   # Stage execution logs
```

## world.yaml Schema

### Minimal Example

```yaml
schema_version: "1.0"
world_id: my_world
world_type: interior_architecture
version: "1.0.0"

build:
  template_blend: blender/template.blend

stages:
  - id: export
    type: blender
    script: blender/stages/export.py
    outputs: ["world/output.glb"]
```

### Complete Example

See `fab/worlds/outora_library/world.yaml` for a full-featured example with:

- Determinism configuration
- Parameter schema
- 9 stages with dependencies
- Quality gate integration
- Resource budgets

## Stage Contract

All Blender stages implement a standard `execute()` function:

```python
from pathlib import Path
from typing import Any, Dict, Mapping

def execute(
    *,
    run_dir: Path,                 # Root run directory
    stage_dir: Path,               # This stage's output directory
    inputs: Mapping[str, Path],    # {stage_id: stage_dir} for deps
    params: Dict[str, Any],        # Resolved parameters
    manifest: Dict[str, Any],      # Build manifest (mutable)
) -> Dict[str, Any]:
    """
    Execute the stage.

    Returns:
        {
            "success": True/False,
            "outputs": [list of created paths],
            "metadata": {stage-specific data},
            "errors": [list of error messages],
        }
    """
    import bpy  # Import inside function for unit test compatibility

    # Inject determinism
    seed = manifest["determinism"]["seed"]
    import random
    random.seed(seed)

    # Stage logic here...

    return {
        "success": True,
        "outputs": [str(stage_dir / "output.blend")],
        "metadata": {"object_count": 100},
        "errors": [],
    }
```

## CLI Usage

### Build Commands

```bash
# Full build
fab-world build \
  --world fab/worlds/outora_library \
  --output .cyntra/runs/build_001

# With custom parameters
fab-world build \
  --world fab/worlds/outora_library \
  --output .cyntra/runs/cosmic \
  --param lighting.preset=cosmic \
  --param layout.complexity=high

# Incremental (stop at specific stage)
fab-world build \
  --world fab/worlds/outora_library \
  --until export

# With custom seed
fab-world build \
  --world fab/worlds/outora_library \
  --seed 1337
```

### Inspection & Publishing

```bash
# List worlds
fab-world list

# Inspect configuration
fab-world inspect fab/worlds/outora_library
fab-world inspect fab/worlds/outora_library --json

# Publish to viewer
fab-world publish \
  --run .cyntra/runs/build_001 \
  --viewer fab/assets/viewer

# Publish to release directory
fab-world publish \
  --run .cyntra/runs/build_001 \
  --export fab/worlds/outora_library/export
```

## Cyntra Integration

### Issue Tagging

Tag issues with `asset:world` to trigger world builds:

> `asset:world` is intended for **build/validate** jobs (deterministic execution).
> If your goal is to **author or repair** a world recipe (`fab/worlds/<id>/...`),
> route the issue to an agent toolchain (e.g. set `dk_tool_hint: codex|claude`) and
> run a separate `asset:world` build issue to validate the updated world.

```json
{
  "id": 42,
  "title": "Build Outora Library with cosmic lighting",
  "description": "Generate the Gothic library with cosmic preset",
  "tags": [
    "asset:world",
    "world:outora_library",
    "param:lighting.preset=cosmic",
    "seed:1337",
    "gate:interior_library",
    "gate:godot_integration"
  ]
}
```

### Execution Flow

1. **Dispatcher** detects `asset:world` → sets `job_type="fab-world"`
2. **FabWorldAdapter** runs `fab-world build` inside a workcell sandbox (no LLM required)
3. **Quality Gates** run on exported GLB (interior_library_v001, godot_integration_v001)
4. **Verifier** checks gate verdicts:
   - **Pass**: Patch accepted, merge to main
   - **Fail**: Kernel writes repair hints (playbook) back to the issue and retries
5. **Repair Loop**: Iterate up to max_iterations (typically 3); escalation creates a human-review issue

### Repair Playbook Example

From `fab/gates/interior_library_v001.yaml`:

```yaml
repair_playbook:
  GEO_NO_FLOOR:
    priority: 1
    instructions: |
      Add a floor plane to the interior:
      - Ground plane at z=0
      - Cover the footprint of the space
      - Apply appropriate floor material (stone, wood)

  REAL_MISSING_TEXTURES_SEVERE:
    priority: 1
    instructions: |
      Apply materials to visible surfaces:
      - Stone/marble for structural elements
      - Wood for furniture and trim
      - Glass for windows (emissive for stained glass)
```

## Determinism

### Guarantees

When built with the same:

- **Seed value**
- **Blender version**
- **Addon versions** (e.g., Sverchok)
- **world.yaml configuration**

...the system produces **identical outputs** (verified by SHA256 hash).

### Implementation

1. **Seed Injection**: `random.seed(seed)` + `bpy.context.scene.cycles.seed = seed`
2. **Environment Control**: `PYTHONHASHSEED=0`, `CYCLES_DEVICE=CPU`
3. **Factory Startup**: `blender --factory-startup` (ignore user preferences)
4. **Version Tracking**: Manifest records Blender, Python, addon versions

### Verification

```bash
# Build twice
fab-world build --world fab/worlds/outora_library --output runs/a --seed 42
fab-world build --world fab/worlds/outora_library --output runs/b --seed 42

# Compare SHA256
diff \
  <(jq -S '.final_outputs[0].sha256' runs/a/manifest.json) \
  <(jq -S '.final_outputs[0].sha256' runs/b/manifest.json)

# No output = identical builds ✓
```

## Quality Gates

### Available Critics

**Core Critics** (apply to all assets):

- `CategoryCritic` - Multi-view semantic classification
- `AlignmentCritic` - CLIP text-to-image similarity
- `RealismCritic` - Aesthetic score, NIQE, artifact detection
- `GeometryCritic` - Mesh analysis, bounds, manifold checks

**World-Specific Critics**:

- `FurnitureCritic` - Furniture presence and distribution (libraries)
- `StructuralRhythmCritic` - Gothic bay spacing validation (6m ± 30%)

### Gate Configuration

Gates are defined in `fab/gates/*.yaml` and referenced by world.yaml:

```yaml
stages:
  - id: validate
    type: gate
    requires: [export]
    gates:
      - fab/gates/interior_library_v001.yaml
      - fab/gates/godot_integration_v001.yaml
```

### Custom Library Checks

`fab/gates/interior_library_v001.yaml` includes:

```yaml
library_checks:
  furniture_presence:
    enabled: true
    required_types: [desk, chair, shelf]
    min_furniture_count: 5

  structural_rhythm:
    enabled: true
    column_spacing_tolerance: 0.3
    expected_bay_size: 6.0 # meters

  lighting_quality:
    enabled: true
    min_light_sources: 2
    ambient_occlusion: true
```

## Parameter System

### Default Parameters

Defined in `world.yaml`:

```yaml
parameters:
  defaults:
    lighting:
      preset: dramatic
      window_emission: 2.5
    layout:
      bay_size_m: 6.0
      complexity: medium
```

### Override via CLI

```bash
fab-world build --world fab/worlds/outora_library \
  --param lighting.preset=cosmic \
  --param lighting.window_emission=3.5
```

### Override via Issue Tags

```json
{
  "tags": ["param:lighting.preset=warm_reading", "param:layout.complexity=high"]
}
```

### Parameter Validation

Optional schema in `world.yaml`:

```yaml
parameters:
  schema:
    lighting.preset:
      type: enum
      values: [dramatic, warm_reading, cosmic]
    layout.complexity:
      type: enum
      values: [low, medium, high]
```

## Manifest Structure

The `manifest.json` tracks all build metadata:

```json
{
  "schema_version": "1.0",
  "world_id": "outora_library",
  "world_version": "0.5.0",
  "run_id": "world_outora_library_seed42_20251220T143000Z",
  "created_at": "2025-12-20T14:30:00Z",
  "determinism": {
    "seed": 42,
    "pythonhashseed": 0,
    "cycles_seed": 42
  },
  "versions": {
    "blender_version": "4.0.2",
    "sverchok_version": "1.2.0",
    "python_version": "3.11.5",
    "dev_kernel_version": "0.1.0",
    "git_commit": "abc1234"
  },
  "parameters": {
    "lighting": { "preset": "cosmic" }
  },
  "stages": [
    {
      "id": "prepare",
      "status": "success",
      "duration_ms": 1234,
      "outputs": [
        {
          "path": "stages/prepare/prepared.blend",
          "sha256": "abc123...",
          "size_bytes": 1048576
        }
      ],
      "metadata": { "random_seed": 42 }
    }
  ],
  "final_outputs": [
    {
      "path": "world/outora_library.glb",
      "sha256": "789abc...",
      "size_bytes": 52428800
    }
  ]
}
```

## Extension Guide

### Creating a New World

1. **Copy template**:

   ```bash
   cp -r fab/worlds/outora_library fab/worlds/my_world
   ```

2. **Update world.yaml**:

   ```yaml
   world_id: my_world
   world_type: props # or vehicle, character, etc.
   version: "1.0.0"
   ```

3. **Customize stages**:
   - Edit `blender/stages/*.py` for your pipeline
   - Implement `execute()` function in each
   - Define stage dependencies in `world.yaml`

4. **Add parameters**:

   ```yaml
   parameters:
     defaults:
       color: red
       size: large
     schema:
       color:
         type: enum
         values: [red, blue, green]
   ```

5. **Configure gates**:
   ```yaml
   stages:
     - id: validate
       type: gate
       gates:
         - fab/gates/props_realism_v001.yaml
   ```

### Adding Custom Critics

1. **Create critic class**:

   ```python
   # kernel/src/cyntra/fab/critics/my_critic.py
   class MyCritic:
       def __init__(self, config):
           self.config = config

       def evaluate(self, glb_path):
           # Analysis logic
           return {
               "pass": True,
               "score": 0.85,
               "metadata": {},
               "failures": []
           }
   ```

2. **Register in `__init__.py`**:

   ```python
   from .my_critic import MyCritic
   __all__ = [..., "MyCritic"]
   ```

3. **Add to gate config**:
   ```yaml
   # fab/gates/my_gate.yaml
   critics:
     my_check:
       enabled: true
       threshold: 0.7
   ```

## Best Practices

1. **Modularity**: Keep stages focused (one responsibility each)
2. **Determinism**: Always seed randomness, use CPU rendering
3. **Validation**: Add gates early to catch issues before expensive stages
4. **Documentation**: Comment stage scripts, document parameter effects
5. **Versioning**: Bump `version` in world.yaml for breaking changes
6. **Testing**: Use `--until` flag for incremental testing during development
7. **Budgets**: Define resource limits to prevent runaway generation
8. **Portability**: Never hard-code paths, use provided directories

## Troubleshooting

See `FAB_WORLD_QUICKSTART.md` for common issues and solutions.

## See Also

- [Fab World Schema Reference](fab-world-schema.md)
- [Migration Guide](migration-guide.md)
- [Quick Start Guide](../FAB_WORLD_QUICKSTART.md)
- [Implementation Summary](../FAB_WORLD_IMPLEMENTATION_SUMMARY.md)
