# Fab World Schema Documentation

## Overview

The `world.yaml` file defines a complete Fab World recipe - a deterministic, portable 3D asset generation pipeline. This document describes the schema, conventions, and best practices.

## Schema Version

Current schema version: `1.0`

## File Structure

```yaml
schema_version: "1.0"
world_id: my_world
world_type: interior_architecture
version: "1.0.0"

generator: {...}
build: {...}
parameters: {...}
stages: [...]
budgets: {...}
publish: {...}
```

## Top-Level Fields

### `schema_version` (required)

Schema version for this world configuration.

- **Type**: String
- **Format**: `"major.minor"`
- **Example**: `"1.0"`

### `world_id` (required)

Unique identifier for this world. Used in file paths, run IDs, and references.

- **Type**: String
- **Format**: snake_case
- **Pattern**: `^[a-z][a-z0-9_]*$`
- **Example**: `"outora_library"`

### `world_config_id` (optional)

Specific configuration variant identifier. Useful when you have multiple configurations for the same world.

- **Type**: String
- **Example**: `"outora_library_gothic_v001"`

### `world_type` (required)

Category of world for routing and validation.

- **Type**: String (enum)
- **Values**:
  - `interior_architecture`
  - `exterior_environment`
  - `character`
  - `vehicle`
  - `props`

### `version` (required)

World version using semantic versioning.

- **Type**: String
- **Format**: `"major.minor.patch"`
- **Pattern**: `^\d+\.\d+\.\d+$`
- **Example**: `"0.5.0"`

## Generator Section

Metadata about the generator and its requirements.

```yaml
generator:
  name: Outora Gothic Mega Library
  description: |
    Procedurally generated Gothic cathedral library with 3 tiers,
    symmetrical wings, study pods, and furniture.
  author: Outora Team
  required_addons:
    - id: sverchok
      required: true
      version: "1.2.0"  # optional
```

### Fields

- **`name`** (required): Human-readable generator name
- **`description`** (optional): Detailed description (supports multiline)
- **`author`** (required): Author or team name
- **`required_addons`** (optional): Array of Blender addon requirements
  - `id`: Addon identifier (as it appears in Blender)
  - `required`: Boolean - whether the addon is required
  - `version`: Optional version requirement

## Build Section

Configuration for the build process and determinism.

```yaml
build:
  template_blend: blender/template.blend
  blender_version_min: "4.0.0"
  determinism:
    seed: 42
    pythonhashseed: 0
    cycles_seed: 42
  blender:
    args: ["--background", "--factory-startup"]
    env:
      CYCLES_DEVICE: "CPU"
      PYTHONHASHSEED: "0"
```

### Fields

- **`template_blend`** (required): Path to template .blend file (relative to world directory)
- **`blender_version_min`** (optional): Minimum Blender version (semantic versioning)
- **`determinism`** (optional): Determinism settings
  - `seed`: Default random seed (integer)
  - `pythonhashseed`: Python hash seed (should be 0)
  - `cycles_seed`: Blender Cycles render seed
- **`blender`** (optional): Blender invocation settings
  - `args`: Array of command-line arguments
  - `env`: Object of environment variables

### Best Practices

1. Always use `--factory-startup` to avoid user preferences affecting builds
2. Set `PYTHONHASHSEED=0` for deterministic Python hashing
3. Use `CYCLES_DEVICE=CPU` for deterministic rendering
4. Pin a specific seed for reproducibility

## Parameters Section

Define configurable parameters and their validation.

```yaml
parameters:
  defaults:
    layout:
      bay_size_m: 6.0
      tier_count: 3
    lighting:
      preset: dramatic
      intensity: 2.5
  schema:
    lighting.preset:
      type: enum
      values: [dramatic, warm_reading, cosmic]
    layout.tier_count:
      type: integer
      min: 1
      max: 5
      default: 3
```

### Fields

- **`defaults`** (optional): Default parameter values (nested object structure)
- **`schema`** (optional): Validation schema for parameters
  - Use dot-path notation for nested keys (e.g., `lighting.preset`)
  - Supported types: `string`, `number`, `integer`, `boolean`, `enum`, `object`, `array`
  - Enum constraints: `values` array
  - Number constraints: `min`, `max`
  - Default fallback: `default`

