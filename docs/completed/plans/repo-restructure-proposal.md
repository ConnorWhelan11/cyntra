# Repository Restructure Proposal

**Date**: 2025-12-26
**Status**: Draft

---

## Executive Summary

The Cyntra repository has grown organically and now contains significant structural debt. This document analyzes the current state and proposes a cleaner architecture.

### Key Metrics (Current State)

| Directory     | Size  | Purpose                                  |
| ------------- | ----- | ---------------------------------------- |
| `.cyntra/`    | 23GB  | Runtime data, archives, venvs, logs      |
| `.workcells/` | 22GB  | Git worktrees for LLM agents             |
| `fab/`        | 5.1GB | Asset pipeline (mostly binary assets)    |
| `apps/`       | 2.9GB | Desktop app + Immersa (has node_modules) |
| `crates/`     | 547MB | Rust binaries (has target/)              |
| `kernel/`     | 141MB | Python orchestrator (~56k LOC Python)    |

**Total repo footprint: ~54GB** (most is runtime/build artifacts that should be gitignored)

---

## Issues Identified

### 1. Massive Runtime Data in Repo Root

**Problem**: `.cyntra/` (23GB) and `.workcells/` (22GB) contain runtime data that shouldn't be version controlled.

```
.cyntra/
├── archives/       # Archived workcell logs (should be external)
├── benches/        # Benchmark run data (should be external)
├── dynamics/       # Runtime state
├── memory/         # Memory system data
├── models/         # ML model weights
├── venv/           # Python virtualenv (should never be tracked)
└── logs/           # Runtime logs
```

**Impact**: Clone time, repo size, git performance all suffer.

---

### 2. Fragmented Python Codebase

**Problem**: Python code is spread across multiple locations:

| Location                        | LOC  | Purpose              |
| ------------------------------- | ---- | -------------------- |
| `kernel/src/cyntra/`            | ~56k | Main kernel          |
| `kernel/src/cyntra/skills/`     | ~1MB | Skill scripts + YAML |
| `kernel/benchmarks/`            | ~100 | Benchmark code       |
| `kernel/src/cyntra/fab/outora/` | ~500 | Asset helper code    |

**Confusion Points**:

- `kernel/src/cyntra/skills/` vs `.claude/skills/` (different purposes, same name)
- `kernel/src/cyntra/benches/` vs `kernel/benchmarks/`
- Multiple `pyproject.toml` files with unclear relationships

---

### 3. Duplicate Directory Naming

```
kernel/src/cyntra/skills/      # Kernel skills (Python scripts)
.claude/skills/                # Claude Code skills (markdown prompts)

kernel/src/cyntra/prompts/   # Runtime prompt templates
prompts/                            # ???

docs/                          # Main documentation
kernel/docs/            # Kernel-specific docs (duplicates?)
```

---

### 4. Mixed Build Systems Without Orchestration

| System     | Location                | Purpose          |
| ---------- | ----------------------- | ---------------- |
| Bun/npm    | `package.json` (root)   | JS workspace     |
| Cargo      | `crates/Cargo.toml`     | Rust workspace   |
| UV         | `pyproject.toml` (root) | Python workspace |
| Poetry/pip | `kernel/pyproject.toml` | Kernel deps      |

No unified `make`, `just`, or `mise run` commands to orchestrate builds.

---

### 5. Fab Asset Pipeline Sprawl

```
fab/
├── ci/              # CI scripts (1 file)
├── gates/           # Gate configs
├── godot/           # Symlink to vault
├── ideas/           # Unused?
├── lookdev/         # Blender scenes
├── assets/          # Assets + viewer
├── regression/      # Test fixtures
├── templates/       # Asset templates
├── test_assets/     # More test assets
├── vault/           # Templates, scripts, catalog
├── workflows/       # ComfyUI workflows
└── worlds/          # World configs
```

**Issues**:

- `outora-library/` is both an asset folder AND a Python package
- `godot/template` symlinks to `vault/godot/templates/...` (confusing)
- Multiple template locations (`templates/`, `vault/`, `lookdev/`)

---

### 6. Immersa Is a Separate Project

```
apps/immersa/
├── .git/            # HAS ITS OWN GIT REPO!
├── .github/
├── package.json
└── ...
```

**Impact**: This is a git submodule or should be a separate repository entirely.

---

### 7. Configuration File Sprawl

Root directory has 15+ config files:

```
.mcp.json
.mise.toml
.pre-commit-config.yaml
.prettierignore
.prettierrc
bunfig.toml
pyproject.toml
package.json
CLAUDE.md
AGENTS.md
README.md
READEME.md           # Typo!
...
```

---

### 8. Scattered Test Code

```
kernel/tests/           # Main kernel tests
kernel/src/cyntra/skills/tests/ # Skill tests
apps/desktop/src/test/ # Desktop app tests
kernel/benchmarks/code_smoke_v1/         # Smoke test benchmark
```

---

### 9. Unclear/Orphaned Directories

| Directory           | Size    | Status               |
| ------------------- | ------- | -------------------- |
| `universes/medica/` | Small   | Purpose unclear      |
| `train/URM/`        | Unknown | Training data?       |
| `tools/bin/`        | Small   | Contains what?       |
| `coverage/`         | Empty   | Should be gitignored |
| `tmp/`              | Small   | Should be gitignored |

---

## Proposed Structure

