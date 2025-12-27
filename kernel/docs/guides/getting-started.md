# Getting Started

## Prerequisites

1. **Git** - Required for worktree isolation
2. **Beads** - Must be initialized in your repo
3. **At least one toolchain** - Codex CLI, Claude Code, OpenCode, or Crush
4. **Python 3.11+** - For running the kernel

## Installation

### Install Cyntra Kernel

```bash
# Clone and install
cd your-project
git clone https://github.com/your-org/kernel.git
cd kernel
uv pip install -e .

# Or with pip
pip install -e .
```

### Install Beads

```bash
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

### Install a Toolchain

Choose at least one:

```bash
# Codex CLI
npm i -g @openai/codex

# Claude Code
curl -fsSL https://claude.ai/install.sh | bash

# OpenCode
# See https://opencode.ai/docs

# Crush
brew install charmbracelet/tap/crush
```

## Quick Start

### 1. Initialize Beads

```bash
cd your-project
bd init
```

### 2. Initialize Cyntra

```bash
cyntra init
```

This creates:

- `.cyntra/config.yaml` - Configuration
- `.cyntra/logs/` - Event logs
- `.cyntra/archives/` - Archived workcells
- `.cyntra/state/` - Local kernel state
- `.cyntra/runs/` - Run artifacts (world builds, gates, rollouts)
- `.cyntra/dynamics/` - SQLite DB + reports

### 3. Create Some Issues

```bash
# Create issues in Beads
bd create "Implement user authentication" --priority P1
bd create "Add login endpoint" --priority P1
bd create "Add logout endpoint" --priority P2

# Add dependencies
bd dep add 2 1 --type blocks  # Login blocks auth
bd dep add 3 1 --type blocks  # Logout blocks auth
```

### 4. Run the Kernel

```bash
# Run once to process ready issues
cyntra run --once

# Or watch mode for continuous processing
cyntra run --watch
```

### 5. Check Status

```bash
# See kernel status
cyntra status

# List workcells
cyntra workcells

# View history
cyntra history
```

## Workflow Example

```bash
# 1. Create a task in Beads
bd create "Fix bug in user validation" \
  --priority P1 \
  --description "Users can submit empty names"

# 2. The kernel will:
#    - Detect the issue is ready (no blockers)
#    - Create a workcell (git worktree)
#    - Run Codex/Claude to implement
#    - Run quality gates (test, lint, typecheck)
#    - If passing, prepare for merge
#    - If failing, create fix issue

# 3. Check the result
cyntra status
ls .workcells/

# 4. Review the proof
cat .workcells/wc-*/proof.json | jq .
```

## Configuration

Edit `.cyntra/config.yaml`:

```yaml
version: "1.0"

# Adjust for your project
quality_gates:
  required:
    - name: test
      command: "pytest" # Your test command
    - name: lint
      command: "ruff check ." # Your lint command
    - name: typecheck
      command: "mypy ." # Your typecheck command
```

## Troubleshooting

### Workcell creation fails

```bash
# Check git worktree status
git worktree list

# Clean up stale worktrees
git worktree prune
```

### Gates fail unexpectedly

```bash
# Inspect workcell logs
cat .workcells/wc-*/logs/*.log

# Run gates manually
cd .workcells/wc-*
npm test
```

### Toolchain not found

```bash
# Check toolchain is installed
which codex
which claude

# Verify config path
cat .cyntra/config.yaml | grep path
```

## Next Steps

- Read the [Configuration Guide](./configuration.md) for full options
- See [Architecture Overview](../architecture/overview.md) for design details
- Check [Toolchain Adapters](../architecture/toolchain-adapters.md) for adapter setup