### Parameter Overrides

Users can override parameters via CLI:

```bash
fab-world build --world fab/worlds/my_world \
  --param lighting.preset=cosmic \
  --param layout.tier_count=5
```

## Stages Section

Ordered list of build pipeline stages.

```yaml
stages:
  - id: prepare
    type: blender
    script: blender/stages/prepare.py
    outputs: ["stages/prepare/"]

  - id: generate
    type: blender
    script: blender/stages/generate.py
    requires: [prepare]
    params: ["layout.bay_size_m"]
    outputs: ["stages/generate/"]

  - id: validate
    type: gate
    requires: [export]
    gates:
      - fab/gates/interior_library_v001.yaml
      - fab/gates/godot_integration_v001.yaml

  - id: godot
    type: godot
    requires: [validate]
    optional: true
    outputs: ["godot/index.html"]
```

### Stage Types

- **`blender`**: Execute Python script in Blender
- **`gate`**: Run quality gate validation
- **`godot`**: Build Godot project
- **`custom`**: Custom stage type (requires handler)

### Stage Fields

- **`id`** (required): Stage identifier (snake_case, unique)
- **`type`** (required): Stage type (see above)
- **`script`** (required for blender/custom): Path to stage script
- **`requires`** (optional): Array of stage IDs that must complete first
- **`params`** (optional): Array of parameter keys used (dot-path notation)
- **`outputs`** (optional): Expected output paths (supports glob patterns like `*.png`)
- **`settings`** (optional): Stage-specific settings object
- **`optional`** (optional): Boolean - whether stage can be skipped
- **`gates`** (required for gate type): Array of gate config file paths

### Stage Execution Contract

Blender stages must implement an `execute()` function:

```python
from pathlib import Path
from typing import Any, Dict, Mapping

def execute(
    *,
    run_dir: Path,                 # Root run directory
    stage_dir: Path,               # This stage's output directory
    inputs: Mapping[str, Path],    # {stage_id: stage_dir} for dependencies
    params: Dict[str, Any],        # Resolved parameters
    manifest: Dict[str, Any],      # Running manifest (mutated)
) -> Dict[str, Any]:
    """
    Execute the stage.

    Returns:
        {
            "success": True/False,
            "outputs": [list of created file paths],
            "metadata": {stage-specific data},
            "errors": [list of error messages if failed]
        }
    """
    import bpy
    # Stage logic here...
    return {
        "success": True,
        "outputs": [str(stage_dir / "output.blend")],
        "metadata": {"piece_count": 24}
    }
```

### Stage Dependencies

The `requires` field creates a directed acyclic graph (DAG) of dependencies:

```yaml
stages:
  - id: a
    # No dependencies - runs first

  - id: b
    requires: [a]  # Runs after 'a'

  - id: c
    requires: [a]  # Can run in parallel with 'b'

  - id: d
    requires: [b, c]  # Runs after both 'b' and 'c'
```

## Budgets Section

Resource limits and budgets for validation.

```yaml
budgets:
  blender:
    max_objects: 50000
    max_vertices: 10000000
    max_materials: 128
  godot:
    max_glb_size_mb: 100
    max_materials: 64
    max_draw_calls_est: 4000
```

These budgets are used by quality gates to ensure outputs stay within acceptable limits.

## Publish Section

Configuration for publishing outputs to viewers or distribution.

```yaml
publish:
  viewer:
    enabled: true
    paths:
      glb: fab/outora-library/viewer/assets/exports/outora_library.glb
      game: fab/outora-library/viewer/assets/games/outora_library/
```

### Fields

- **`viewer.enabled`**: Whether to publish to viewer
- **`viewer.paths`**: Destination paths for published assets
  - `glb`: Where to copy the main GLB export
  - `game`: Where to copy the Godot game build

## Path Conventions

All paths in `world.yaml` follow these conventions:

### Relative Paths

Paths are relative to the world directory **unless** they start with `fab/`:

```yaml
# Relative to world directory (fab/worlds/my_world/)
template_blend: blender/template.blend
script: blender/stages/prepare.py

# Relative to repo root
gates:
  - fab/gates/interior_library_v001.yaml
```

### Output Paths

Stage outputs are written to the run directory:

