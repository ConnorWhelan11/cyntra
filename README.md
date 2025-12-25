# Glia Fab

Autonomous development kernel with deterministic 3D asset pipeline.

## Stack

| Component | Tech |
|-----------|------|
| Kernel | Python (orchestrator, workcells, quality gates) |
| Desktop | Tauri + React (Mission Control) |
| Fab Pipeline | Blender + Godot (3D assets) |

## Quick Start

```bash
# Install toolchain manager
curl https://mise.run | sh
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc

# Install tools (Python 3.12, Node 24, Bun 1.1, Rust 1.85)
mise install

# Run
mise run dev      # Desktop app
mise run kernel   # Cyntra kernel
mise run test     # All tests
```

## Project Structure

```
apps/glia-fab-desktop/    # Tauri desktop app
cyntra-kernel/            # Python orchestrator
fab/                      # 3D asset pipeline
  gates/                  # Quality gate configs
  worlds/                 # World definitions
  godot/                  # Godot template
docs/                     # Specifications
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Full development guide
- [docs/cyntra_spec.md](./docs/cyntra_spec.md) - Kernel specification
- [docs/fab_spec_summary.md](./docs/fab_spec_summary.md) - Fab pipeline overview

## License

MIT
