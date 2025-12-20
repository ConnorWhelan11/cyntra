# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glia Fab is a monorepo combining:

- **Dev Kernel**: Python orchestrator that schedules tasks from Beads (work graph) to isolated Workcells (git worktree sandboxes) running various LLM toolchains
- **Desktop App**: Tauri + React app ("Mission Control") for terminals, runs, and kernel monitoring
- **Fab System**: Deterministic 3D asset pipeline with multi-signal quality gates

## Build & Development Commands

### Desktop App

```bash
cd apps/glia-fab-desktop
npm install
npm run tauri dev          # Development
npm run tauri build        # Production build
```

If Rust toolchain is outdated:

```bash
cd apps/glia-fab-desktop/src-tauri
rustup toolchain install 1.85.0
```

### Dev Kernel

```bash
cd dev-kernel
pip install -e ".[dev]"     # With dev dependencies
pip install -e ".[dev,fab]" # With fab/ML dependencies

# Run kernel
dev-kernel run --once       # Single pass
dev-kernel run --watch      # Continuous
dev-kernel run --once --issue 42  # Specific issue
dev-kernel status           # Show status
```

### Testing & Quality

```bash
cd dev-kernel
pytest -v                   # All tests
pytest tests/unit/ -v       # Unit tests only
pytest -k "test_name"       # Single test
mypy src/dev_kernel         # Type checking
ruff check .                # Linting
```

### Fab CLI Tools

```bash
fab-gate --config fab/gates/car_realism_v001.yaml --asset <path.glb> --output <dir>
fab-render --asset <path.blend> --lookdev fab/lookdev/scenes/car_lookdev_v001.blend
fab-godot --asset <path.glb> --output <dir>
fab-critics --config <critic-config> --renders <dir>
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop App (React + Tauri)                                │
│  Projects, Terminals (PTY), Runs, Kernel Monitor, Viewer    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Dev Kernel (Scheduler → Dispatcher → Verifier)             │
│  Routes tasks via .dev-kernel/config.yaml rules             │
└────────────────────────────┬────────────────────────────────┘
                             │ spawn workcells
┌────────────────────────────▼────────────────────────────────┐
│  Workcell Pool (isolated git worktrees)                     │
│  Codex (gpt-5.2) | Claude (opus) | OpenCode | Crush         │
└────────────────────────────┬────────────────────────────────┘
                             │ Patch + Proof
┌────────────────────────────▼────────────────────────────────┐
│  Quality Gates: pytest, mypy, ruff                          │
└─────────────────────────────────────────────────────────────┘

Fab Pipeline: Generate → Render (Blender) → Critics → Verdict → Repair loop
```

## Key Concepts

- **Beads**: Work graph stored in `.beads/issues.jsonl` - single source of truth for all issues/tasks
- **Workcells**: Isolated git worktrees where LLM agents execute tasks
- **Speculate+Vote**: High-risk tasks run multiple agents in parallel; best passing result wins
- **Gates**: Quality checks that must pass before patches are accepted
- **Routing**: Tasks are routed to toolchains based on risk/size/tags (see `.dev-kernel/config.yaml`)

## Project Structure

```
apps/glia-fab-desktop/    # Tauri desktop app (React frontend, Rust backend)
dev-kernel/               # Python orchestrator
  src/dev_kernel/
    kernel/               # scheduler, dispatcher, runner, verifier
    adapters/             # Codex, Claude, OpenCode, Crush integrations
    workcell/             # Git worktree management
    state/                # Beads integration
    fab/                  # Asset generation and quality checking
    mcp/                  # Model Context Protocol server
fab/                      # Asset pipeline
  gates/                  # YAML quality gate configs
  lookdev/                # Blender scenes and camera rigs
  outora-library/         # 3D asset library
  godot/                  # Godot 4 template
docs/                     # Specifications
```

## Configuration

- `.dev-kernel/config.yaml`: Kernel configuration (toolchain routing, gates, speculation)
- `dk_tool_hint` on issues forces a specific toolchain (codex/claude/opencode/crush)
- `dk_risk` and `dk_size` labels affect routing decisions

## Conventions

- Run outputs go to `.glia-fab/runs/<run_id>/`
- Viewer assets symlinked to `fab/outora-library/viewer/assets/`
- Blender rendering is CPU-only with fixed seeds for determinism