```
.cyntra/runs/<run_id>/
├── stages/
│   ├── prepare/     # From "stages/prepare/"
│   └── generate/    # From "stages/generate/"
├── world/
│   └── my_world.glb # From "world/my_world.glb"
└── render/
    └── beauty/      # From "render/beauty/*.png"
```

## Determinism

To ensure deterministic builds:

1. **Pin the seed**: Set `build.determinism.seed`
2. **Fix Python hashing**: Set `PYTHONHASHSEED=0`
3. **Use CPU rendering**: Set `CYCLES_DEVICE=CPU`
4. **Factory startup**: Use `--factory-startup` to ignore user prefs
5. **Seed all randomness**: Inject seed in prepare stage

Deterministic builds produce identical SHA256 hashes for all outputs when run with the same:
- Seed value
- Blender version
- Addon versions
- world.yaml configuration

## Manifest Generation

Builds automatically generate a `manifest.json` tracking:

```json
{
  "schema_version": "1.0",
  "world_id": "outora_library",
  "run_id": "world_outora_library_seed42_20251220T112900Z",
  "created_at": "2025-12-20T11:29:00Z",
  "determinism": {"seed": 42, "pythonhashseed": 0},
  "versions": {
    "blender_version": "4.0.2",
    "sverchok_version": "1.2.0",
    "dev_kernel_version": "0.1.0",
    "git_commit": "abc1234"
  },
  "parameters": {"lighting": {"preset": "cosmic"}},
  "stages": [
    {
      "id": "prepare",
      "status": "success",
      "duration_ms": 1234,
      "outputs": [
        {"path": "stages/prepare/prepared.blend", "sha256": "abc123..."}
      ]
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

## Validation

Validate your `world.yaml` against the schema:

```bash
fab-world validate-config fab/worlds/my_world/world.yaml
```

Common validation errors:

- **Invalid stage dependency**: Stage requires non-existent stage ID
- **Circular dependency**: Stage dependency cycle detected
- **Invalid path**: Referenced file doesn't exist
- **Type mismatch**: Parameter schema type doesn't match default value

## Examples

### Minimal World

```yaml
schema_version: "1.0"
world_id: simple_cube
world_type: props
version: "1.0.0"

build:
  template_blend: blender/template.blend

stages:
  - id: export
    type: blender
    script: blender/export.py
    outputs: ["world/cube.glb"]
```

### Complex Pipeline

```yaml
schema_version: "1.0"
world_id: complex_world
world_type: interior_architecture
version: "2.0.0"

generator:
  name: Complex World Generator
  author: Team
  required_addons:
    - id: sverchok
      required: true

build:
  template_blend: blender/template.blend
  blender_version_min: "4.0.0"
  determinism:
    seed: 42
    pythonhashseed: 0

parameters:
  defaults:
    quality: high
    variant: gothic
  schema:
    quality:
      type: enum
      values: [low, medium, high]

stages:
  - id: prepare
    type: blender
    script: blender/stages/prepare.py
    outputs: ["stages/prepare/"]

  - id: generate
    type: blender
    script: blender/stages/generate.py
    requires: [prepare]
    params: ["variant"]
    outputs: ["stages/generate/"]

  - id: export
    type: blender
    script: blender/stages/export.py
    requires: [generate]
    outputs: ["world/output.glb"]

  - id: validate
    type: gate
    requires: [export]
    gates:
      - fab/gates/quality_v001.yaml
```

## Best Practices

1. **Start simple**: Begin with minimal stages, add complexity incrementally
2. **Modular stages**: Each stage should have a single, clear responsibility
3. **Document parameters**: Use clear names and provide schema validation
4. **Test determinism**: Verify identical outputs with same seed
5. **Version carefully**: Use semantic versioning for breaking changes
6. **Gate early**: Add validation gates to catch issues before costly downstream stages
7. **Parameterize wisely**: Expose parameters that genuinely affect creative direction
8. **Keep scripts portable**: Avoid hard-coded paths, use provided directories

## Migration Guide

See `docs/migration-guide.md` for migrating existing pipelines to the Fab World system.

## See Also

- [Fab World System Overview](fab-world-system.md)
- [Stage Development Guide](fab-world-stages.md)
- [Quality Gates](quality-gates.md)
