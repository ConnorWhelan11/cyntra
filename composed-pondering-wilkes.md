# Outora Library → Fab World Pipeline: Implementation Plan

## Executive Summary

Transform Outora Library from a mixed-purpose asset directory into a deterministic, portable "Fab World" that integrates with the dev-kernel Fab system. The plan prioritizes reusing existing infrastructure while minimizing Outora-specific code.

## Assumptions & Non-goals

**Assumptions:**
- Builds run headless in workcells (no interactive Blender UI).
- Determinism is defined for a pinned toolchain (Blender version + add-on versions), recorded in the manifest.
- Network access is not required during builds (assets/scripts are in-repo).

**Non-goals (v1):**
- Rewriting the entire Outora generator; prefer thin wrappers around existing scripts.
- Guaranteeing bit-identical outputs across *different* Blender/Sverchok versions (we only guarantee within the pinned toolchain).
- GPU rendering (CPU-only for determinism).

## Current State Analysis

### Pain Points Identified

1. **Hard-coded paths**: 15 scripts use `/tmp/` defaults
2. **No determinism**: 3 scripts use unseeded `random`
3. **Fragile imports**: 8 scripts use `exec(open(...).read())`
4. **Mixed source/output**: 1.5GB of `.blend` files in `blender/`, unclear what's source vs generated
5. **No recipe config**: Pipeline params hard-coded in Python
6. **Duplicate validation**: Outora-specific gate logic separate from dev-kernel gates

### Existing Assets

**Good foundations:**
- `fab/outora-library/src/outora_library/paths.py` - Repo-relative path helpers (underutilized)
- `fab/outora-library/src/outora_library/game_contract.py` - Godot validation (good pattern)
- `fab/outora-library/blender/gate_validation.py` - Well-structured validation (931 lines, needs externalization)
- 50 Python scripts (~12,300 LOC) - Organized by pipeline stage

**Reusable infrastructure from dev-kernel:**
- Gate YAML schema (`fab/gates/*.yaml`) (already includes `interior_library_v001.yaml`, `godot_integration_v001.yaml`)
- `fab-godot` CLI with contract validation
- Determinism patterns (CPU rendering, PYTHONHASHSEED=0, pinned seeds)
- Manifest generation (SHA256, versions, iteration tracking)
- Iteration/repair loop with playbook mapping

## Target Architecture

### World Recipe Structure

```
fab/worlds/outora_library/
├── world.yaml                    # World recipe config (NEW)
├── README.md
├── blender/
│   ├── template.blend            # Source template (1 canonical file)
│   └── stages/                   # Blender-executed stage scripts
│       ├── prepare.py
│       ├── generate.py
│       ├── bake.py
│       ├── materials.py
│       ├── lighting.py
│       ├── render.py
│       └── export.py
├── gates/                        # Optional world-specific gate tuning
│   └── outora_library_v001.yaml
├── assets/                       # Source-only (textures, GLBs, licenses)
│   ├── models/
│   ├── textures/
│   └── licenses/
└── export/                       # Curated releases (LFS, committed sparingly)
    ├── outora_library_v0.5.0.glb
    └── metadata.json

# Build outputs (gitignored):
.glia-fab/runs/<run_id>/
├── stages/
│   ├── prepare/
│   ├── generate/
│   ├── bake/
│   ├── materials/
│   ├── lighting/
│   └── export/
├── world/
│   ├── outora_library_baked.blend
│   ├── outora_library.glb
│   └── sections/*.glb
├── render/
│   ├── beauty/*.png
│   └── clay/*.png
├── critics/
│   └── report.json
├── verdict/
│   └── gate_verdict.json
├── godot/
│   ├── project/
│   └── index.html
├── logs/
│   └── blender.log
└── manifest.json
```

### World Recipe Schema (world.yaml)

