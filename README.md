<p align="center">
  <img src="docs/static/cyntra-lore.webp" alt="Cyntra" width="600">
</p>

# Cyntra

Autonomous development kernel with deterministic multi-agent orchestration for 3D world creation.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [World Building](#world-building)
  - [Blender Pipeline](#blender-pipeline)
  - [Sverchok Scaffolds](#sverchok-scaffolds)
  - [Godot Templates](#godot-templates)
  - [Quality Gates](#quality-gates)
  - [ComfyUI Integration](#comfyui-integration)
- [AI Stack](#ai-stack)
  - [LLM Toolchains](#llm-toolchains)
  - [3D Generation](#3d-generation)
  - [Game AI](#game-ai)
  - [Knowledge Graph](#knowledge-graph)
  - [Quality Critics](#quality-critics)
  - [Model Training](#model-training)
  - [Formal Verification](#formal-verification-logos)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Key Concepts](#key-concepts)
- [Configuration](#configuration)
- [Documentation](#documentation)

## Overview

Cyntra is a self-healing development system that schedules work from a git-based task graph to isolated sandboxes, routes tasks to competing LLM toolchains, and verifies results through quality gates. Failed attempts auto-escalate with full audit trails. Every execution produces Patch+Proof artifacts.

The platform comes **batteries included** for building 3D worlds and game universes: parametric Blender scaffolds, Sverchok node trees, Godot project templates, multi-signal quality gates, and deterministic render pipelines.

**Core loop:** Beads (work graph) → Scheduler → Dispatcher → Workcell (isolated sandbox) → Quality Gates → Archive

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop                                                    │
│  Tauri + React / Workcell monitor, terminals, run history   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Kernel                                                     │
│  Scheduler → Dispatcher → Verifier                          │
│  Python orchestrator / Rust CLI                             │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Workcell Pool                                              │
│  Isolated git worktrees per task                            │
│  Claude | Codex | OpenCode | Crush                          │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Quality Gates                                              │
│  Code: pytest, mypy, ruff                                   │
│  Assets: CLIP realism, geometry, PBR validation             │
│  Godot: integration, performance, playability               │
└─────────────────────────────────────────────────────────────┘
```

## World Building

Cyntra provides a complete pipeline for agents to create 3D worlds from parametric generation through playable game builds.

### Blender Pipeline

37 automation scripts for procedural generation, rendering, and export:

| Category | Scripts | Purpose |
|----------|---------|---------|
| Generation | `gothic_kit_generator.py`, `blockout_generate.py` | Procedural geometry (Gothic vaults, piers, buttresses) |
| Materials | `gothic_materials.py`, `materials_outora_variants.py` | PBR material libraries with variants |
| Export | `export_fab_game_glb.py`, `export_sections_glb.py` | GLB with contract markers for Godot |
| Rendering | `render_eevee_preview.py`, `gothic_lighting.py` | Deterministic renders with lookdev rigs |
| Pipeline | `run_pipeline.py`, `run_headless.py` | Orchestrated headless execution |

Master assets in `fab/assets/blender/`:
- `outora_library_v0.4.0.blend` (1.2GB) — Parametric furniture, architectural elements
- `gothic_library_2_cycles.blend` (182MB) — Complete Gothic cathedral interior

### Sverchok Scaffolds

Parametric scaffold system in `kernel/src/cyntra/fab/scaffolds/`:

| Scaffold | Parameters | Output |
|----------|------------|--------|
| `CarScaffold` | Length, wheelbase, body style, detail level | Vehicle meshes with wheel geometry |
| `CarSverchokScaffold` | NURBS curves, topology ops | Advanced automotive forms |
| `StudyPodScaffold` | Desk style, chair type, book arrangements | Furnished study spaces |

Scaffolds export JSON manifests with parameter schemas and SHA256 hashes for drift detection.

### Godot Templates

Complete Godot 4 project template in `fab/godot/`:

**Core Scripts:**
- `FabLevelLoader.gd` — Loads GLB exports with contract markers
- `FabPlayerController.gd` — First-person walkaround controller
- `FabTriggerArea.gd` — Trigger volume handler

**Contract Markers** (survive Blender→GLB→Godot round-trip):
- `SPAWN_PLAYER` — Player start positions
- `COLLIDER_*` — Static collision meshes
- `TRIGGER_*` — Area triggers with callbacks
- `INTERACT_*` — Interactable objects
- `NAV_*` — Navigation mesh regions
- `NPC_SPAWN_*` — NPC spawn points

**Vault Addons** (`fab/vault/godot/`):
- beehave (behavior trees), gaea (procedural terrain)
- limboai, terrain3d, godot_jolt (physics)
- Dojo/Starknet integration for onchain game state

### Quality Gates

13 YAML gate configs in `fab/gates/` for multi-signal validation:

| Gate Type | Examples | Validates |
|-----------|----------|-----------|
| Realism | `car_realism_v001`, `furniture_realism_v001` | Proportions, materials, PBR quality |
| Gameplay | `gameplay_playability_dungeon_v001` | Nav-mesh coverage, layout rules |
| Integration | `godot_integration_v001` | Marker parsing, script loading |
| Performance | `godot_performance_v001` | Draw calls, LOD, memory budgets |

Gates run deterministic CYCLES renders (CPU-only, pinned seed) through lookdev scenes with fixed camera rigs.

### ComfyUI Integration

World configs in `fab/worlds/*/world.yaml` define generation pipelines:

```yaml
# Example: starter_pack - generates 30+ PBR materials
stages:
  - prepare.py   # Setup scene, collect inputs
  - generate.py  # ComfyUI material generation (CHORD Turbo, 3s/material)
  - bake.py      # Lighting/material bakes
  - optimize.py  # Compression, LOD generation
  - validate.py  # Gate checks
```

11 world configurations: `outora_library` (Gothic mega-library), `starter_pack` (material library), `enchanted_forest`, `dark_dungeon`, `orbital_station`, and more.

## AI Stack

### LLM Toolchains

Routes tasks to competing agents based on risk, complexity, and tags:

| Adapter | Models | Notes |
|---------|--------|-------|
| Claude | Opus 4.5, Sonnet, Haiku | Primary. MCP support, extended thinking |
| Codex | GPT-5.2, o3, o1 | High-stakes tasks. Sandbox mode |
| OpenCode | Configurable | Flexible provider/model |
| Crush | Multi-provider | Terminal agent. Anthropic, OpenAI, Bedrock, Vertex |

### 3D Generation

| System | Model | Purpose |
|--------|-------|---------|
| Hunyuan 3D | v2.1 | Image-to-mesh via ComfyUI |
| SDXL | Stability | Texture generation |
| Flux | Black Forest Labs | Inpainting and refinement |

Orchestrated through ComfyUI with deterministic seeds for reproducibility.

### Game AI

Hierarchical vision-to-action system for automated playtesting:

| Component | Size | Rate | Role |
|-----------|------|------|------|
| Monet | 7B MLLM | 2 Hz | High-level planner |
| NitroGen | 500M | 60 Hz | Frame-to-action executor |

Rust game AI framework in `crates/ai-bevy/`:
- Behavior trees, GOAP, HTN planners
- Steering behaviors (seek, flee, wander, flocking)
- Crowd simulation, navigation, perception

### Knowledge Graph

| Component | Technology | Purpose |
|-----------|------------|---------|
| CocoIndex | Nomic Embed v1.5 (768-dim) | Semantic codebase search |
| pgvector | PostgreSQL extension | Vector storage |
| Neo4j | Graph database | Optional knowledge export |

### Quality Critics

Multi-signal asset validation:

- **CLIP** (LAION aesthetic head) for realism scoring
- **PBR validation** for metalness, roughness, normal maps
- **Geometry critics** for structural integrity
- **Claude Vision** fallback for edge cases

### Model Training

Custom models trained on kernel execution artifacts:

| Model | Architecture | Purpose |
|-------|--------------|---------|
| URM | Universal Transformer + TBPTL | Reasoning (53.8% ARC-AGI-1) |
| Swarm Planner | URM encoder + multi-head classifier | Resource allocation policy |
| Outcome Model | Contextual bandit Q(x,a) | Pass probability, cost prediction |

Training infrastructure:
- **Dataset**: `.cyntra/archives/*` execution traces + `.beads/issues.jsonl`
- **Labels**: Counterfactual best-of-K evaluation with Pareto selection
- **Inference**: ONNX export for production (no torch dependency in kernel)

Prompt optimization (GEPA-style genetic evolution):
- **Genome**: system_prompt + instruction_blocks + tool_use_rules + sampling params
- **Loop**: Mutation → kernel evaluation → Pareto frontier + crowding distance
- **Selection**: Multi-objective optimization (pass_rate, cost, latency)

### Formal Verification (Logos)

Proof-carrying plans for AI decision-making:

| Crate | Purpose |
|-------|---------|
| logos-ffi | FFI to modal-temporal logic (Lean 4 ProofChecker) |
| logos-z3 | Z3-based counterexample generation for invalid plans |
| logos-goap | Verified GOAP planning with proof receipts |

The goal: AI planners that can prove their plans are valid, or provide counterexamples when they're not. Plans become auditable artifacts with formal guarantees.

## Installation

Requires [mise](https://mise.jdx.dev) for toolchain management.

```bash
curl https://mise.run | sh
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
mise install
```

Installs: Python 3.12, Node 24, Bun 1.1, Rust 1.85

## Usage

```bash
# Kernel
./crates/target/release/cyntra run --once    # Single pass
./crates/target/release/cyntra run --watch   # Continuous
./crates/target/release/cyntra status        # Check state

# Desktop
cd apps/desktop && bun run tauri dev

# Fab Pipeline
fab-gate --config fab/gates/car_realism_v001.yaml --asset <path.glb>
fab-render --asset <path.blend> --lookdev fab/lookdev/scenes/car_lookdev_v001.blend
fab-godot --asset <path.glb> --output <dir>

# Tests
mise run test
```

## Project Structure

```
apps/desktop/          Tauri desktop application
kernel/                Python orchestrator
  src/cyntra/
    kernel/            Scheduler, dispatcher, verifier
    adapters/          LLM toolchain integrations
    workcell/          Git worktree management
    fab/               Asset pipeline
      scaffolds/       Parametric generators (car, furniture)
      critics/         CLIP, geometry, material validators
      render.py        Deterministic Blender rendering
      gate.py          Quality gate runner
    planner/           Swarm policy model
    evolve/            GEPA prompt evolution
    memory/            Vector storage, context injection
    indexing/          CocoIndex integration
crates/                Rust workspace
  cyntra-core/         Core kernel (Rust)
  cyntra-cli/          CLI binary
  ai-bevy/             Game AI (GOAP, HTN, BT, steering, crowd)
  logos-*/             Formal verification (modal logic, Z3)
fab/                   Asset pipeline
  assets/blender/      Master .blend files (1.2GB+ library)
  gates/               Quality gate YAML configs
  lookdev/             Camera rigs, lighting scenes
  godot/               Godot 4 project template
  vault/godot/         Addons (beehave, terrain3d, limboai)
  worlds/              World generation configs
  workflows/           ComfyUI workflow definitions
research/              Experimental projects
  backbay-imperium/    4X strategy game (Godot + Rust)
  monet-nitrogen/      Hierarchical game AI
  logos/               Lean 4 modal-temporal logic prover
train/                 Model training
  URM/                 Universal Reasoning Model (ARC-AGI)
docs/                  Specifications
```

## Key Concepts

| Term | Definition |
|------|------------|
| Beads | Git-based work graph in `.beads/issues.jsonl` |
| Workcell | Isolated git worktree sandbox per task |
| Speculate+Vote | Parallel execution across toolchains; best passing result wins |
| Patch+Proof | Auditable artifacts: manifest.json (inputs) + proof.json (outputs) |
| Gate | Quality check that must pass before acceptance |
| Scaffold | Parametric generator with versioned manifest and drift detection |
| Contract Markers | Naming conventions that survive Blender→GLB→Godot export |
| Repair Loop | Failure → escalation issue → retry until pass or human review |

## Configuration

Primary config: `.cyntra/config.yaml`

- Toolchain routing rules (risk, size, tags)
- Gate thresholds
- Speculation settings
- Workcell pool limits

Issue hints:
- `dk_tool_hint`: Force specific toolchain
- `dk_risk`, `dk_size`: Affect routing decisions

## Documentation

- [CLAUDE.md](./CLAUDE.md) — Development guide
- [docs/specs/cyntra_spec.md](./docs/specs/cyntra_spec.md) — Kernel specification
- [docs/specs/fab_spec_summary.md](./docs/specs/fab_spec_summary.md) — Asset pipeline
- [docs/specs/fab-godot-marker-contract.md](./docs/specs/fab-godot-marker-contract.md) — Blender/Godot conventions

## License

MIT
