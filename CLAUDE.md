# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glia Fab is a monorepo combining:

- **Cyntra Kernel**: Python orchestrator that schedules tasks from Beads (work graph) to isolated Workcells (git worktree sandboxes) running various LLM toolchains
- **Desktop App**: Tauri + React app ("Mission Control") for terminals, runs, and kernel monitoring
- **Fab System**: Deterministic 3D asset pipeline with multi-signal quality gates

## Toolchain Setup (mise)

This project uses [mise](https://mise.jdx.dev) to manage tool versions. Pinned versions are in `.mise.toml`.

```bash
# Install mise (one-time)
curl https://mise.run | sh
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc

# Install all tools
mise install

# Verify
mise current
# python  3.12.12
# node    24.11.0
# bun     1.1.24
# rust    1.85.1
```

## Build & Development Commands

### Quick Tasks (via mise)

```bash
mise run dev      # Start desktop app in dev mode
mise run kernel   # Run cyntra kernel once
mise run test     # Run all tests
mise run godot-qa # Run Godot headless QA tests + script validation
```

### Desktop App

```bash
cd apps/desktop
bun install
bun run tauri dev          # Development
bun run tauri build        # Production build
```

### Cyntra Kernel (Rust)

The kernel is available as a single Rust binary (no Python required for core functionality):

```bash
# Build the Rust kernel
cd crates && cargo build --release

# Run kernel (Rust binary)
./crates/target/release/cyntra run --once   # Single pass
./crates/target/release/cyntra run --watch  # Continuous
./crates/target/release/cyntra status       # Fast status check
./crates/target/release/cyntra workcell ls  # List workcells
```

### Cyntra Kernel (Python - for fab/ML features)

Some features require Python (fab critics with CLIP/torch, prompt evolution):

```bash
cd kernel
pip install -e ".[dev]"     # With dev dependencies
pip install -e ".[dev,fab]" # With fab/ML dependencies

# Run kernel (Python)
python -m cyntra run --once
```

### Testing & Quality

```bash
cd kernel
pytest -v                   # All tests
pytest tests/unit/ -v       # Unit tests only
pytest -k "test_name"       # Single test
mypy src/cyntra             # Type checking
ruff check .                # Linting
```

### Fab CLI Tools

```bash
fab-gate --config fab/gates/car_realism_v001.yaml --asset <path.glb> --output <dir>
fab-render --asset <path.blend> --lookdev fab/lookdev/scenes/car_lookdev_v001.blend
fab-godot --asset <path.glb> --output <dir>
fab-critics --config <critic-config> --renders <dir>
```

### Fab Pipeline Documentation

- **Marker Contract**: See `docs/fab-godot-marker-contract.md` for the Blender → Godot marker naming conventions (SPAWN*PLAYER, COLLIDER*, TRIGGER*, NAV*, NPC*SPAWN*, etc.)
- **Gate Configs**: YAML files in `fab/gates/` define quality thresholds
- **World Configs**: YAML files in `fab/worlds/*/world.yaml` define pipeline stages

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop App (React + Tauri)                                │
│  Projects, Terminals (PTY), Runs, Kernel Monitor, Viewer    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Cyntra Kernel (Scheduler → Dispatcher → Verifier)          │
│  Routes tasks via .cyntra/config.yaml rules                 │
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
- **Routing**: Tasks are routed to toolchains based on risk/size/tags (see `.cyntra/config.yaml`)

## Project Structure

```
apps/desktop/    # Tauri desktop app (React frontend, Rust backend)
kernel/                  # Python orchestrator
  src/cyntra/
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

- `.cyntra/config.yaml`: Kernel configuration (toolchain routing, gates, speculation)
- `dk_tool_hint` on issues forces a specific toolchain (codex/claude/opencode/crush)
- `dk_risk` and `dk_size` labels affect routing decisions

## Conventions

- Run outputs go to `.cyntra/runs/<run_id>/`
- Viewer assets symlinked to `fab/outora-library/viewer/assets/`
- Blender rendering is CPU-only with fixed seeds for determinism

DISTILLED_AESTHETICS_PROMPT = """
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:

- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