**Conventions:**
- All paths are relative to the world directory unless explicitly rooted at repo (e.g. `fab/gates/...`).
- `parameters.defaults` are the resolved defaults; CLI overrides are merged on top (dot-path keys like `lighting.preset`).
- `parameters.schema` is optional but recommended for validation + `fab-world inspect`.
- `stages` is an ordered list; `requires` is validated and used for `--until`.

```yaml
# fab/worlds/outora_library/world.yaml
schema_version: "1.0"

world_id: outora_library
world_config_id: outora_library_gothic_v001
world_type: interior_architecture
version: "0.5.0"

generator:
  name: Outora Gothic Mega Library
  description: |
    Procedurally generated Gothic cathedral library with 3 tiers,
    symmetrical wings, study pods, and furniture.
  author: Outora Team
  required_addons:
    - id: sverchok
      required: true

build:
  template_blend: blender/template.blend
  blender_version_min: "4.0.0"
  determinism:
    seed: 42
    pythonhashseed: 0
    cycles_seed: 42
  blender:
    # Use factory startup to avoid user prefs; enable only required addons in prepare stage.
    args: ["--background", "--factory-startup"]
    env:
      CYCLES_DEVICE: "CPU"
      PYTHONHASHSEED: "0"

parameters:
  defaults:
    layout:
      bay_size_m: 6.0
      tier_count: 3
      wing_depth: 3
      complexity: medium # low | medium | high
    bake:
      mode: all # all | layout_only | test
    geometry:
      ceiling_height_m:
        tier_1: 12.0
        tier_2: 8.0
        tier_3: 6.0
      column_style: gothic_clustered
    furniture:
      desk_count: 24
      chair_count: 48
      shelf_count: 16
    materials:
      stone_variant: limestone_weathered
      wood_variant: oak_aged
      color_palette: warm_academic
    lighting:
      preset: dramatic # dramatic | warm_reading | cosmic
      window_emission: 2.5
      chandelier_count: 8
  schema:
    lighting.preset:
      type: enum
      values: [dramatic, warm_reading, cosmic]
    layout.complexity:
      type: enum
      values: [low, medium, high]
    bake.mode:
      type: enum
      values: [all, layout_only, test]
      default: all

stages:
  - id: prepare
    type: blender
    script: blender/stages/prepare.py
    outputs: ["stages/prepare/"]

  - id: generate
    type: blender
    script: blender/stages/generate.py
    requires: [prepare]
    outputs: ["stages/generate/"]

  - id: bake
    type: blender
    script: blender/stages/bake.py
    requires: [generate]
    params: ["bake.mode", "layout.complexity"]
    outputs: ["world/outora_library_baked.blend"]

  - id: materials
    type: blender
    script: blender/stages/materials.py
    requires: [bake]
    outputs: ["stages/materials/"]

  - id: lighting
    type: blender
    script: blender/stages/lighting.py
    requires: [materials]
    params: ["lighting.preset"]
    outputs: ["stages/lighting/"]

  - id: render
    type: blender
    script: blender/stages/render.py
    requires: [lighting]
    outputs: ["render/beauty/*.png", "render/clay/*.png"]

  - id: export
    type: blender
    script: blender/stages/export.py
    requires: [lighting]
    outputs: ["world/outora_library.glb", "world/sections/*.glb"]
    settings:
      draco_compression: true

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
    outputs: ["godot/project/", "godot/index.html"]

budgets:
  blender:
    max_objects: 50000
    max_vertices: 10000000
  godot:
    max_glb_size_mb: 100
    max_materials: 64
    max_draw_calls_est: 4000

publish:
  viewer:
    enabled: true
    # During migration, publish into the existing viewer under fab/outora-library/.
    paths:
      glb: fab/outora-library/viewer/assets/exports/outora_library.glb
      game: fab/outora-library/viewer/assets/games/outora_library/
```

## Technical Specifications

### Stage Contract Interface

Every `type: blender` stage script must export a standard `execute()` function:

