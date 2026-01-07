# Cyntra

Autonomous development kernel with deterministic multi-agent orchestration.

## Overview

Cyntra is a self-healing development system that schedules work from a git-based task graph to isolated sandboxes, routes tasks to competing LLM toolchains, and verifies results through quality gates. Failed attempts auto-escalate with full audit trails. Every execution produces Patch+Proof artifacts.

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
└─────────────────────────────────────────────────────────────┘
```

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
| Hunyuan 3D | v2.0 | Text/image-to-mesh via ComfyUI |
| SDXL | Stability | Texture generation |
| Flux | Black Forest Labs | Inpainting and refinement |

Orchestrated through ComfyUI with deterministic seeds for reproducibility.

### Game AI

Hierarchical vision-to-action system for automated playtesting:

| Component | Size | Rate | Role |
|-----------|------|------|------|
| Monet | 7B MLLM | 2 Hz | High-level planner |
| NitroGen | 500M | 60 Hz | Frame-to-action executor |

Deployed on RunPod (H100/A100) with ZeroMQ communication.

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

# Tests
mise run test
```

## Project Structure

```
apps/desktop/        Tauri desktop application
kernel/              Python orchestrator
  src/cyntra/
    kernel/          Scheduler, dispatcher, verifier
    adapters/        LLM toolchain integrations
    workcell/        Git worktree management
    fab/             Asset pipeline, critics, ComfyUI
    memory/          Vector storage, context injection
    indexing/        CocoIndex integration
crates/              Rust workspace
  cyntra-core/       Core kernel (Rust)
  cyntra-cli/        CLI binary
  ai-*/              Game AI framework (GOAP, HTN, BT, nav, crowd)
fab/                 Asset pipeline
  gates/             Quality gate configs (YAML)
  workflows/         ComfyUI workflow definitions
  lookdev/           Blender scenes, camera rigs
research/            Experimental projects
  backbay-imperium/  4X game engine (Godot + Rust)
  monet-nitrogen/    Hierarchical game AI
logos/               Formal reasoning (Lean 4)
docs/                Specifications
```

## Key Concepts

| Term | Definition |
|------|------------|
| Beads | Git-based work graph in `.beads/issues.jsonl` |
| Workcell | Isolated git worktree sandbox per task |
| Speculate+Vote | Parallel execution across toolchains; best passing result wins |
| Patch+Proof | Auditable artifacts: manifest.json (inputs) + proof.json (outputs) |
| Gate | Quality check that must pass before acceptance |
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
- [docs/cyntra_spec.md](./docs/cyntra_spec.md) — Kernel specification
- [docs/fab_spec_summary.md](./docs/fab_spec_summary.md) — Asset pipeline
- [docs/fab-godot-marker-contract.md](./docs/fab-godot-marker-contract.md) — Blender/Godot conventions

## License

MIT