```
glia-fab/
│
├── .claude/                      # Claude Code config (keep as-is)
│   ├── agents/
│   ├── settings.json
│   ├── settings.local.json       # gitignored
│   └── skills/                   # USER-FACING Claude skills
│
├── .github/
│   └── workflows/
│
├── apps/
│   └── desktop/                  # Renamed from glia-fab-desktop
│       ├── src/                  # React frontend
│       ├── src-tauri/            # Rust backend
│       ├── package.json
│       └── ...
│
├── crates/                       # Rust workspace
│   ├── Cargo.toml                # Workspace root
│   ├── cyntra-cli/
│   └── cyntra-core/
│
├── docs/
│   ├── README.md                 # Docs index
│   ├── architecture/             # Architecture docs
│   ├── adr/                      # Decision records
│   ├── guides/                   # How-to guides
│   ├── plans/                    # Implementation plans
│   └── specs/                    # Specifications
│
├── fab/
│   ├── assets/                   # Merged from outora-library
│   │   ├── blender/              # .blend files
│   │   ├── models/               # .glb exports
│   │   └── textures/
│   ├── gates/                    # Quality gate YAML
│   ├── godot/                    # Godot template (no symlink)
│   ├── lookdev/                  # Lookdev scenes
│   ├── vault/                    # Validated templates
│   ├── workflows/                # ComfyUI workflows
│   └── worlds/                   # World configurations
│
├── kernel/                       # Python Cyntra package
│   ├── src/cyntra/
│   │   ├── adapters/
│   │   ├── cli.py
│   │   ├── dynamics/
│   │   ├── evolve/
│   │   ├── fab/
│   │   ├── gates/
│   │   ├── kernel/
│   │   ├── mcp/
│   │   ├── memory/
│   │   ├── planner/
│   │   ├── skills/               # KERNEL skills (moved from skills/)
│   │   ├── state/
│   │   ├── universe/
│   │   └── workcell/
│   ├── tests/
│   ├── benchmarks/               # Moved from benches/
│   └── pyproject.toml
│
├── packages/
│   └── ui/                       # Shared UI components
│
├── scripts/                      # Dev/build scripts
│   ├── setup.sh
│   ├── dev.sh
│   ├── build.sh
│   └── clean.sh
│
├── .beads/                       # Work graph (small, tracked)
│
├── .gitignore                    # Improved
├── .mise.toml                    # Tool versions
├── package.json                  # Bun workspace root
├── pyproject.toml                # UV workspace root
├── Cargo.toml                    # (optional: move from crates/)
│
├── CLAUDE.md                     # Claude Code instructions
└── README.md                     # Project overview
```

---

## Migration Steps

### Phase 1: Cleanup (No Code Changes)

1. **Fix .gitignore** - Add all runtime directories

   ```gitignore
   # Runtime data
   .cyntra/archives/
   .cyntra/benches/
   .cyntra/venv/
   .cyntra/logs/
   .cyntra/dynamics/
   .cyntra/memory/
   .cyntra/models/
   .workcells/
   .glia-fab/
   tmp/
   coverage/
   ```

2. **Delete typo file**: `rm READEME.md`

3. **Clean up Immersa**: Either make it a proper submodule or remove it

### Phase 2: Directory Moves

1. **Rename `kernel/` → `kernel/`**
   - Update all imports
   - Update `pyproject.toml` workspace

2. **Rename `apps/glia-fab-desktop/` → `apps/desktop/`**
   - Update `package.json` workspace

3. **Merge `skills/` → `kernel/src/cyntra/skills/`**
   - These are kernel-internal skills, not Claude Code skills

4. **Merge `benches/` → `kernel/benchmarks/`**

5. **Flatten `fab/outora-library/`**:

   ```
   fab/outora-library/blender/ → fab/assets/blender/
   fab/outora-library/assets/  → fab/assets/{models,textures,hdris,room1107}/
   fab/outora-library/src/     → kernel/src/cyntra/fab/outora/
   ```

6. **Remove `fab/godot/template` symlink**
   - Copy actual template to `fab/godot/`

### Phase 3: Documentation Consolidation

1. Move specs from `docs/` root to `docs/specs/`
2. Move ADRs to `docs/adr/`
3. Move guides to `docs/guides/`
4. Delete duplicate READMEs after consolidating

### Phase 4: Config Consolidation

1. Keep essential configs at root (`.mise.toml`, `package.json`, `pyproject.toml`)
2. Move others to apps/packages where they belong
3. Create `scripts/` for common dev tasks

---

## Risks & Mitigations

| Risk                      | Mitigation                                          |
| ------------------------- | --------------------------------------------------- |
| Breaking imports          | Use `git grep` to find all references before moving |
| CI/CD breaks              | Update workflows in same PR                         |
| Developer confusion       | Clear migration guide + deprecation period          |
| Large Git history rewrite | Don't rewrite history; just move files forward      |

---

## Decision Points

1. **Keep `crates/` vs move `Cargo.toml` to root?**
   - Recommendation: Keep in `crates/` (Tauri also has Cargo.toml)

2. **Keep `universes/` and `train/`?**
   - Need to understand their purpose first

3. **What to do with Immersa?**
   - Options: Remove, submodule, or keep as-is

4. **Merge kernel skills with .claude skills?**
   - Recommendation: Keep separate (different purposes)

---

## Next Steps

1. [ ] Review this proposal
2. [ ] Decide on Immersa fate
3. [ ] Create backup of current state
4. [ ] Execute Phase 1 (cleanup)
5. [ ] Execute Phase 2-4 incrementally