```python
# blender/stages/generate.py (example)
from pathlib import Path
from typing import Any, Dict, Mapping

def execute(
    *,
    run_dir: Path,                 # Root run directory
    stage_dir: Path,               # Where to write this stage's outputs
    inputs: Mapping[str, Path],    # stage_id -> stage_dir for dependencies
    params: Dict[str, Any],        # Resolved params (defaults + CLI overrides)
    manifest: Dict[str, Any],      # Running manifest (mutated in-place)
) -> Dict[str, Any]:
    """
    Execute the generate stage.

    Returns:
        {
            "success": True/False,
            "outputs": [list of file paths created],
            "metadata": {stage-specific data},
            "errors": [list of error messages if failed]
        }
    """
    # Inject determinism
    seed = manifest["determinism"]["seed"]
    import random
    random.seed(seed)

    # Import bpy inside the function so the module stays importable in CPython unit tests.
    import bpy
    bpy.context.scene.cycles.seed = seed

    # Stage logic here...

    return {
        "success": True,
        "outputs": [str(stage_dir / "kit_pieces.blend")],
        "metadata": {"piece_count": 24},
    }
```

### CLI Interface

```bash
# Build entire world
fab-world build \
  --world fab/worlds/outora_library \
  --output .glia-fab/runs/<run_id> \
  [--seed 42] \
  [--param lighting.preset=cosmic]

# Build up to specific stage (stages are addressed by `id`)
fab-world build \
  --world fab/worlds/outora_library \
  --until export

# Validate only (skip build)
fab-world validate \
  --world fab/worlds/outora_library \
  --asset .glia-fab/runs/run_001/world/outora_library.glb

# List available worlds
fab-world list

# Inspect world config
fab-world inspect fab/worlds/outora_library --json
```

### Manifest Structure

```json
{
  "schema_version": "1.0",
  "world_id": "outora_library",
  "world_config_id": "outora_library_gothic_v001",
  "world_version": "0.5.0",
  "run_id": "world_outora_library_seed42_20251219T143022Z",
  "created_at": "2025-12-19T14:30:22Z",
  "determinism": {
    "seed": 42,
    "pythonhashseed": 0,
    "cycles_seed": 42
  },
  "versions": {
    "blender_version": "4.0.2",
    "sverchok_version": "1.2.0",
    "dev_kernel_version": "0.1.0",
    "git_commit": "abc1234"
  },
  "parameters": {
    "layout": {"bay_size_m": 6.0},
    "lighting": {"preset": "cosmic"}
  },
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

### Module Architecture

**New Modules:**
- `dev-kernel/src/dev_kernel/fab/world.py` - Main world system entry point
- `dev-kernel/src/dev_kernel/fab/world_config.py` - YAML schema loader
- `dev-kernel/src/dev_kernel/fab/world_runner.py` - Pipeline executor
- `dev-kernel/src/dev_kernel/fab/world_manifest.py` - Manifest tracking
- `dev-kernel/src/dev_kernel/fab/stage_executor.py` - Blender stage wrapper
- `dev-kernel/src/dev_kernel/fab/critics/structural_rhythm.py` - Library-specific critic
- `dev-kernel/src/dev_kernel/fab/critics/furniture.py` - Furniture detection critic
- `dev-kernel/src/dev_kernel/adapters/fab_world.py` - Dev-kernel adapter

**World-Specific Modules:**
- `fab/worlds/outora_library/world.yaml` - Main recipe config
- `fab/worlds/outora_library/blender/template.blend` - Canonical source template
- `fab/worlds/outora_library/blender/stages/prepare.py` - Stage 1: Seed + addon enable
- `fab/worlds/outora_library/blender/stages/generate.py` - Stage 2: Kit generation (from gothic_kit_generator.py)
- `fab/worlds/outora_library/blender/stages/bake.py` - Stage 3: Layout baking (from bake_gothic_v2.py)
- `fab/worlds/outora_library/blender/stages/materials.py` - Stage 4: Material application
- `fab/worlds/outora_library/blender/stages/lighting.py` - Stage 5: Lighting setup
- `fab/worlds/outora_library/blender/stages/render.py` - Stage 6: Preview renders
- `fab/worlds/outora_library/blender/stages/export.py` - Stage 7: GLB export
- `fab/worlds/outora_library/gates/outora_library_v001.yaml` - Optional world-specific gate tuning

## Implementation Plan

### Phase 1: Foundation (Prep work, no breaking changes)

**Goals:**
- Establish repo structure
- Create config schema
- Eliminate hard-coded paths

**Tasks:**

1.1. **Create world directory structure**
   - Create `fab/worlds/outora_library/`
   - Move existing assets to proper locations (copy, don't delete yet)
   - Keep original `fab/outora-library/` intact during transition

1.2. **Define world.yaml schema**
   - Create JSON schema for validation
   - Write example `world.yaml` for Outora Library
   - Document schema in `docs/fab-world-schema.md`

1.3. **Fix path resolution in existing scripts**
   - Audit all 15 scripts with `/tmp/` references
   - Replace with explicit run/stage dirs (`FAB_RUN_DIR`, `FAB_STAGE_DIR`) passed in by the runner (no `/tmp` fallback)
   - Use `outora_library.paths` helpers consistently
   - Update all `exec(open(...).read())` to proper imports

1.4. **Add determinism to randomness**
   - Add `random.seed(seed)` at entry points
   - Accept `--seed` CLI arg (default from world.yaml)
   - Update 3 scripts: `add_furniture.py`, `add_personal_items.py`, `integrate_assets.py`
   - Standardize Blender invocation flags: `--background --factory-startup` (avoid user prefs), record versions in manifest

**Acceptance:**
- No script has hard-coded `/tmp/` or absolute paths
- All scripts accept `--output-dir` and `--seed` args
- `world.yaml` schema documented with examples

---

### Phase 2: World Runner CLI (standalone, reusable by dev-kernel)

**Goals:**
- Create world build CLI
- Deterministic end-to-end builds
- Reuse existing `dev_kernel.fab` modules where possible (`gate.py`, `render.py`, `godot.py`)

**Tasks:**

2.1. **Create fab-world CLI tool**
   ```python
   # dev-kernel/src/dev_kernel/fab/world.py

   def main():
       parser = argparse.ArgumentParser()
       parser.add_argument("--world", required=True)   # path to fab/worlds/<id>
       parser.add_argument("--output", required=True)  # run dir
       parser.add_argument("--seed", type=int, default=None)
       parser.add_argument("--param", action="append", default=[])  # key=value, supports dot paths

       # Load world.yaml
       # Generate run_id
       # Execute stages in order
       # Track outputs in manifest
       # Return verdict
   ```

2.2. **Implement stage execution**
   - Create `WorldStage` dataclass (inputs, outputs, script, params)
   - Create `StageRunner` to invoke Blender headlessly
   - Pass consistent environment: `FAB_RUN_DIR`, `FAB_STAGE_DIR`, `FAB_SEED`, `FAB_RUN_ID`, `PYTHONPATH=<repo_root>`
   - Capture stdout/stderr to logs
   - Validate outputs exist before continuing

2.3. **Generate manifest.json**
   - SHA256 for every output file
   - Record: blender_version, python_version, dev_kernel_version
   - Record: git_commit, world.yaml sha256, resolved toolchain versions (including add-ons if detectable)
   - Record: world_id, world_version, seed, resolved_params
   - Record: stage execution times and status
   - Record: Sverchok addon version if present

2.4. **Add entry point to pyproject.toml**
   ```toml
   [project.scripts]
   fab-world = "dev_kernel.fab.world:main"
   ```

**Acceptance:**
- `fab-world build --world fab/worlds/outora_library --output .glia-fab/runs/test --seed 1337` builds successfully
- Manifest contains SHA256 for all outputs
- Running twice with same seed produces identical GLB (SHA256 match)

---

### Phase 3: Gate Unification (Validation standardization)

**Goals:**
- Externalize Outora validation to YAML
- Route validation through dev-kernel gates
- Deprecate bespoke validators

**Tasks:**

3.1. **Align Outora validation with existing gate config**
   - Start from existing `fab/gates/interior_library_v001.yaml`
   - Compare coverage/thresholds vs `fab/outora-library/blender/gate_validation.py`
   - Add any missing knobs to YAML (thresholds/config), keeping logic in Python critics

3.2. **Implement world-specific critics**
   ```python
   # dev-kernel/src/dev_kernel/fab/critics/structural_rhythm.py / furniture.py

   class RhythmCritic:
       """Validate structural bay spacing (Gothic library = 6m)"""

   class FurnitureCritic:
       """Validate furniture presence and placement"""

   class PlayableAreaCritic:
       """Validate navigable floor area and connectivity"""
   ```

3.3. **Integrate with fab-world CLI**
   - Add `--gate-config` arg to fab-world
   - After export stage, run gate evaluation via `dev_kernel.fab.gate` (or `fab-gate` CLI if needed)
   - Parse gate verdict JSON
   - Include in world manifest

3.4. **Deprecate standalone gate_validation.py**
   - Add deprecation warning
   - Update docs to use `fab-world` instead
   - Keep file for reference until Phase 6

**Acceptance:**
- `fab/gates/interior_library_v001.yaml` validates and runs end-to-end on an Outora GLB
- Pass/fail decisions match `gate_validation.py` on a small baseline set (allowing expected scoring differences)
- Failures include repair_playbook instructions

---

### Phase 4: Godot Contract Integration

**Goals:**
- Validate Godot contract during build
- Produce playable Web export
- Publish to viewer automatically

**Tasks:**

4.1. **Add Godot contract validation stage**
   - After export_glb stage, run contract validator
   - Check for SPAWN_PLAYER marker (or alias)
   - Check for COLLIDER_* meshes
   - Fail fast with actionable error if missing

4.2. **Integrate fab-godot**
   - Add godot_build stage to world.yaml
   - Copy GLB to `fab/godot/template/assets/`
   - Run `fab-godot --config godot_integration_v001 --out <run_dir>/godot`
   - Generate `index.html` Web export

4.3. **Implement viewer publishing**
   - After successful godot_build, copy outputs to viewer paths
   - Symlink or copy GLB to `viewer/assets/exports/`
   - Copy game build to `viewer/assets/games/`
   - Update viewer index with new asset

**Acceptance:**
- Godot contract validator catches missing SPAWN_PLAYER
- Web export runs in browser
- `viewer/assets/games/outora_library/index.html` loads successfully

---

### Phase 5: Source/Output Separation

**Goals:**
- Enforce gitignore rules
- Curate release exports
- Clean up historical artifacts

**Tasks:**

5.1. **Tighten ignore rules (mostly already present)**
   - Confirm root `.gitignore` already ignores `.glia-fab/` and `*.blend1`
   - Add any world-local cache patterns only if the world directory starts producing outputs outside `.glia-fab/`

5.2. **Consolidate source blend files**
   - Move `blender/outora_library_v0.4.0.blend` → `blender/template.blend`
   - Archive older versions to external storage or delete
   - Keep only canonical template in repo

5.3. **Establish release workflow**
   - Use `export/` directory for curated releases (avoids the repo-wide `exports/` ignore pattern)
   - Add `fab-world publish` command to copy approved outputs
   - Include metadata.json with version, SHA256, build params

**Acceptance:**
- Repo size reduced by ~1GB (old .blend files removed)
- `git status` shows no generated outputs
- Fresh clone + `fab-world build` works end-to-end

---

### Phase 6: Dev-Kernel Integration

**Goals:**
- Make worlds buildable via dev-kernel jobs
- Support repair iterations
- Enable parallel speculation

**Tasks:**

6.1. **Add world build job type to dispatcher**
   ```python
   # dev-kernel/src/dev_kernel/kernel/dispatcher.py

   if "asset:world" in issue.tags:
       manifest["job_type"] = "fab-world"
       manifest["world_config"] = load_world_config(issue)
       manifest["quality_gates"] = build_world_gates(issue)
   ```

6.2. **Update verifier for world jobs**
   ```python
   # dev-kernel/src/dev_kernel/kernel/verifier.py

   if job_type == "fab-world":
       # Find world GLB in workcell
       # Run fab-world with gates enabled
       # Parse gate verdicts
       # Update proof.verification
   ```

6.3. **Create repair playbook mapping**
   - Map gate failure codes to issue descriptions
   - Generate repair issues with playbook instructions
   - Track iteration count in Beads

6.4. **Test full cycle**
   - Create test issue: `tags: ["asset:world", "gate:interior"]`
   - Run `dev-kernel run --once --issue <id>`
   - Verify workcell isolation
   - Verify gate evaluation
   - Verify repair iteration on failure

**Acceptance:**
- Dev-kernel can build Outora world in clean workcell
- Gate failures generate repair issues with instructions
- Iteration count tracked correctly

---

### Phase 7: Testing & Documentation

**Goals:**
- Comprehensive test coverage
- Migration guide
- Troubleshooting docs

**Tasks:**

7.1. **Unit tests**
   ```python
   # dev-kernel/tests/fab/test_world.py

   def test_world_config_parsing():
       """world.yaml loads and validates"""

   def test_stage_execution():
       """Stages run in correct order with dependencies"""

   def test_path_resolution():
       """No absolute paths in configs or scripts"""

   def test_determinism():
       """Same seed produces identical manifest SHA256"""

   def test_godot_contract_validation():
       """Missing spawn marker fails with clear error"""
   ```

7.2. **Integration tests**
   ```python
   def test_end_to_end_build():
       """Full pipeline: prepare → export → validate → godot"""

   def test_gate_failure_recovery():
       """Failed gate produces actionable repair instructions"""

   def test_viewer_publishing():
       """Successful build updates viewer paths correctly"""
   ```

7.3. **Documentation**
   - `docs/fab-world-system.md` - Architecture overview
   - `docs/fab-world-schema.md` - world.yaml reference
   - `docs/migration-guide.md` - Old → New migration steps
   - `fab/worlds/README.md` - Quick start guide

**Acceptance:**
- 90%+ test coverage for world.py and critics
- Docs reviewed and tested by external user
- Troubleshooting guide covers common errors

## Migration Checklist

### Pre-migration Validation
- [ ] Backup current `fab/outora-library/`
- [ ] Document current pipeline outputs (GLB sizes, render counts)
- [ ] Establish baseline: run current pipeline and save outputs

### Phase-by-Phase Execution
- [ ] Phase 1: Foundation (1-2 days)
  - [ ] Create directory structure
  - [ ] Define world.yaml schema
  - [ ] Fix path resolution
  - [ ] Add determinism

- [ ] Phase 2: Pipeline Harness (2-3 days)
  - [ ] Create fab-world CLI
  - [ ] Implement stage execution
  - [ ] Generate manifests
  - [ ] Verify determinism

- [ ] Phase 3: Gate Unification (2 days)
  - [ ] Create interior_library_v001.yaml
  - [ ] Implement world critics
  - [ ] Integrate with fab-world
  - [ ] Compare outputs to baseline

- [ ] Phase 4: Godot Integration (1-2 days)
  - [ ] Add contract validation
  - [ ] Integrate fab-godot
  - [ ] Implement viewer publishing
  - [ ] Test in browser

- [ ] Phase 5: Source/Output Separation (1 day)
  - [ ] Update .gitignore
  - [ ] Consolidate blend files
  - [ ] Establish release workflow
  - [ ] Verify fresh clone works

- [ ] Phase 6: Dev-Kernel Integration (2-3 days)
  - [ ] Add world job type
  - [ ] Update verifier
  - [ ] Create repair playbook
  - [ ] Test full iteration cycle

- [ ] Phase 7: Testing & Docs (2-3 days)
  - [ ] Write unit tests
  - [ ] Write integration tests
  - [ ] Write documentation
  - [ ] External review

### Post-migration Cleanup
- [ ] Archive old `fab/outora-library/` to external storage
- [ ] Update project README with new world system
- [ ] Announce to team with migration guide link

## Risk Mitigation

### Risk: Sverchok dependency breaks in headless mode
**Mitigation:**
- Detect Sverchok presence, fail gracefully with instructions
- Provide fallback layout generation without Sverchok for CI
- Document Sverchok installation in setup guide

### Risk: Non-determinism persists (hidden randomness)
**Mitigation:**
- Comprehensive logging of all random calls
- Hash-based regression testing
- Document known nondeterminism sources

### Risk: Migration breaks existing workflows
**Mitigation:**
- Keep old pipeline intact until Phase 5
- Side-by-side comparison of outputs
- Rollback plan: git revert + restore backup

### Risk: Godot export fails on CI (headless limitations)
**Mitigation:**
- Make godot_build stage optional
- Provide skip flag for CI
- Document manual export process as fallback

## Success Metrics

- [ ] **Determinism**: 3 consecutive builds with same seed produce identical GLB SHA256
- [ ] **Portability**: Fresh workcell build succeeds with Blender + required add-ons installed (pinned), plus repo checkout (no network)
- [ ] **Performance**: Full build completes in <10 minutes (excluding render time)
- [ ] **Integration**: Dev-kernel can schedule world builds and track iterations
- [ ] **Documentation**: External user follows migration guide successfully
- [ ] **Cleanup**: Repo size reduced, no generated artifacts in git

## User Decisions (Confirmed)

1. **Sverchok dependency**: ✅ Required - fail early with install instructions
   - Detect addon presence in prepare.py
   - Fail with actionable error message linking to installation guide
   - Document Sverchok setup in world README.md

2. **Multi-world support**: ✅ From day 1
   - Use `fab/worlds/<world_id>/` pattern throughout
   - Design all infrastructure to be world-agnostic
   - Outora Library is first reference implementation

3. **Git LFS for large .blend files**: ✅ Use Git LFS for files > 100MB
   - `.gitattributes` already tracks `*.blend` and `*.glb` via LFS
   - Verify existing large binaries are actually in LFS (`git lfs ls-files`) and migrate history if needed (Phase 5)
   - Update setup docs with Git LFS installation steps

4. **Timeline**: ✅ Aggressive (2-3 weeks full-time)
   - Week 1: Phase 1–2 (world schema + runner + deterministic build)
   - Week 2: Phase 3–4 (gates + Godot + viewer publish)
   - Week 3: Phase 5–7 (cleanup + dev-kernel integration + tests/docs)

## Open Questions / Follow-ups

- **Sverchok distribution**: Require local install + pinned version (current), or vendor into repo for truly portable workcells?
- **Viewer location**: Keep publishing into `fab/outora-library/viewer/` during migration (current), or move to per-world `fab/worlds/<id>/viewer/` and update consumers?
- **Release artifacts**: Should `fab/worlds/<id>/export/` be committed (LFS) or treated as build artifacts only?
- **Stage granularity**: One Blender process per stage (simpler, slower) vs one Blender session for all stages (faster, more shared state)?

## Critical Files for Implementation

### Core Infrastructure (Phase 1-2)

**NEW - Main World System:**
- `dev-kernel/src/dev_kernel/fab/world.py` - Entry point and WorldRunner class
- `dev-kernel/src/dev_kernel/fab/world_config.py` - YAML schema and loader
- `dev-kernel/src/dev_kernel/fab/world_runner.py` - Stage orchestration
- `dev-kernel/src/dev_kernel/fab/world_manifest.py` - Manifest tracking with SHA256
- `dev-kernel/src/dev_kernel/fab/stage_executor.py` - Blender invocation wrapper

**NEW - World Configuration:**
- `fab/worlds/outora_library/world.yaml` - Main recipe config
- `fab/worlds/outora_library/gates/outora_library_v001.yaml` - Optional world-specific gate tuning

**NEW - Stage Scripts:**
- `fab/worlds/outora_library/blender/stages/prepare.py` - Seed injection + addon enable
- `fab/worlds/outora_library/blender/stages/generate.py` - From gothic_kit_generator.py
- `fab/worlds/outora_library/blender/stages/bake.py` - From bake_gothic_v2.py
- `fab/worlds/outora_library/blender/stages/materials.py` - From gothic_materials.py
- `fab/worlds/outora_library/blender/stages/lighting.py` - From gothic_lighting.py
- `fab/worlds/outora_library/blender/stages/render.py` - Calls existing render infrastructure
- `fab/worlds/outora_library/blender/stages/export.py` - From export_fab_game_glb.py

### Gate System (Phase 3)

**NEW - World-Specific Critics:**
- `dev-kernel/src/dev_kernel/fab/critics/structural_rhythm.py` - Bay spacing validation
- `dev-kernel/src/dev_kernel/fab/critics/furniture.py` - Furniture detection

**EXISTING (tune):**
- `fab/gates/interior_library_v001.yaml` - Gate config tuned for Outora mega library
- `fab/gates/godot_integration_v001.yaml` - Godot contract + export checks

**DEPRECATE:**
- `fab/outora-library/blender/gate_validation.py` - Keep for reference until Phase 6

### Dev-Kernel Integration (Phase 6)

**NEW - Adapter:**
- `dev-kernel/src/dev_kernel/adapters/fab_world.py` - Beads → fab-world integration

**MODIFY:**
- `dev-kernel/src/dev_kernel/kernel/dispatcher.py` - Add world job routing
- `dev-kernel/src/dev_kernel/kernel/verifier.py` - Add world gate handling
- `dev-kernel/pyproject.toml` - Add fab-world CLI entry point

### Configuration Files

**EXISTING (verify):**
- `.gitattributes` - Git LFS rules for `*.blend` / `*.glb`

**NEW:**
- `fab/worlds/outora_library/README.md` - Setup + usage guide

**MODIFY:**
- `.gitignore` - Only if new world-local output paths appear outside `.glia-fab/`

### Testing (Phase 7)

**NEW - Tests:**
- `dev-kernel/tests/fab/test_world_config.py` - Config loading tests
- `dev-kernel/tests/fab/test_world_runner.py` - Pipeline execution tests
- `dev-kernel/tests/fab/test_determinism.py` - Reproducibility tests
- `dev-kernel/tests/integration/test_world_pipeline.py` - End-to-end tests

### Migration Reference (Keep during transition)

**DEPRECATED (keep for reference until Phase 5 complete):**
- `fab/outora-library/blender/*.py` - 50 original scripts
- `fab/outora-library/src/outora_library/*.py` - Helper modules (migrate to stages/lib/)

## Next Steps

1. **Immediate next action**: Begin Phase 1 - Infrastructure setup
   - Create `dev-kernel/src/dev_kernel/fab/world.py` skeleton
   - Create `fab/worlds/outora_library/world.yaml` config
   - Verify Git LFS coverage for existing `.blend` / `.glb` files
2. **Success checkpoint**: After each phase, validate against acceptance criteria before proceeding
3. **Timeline**: Use the phase durations in the Migration Checklist as the working estimate; revisit after Phase 2 determinism is proven
