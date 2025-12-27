# Cyntra Universe Development Environment (Draft)

This document defines the **Universe** abstraction: a top-level container that groups **Worlds**, **Agents**, **Swarms**, and the **Memory Substrate** into a coherent, reproducible development environment.

Status: **Draft / proposed**. This spec is designed to layer on top of the existing Cyntra + Fab World system rather than replace it.

Related docs:

- `docs/cyntra_spec.md`
- `docs/fab-world-system.md`
- `docs/fab-world-schema.md`
- `docs/telemetry.md`
- `docs/universe-evolution-quickstart.md`

---

## Goals

- Provide a **single operational namespace** for multiple worlds (Fab, codebases, simulations, datasets).
- Make multi-agent work **explicit and repeatable**: swarm patterns have contracts, stop conditions, and budgets.
- Treat quality as **first-class, machine-readable**: gates produce the canonical signals for selection and evolution.
- Accumulate **provenance-safe memory** from runs (patterns, Pareto frontiers, dynamics) without “vibes-based” drift.

## Non-goals

- A physics engine or simulation runtime. A Universe organizes _pipelines_, not real-time simulation loops.
- A replacement for Beads, workcells, Patch+Proof, or Fab World. Universe composes these.
- A UI-first effort. Mission Control should follow stable artifact contracts.

---

## Core Concepts (Glossary)

### Universe

A Universe is a named container that defines:

- **World registry**: which worlds exist and where their definitions live.
- **Policy overlays**: routing, budgets, determinism requirements, and defaults.
- **Swarm catalog**: allowed swarm patterns and their parameters.
- **Agent catalog**: agent profiles (toolchains, constraints, and roles).
- **Memory substrate**: where learned patterns/frontiers/dynamics are stored and how they’re updated.

In short: **Universe = registry + policy + memory + defaults**.

### World

A World is a bounded pipeline definition that produces a **Phenotype** (asset/code/data) from inputs + config, and is evaluated by quality **Gates**.

For Fab Worlds, the concrete definition is `fab/worlds/<world_id>/world.yaml` (see `docs/fab-world-schema.md`).

### Run

One execution of a world pipeline at a specific seed/config/toolchain set, producing verifiable artifacts:

- build outputs (phenotype + intermediates)
- logs and telemetry
- gate reports + a final verdict
- manifests for provenance (hashes, tool versions)

### Generation

A lineage unit in an evolution history. A generation typically contains:

- one or more candidate runs
- selection context (objective function, constraints)
- a chosen “winner” (or Pareto update)
- genome/config deltas relative to a parent

### Agent

An executable worker profile (LLM or deterministic toolchain) with:

- toolchain/model identity
- allowed tools / sandbox policy
- time/cost budgets
- role (builder/critic/architect/repairer/etc.)

Agents operate inside **workcells** (isolated git worktrees).

### Swarm

A coordination policy for a group of agents over a goal. Swarms define:

- participants (roles + counts)
- execution topology (parallel-compete, serial-handoff, coordinator-workers)
- merge strategy (how outputs combine)
- stop conditions (success/failure/budget exhaustion)

### Gates

Deterministic quality checks that emit **machine-readable** metrics and pass/fail verdicts.

For Fab: gate configs live in `fab/gates/*.yaml` and are executed via Cyntra Fab tooling (see `docs/fab-world-system.md`).

### Memory Substrate

Derived knowledge built from completed runs, always with provenance. Core components:

- **Beads graph** (work state): `.beads/issues.jsonl`, `.beads/deps.jsonl`
- **Pattern library** (what tends to work): extracted from successful runs
- **Pareto frontiers** (trade-off surfaces): nondominated sets over multi-metric objectives
- **Dynamics** (behavioral control): observations → policy adjustments with confidence and evidence

---

## Mapping to the Current Repo (What Already Exists)

This Universe spec intentionally aligns with current primitives:

- **Beads**: `.beads/issues.jsonl` (single source of truth for tasks)
- **Kernel config/routing**: `.cyntra/config.yaml` (toolchains, routing, speculation, gates)
- **Workcells**: `.workcells/` (isolated git worktrees)
- **Runs**: `.cyntra/runs/<run_id>/` (run artifacts)
- **Fab Worlds**: `fab/worlds/<world_id>/world.yaml` + stage scripts
- **Schemas**: `kernel/schemas/**` (Fab run manifest, gate verdict, critic reports, Patch+Proof)
- **Telemetry**: `.workcells/*/telemetry.jsonl` (see `docs/telemetry.md`)
- **Memory/Dynamics stores**: `.cyntra/memory/`, `.cyntra/dynamics/`, `.cyntra/sleeptime/`

Universe is primarily a **namespacing + policy layer** on top of those building blocks.

---

## On-Disk Layout (Proposed)

### Git-tracked Universe definitions

Universe definitions should be tracked in git (human-authored config, reviewable changes):

```
universes/<universe_id>/
├── universe.yaml          # Registry + policy + defaults (required)
├── agents.yaml            # Agent catalog (optional; may be in universe.yaml)
├── swarms.yaml            # Swarm catalog (optional; may be in universe.yaml)
├── objectives.yaml        # Named objectives/fitness expressions (optional)
└── README.md              # Universe-specific documentation (optional)
```

### Runtime Universe state (gitignored)

Universe runtime state should live under `.cyntra/` (generated artifacts, indices, caches):

```
.cyntra/
├── runs/<run_id>/...                  # Existing run artifact layout
├── memory/                            # Existing memory store (e.g. SQLite)
├── dynamics/                          # Existing dynamics store (e.g. SQLite)
└── universes/<universe_id>/           # Universe-scoped indices (new)
    ├── index/
    │   ├── runs.jsonl                 # run_id + pointers + summary fields
    │   └── generations.jsonl          # lineage index (world_id, objective_id, parent)
    ├── frontiers/
    │   └── <world_id>.json            # Pareto sets by world/objective
    └── patterns/
        └── patterns.jsonl             # extracted patterns w/ evidence run_ids
```

Note: the _authoritative_ run artifacts remain in `.cyntra/runs/`. Universe state references them by `run_id`.

---

## Universe Configuration Schema (Proposed)

### `universes/<universe_id>/universe.yaml`

Minimal example:

```yaml
schema_version: "1.0"
universe_id: medica
name: Medica
description: >
  Medical + Fab asset universe (Outora library, training environments).

worlds:
  - world_id: outora_library
    world_kind: fab_world
    path: fab/worlds/outora_library/world.yaml
    enabled: true
    tags: ["fab", "interior_architecture"]

policies:
  determinism:
    enforce_cpu_only: true
    pythonhashseed: 0
  budgets:
    max_concurrent_workcells: 3
    max_run_minutes: 120
  routing_overrides: []

defaults:
  swarm_id: speculate_vote
  objective_id: realism_perf_v1
```

Field definitions (v1.0 draft):

- `schema_version` (required): string, currently `"1.0"`
- `universe_id` (required): string, `^[a-z][a-z0-9_]*$`
- `name` (optional): string
- `description` (optional): string
- `worlds` (required): array of world references
  - `world_id` (required): string, should match the world’s internal `world_id` where applicable
  - `world_kind` (required): enum `{fab_world, codebase, dataset, simulation}`
  - `path` (required): path to the world definition entry file (e.g. `.../world.yaml`)
  - `enabled` (optional): boolean, default `true`
  - `tags` (optional): string[]
- `policies` (optional): object
  - `determinism` (optional): object
    - `enforce_cpu_only` (optional): boolean (Fab default true)
    - `pythonhashseed` (optional): integer (recommend `0`)
  - `budgets` (optional): object
    - `max_concurrent_workcells` (optional): integer
    - `max_run_minutes` (optional): integer
  - `routing_overrides` (optional): array of routing rules, applied before `.cyntra/config.yaml` defaults
- `defaults` (optional): object
  - `swarm_id` (optional): string (refers to swarm catalog)
  - `objective_id` (optional): string (refers to objectives catalog)

### Agent catalog (optional file)

Example `universes/<universe_id>/agents.yaml`:

```yaml
schema_version: "1.0"
agents:
  architect:
    toolchain: claude
    default_model: claude-opus-4-5-20251101
    role: architect
    budgets:
      timeout_minutes: 60

  builder:
    toolchain: codex
    default_model: gpt-5.2
    role: builder
    budgets:
      timeout_minutes: 60

  critic:
    toolchain: claude
    default_model: claude-opus-4-5-20251101
    role: critic
    budgets:
      timeout_minutes: 30
```

Notes:

- Toolchain names should align with `.cyntra/config.yaml` (`codex`, `claude`, `opencode`, `crush`, `fab-world`).
- “Agent memory” is not magic; it is access to Universe memory indices and suggested actions, still validated by gates.

### Swarm catalog (optional file)

Example `universes/<universe_id>/swarms.yaml`:

```yaml
schema_version: "1.0"
swarms:
  speculate_vote:
    pattern: parallel_compete
    participants:
      - role: builder
        count: 3
      - role: critic
        count: 1
    selection:
      mode: gate_score_max
      require_all_gates_pass: true
    stop_conditions:
      max_candidates: 3
      max_minutes: 90

  assembly_line:
    pattern: serial_handoff
    stages:
      - role: architect
      - role: builder
      - role: critic
      - role: repairer
    stop_conditions:
      max_iterations: 3
      max_minutes: 120
```

---

## Execution Contract (Universe → Runs)

Universe operations should produce consistent, replayable artifacts. At minimum, each run should have:

- **Provenance**: a manifest with tool versions and content hashes (Fab: `kernel/schemas/fab/run-manifest.schema.json`)
- **Quality**: gate verdict + critic reports (Fab: `kernel/schemas/fab/gate-verdict.schema.json`)
- **Evidence**: logs, renders, exports, test output

### Universe-scoped run context (proposed additive file)

To avoid breaking existing schemas, Universe metadata can be recorded in an additive context file in the run directory:

`.cyntra/runs/<run_id>/context.json`

```json
{
  "schema_version": "1.0",
  "universe_id": "medica",
  "world_id": "outora_library",
  "objective_id": "realism_perf_v1",
  "swarm_id": "speculate_vote",
  "issue_id": "42"
}
```

This file acts as a join key across run artifacts, Beads issues, and Universe indices.

---

## Memory Substrate Contract (Provenance + Hygiene)

### Pattern library (recommended structure)

Patterns are suggestions backed by evidence. A minimal record:

```yaml
pattern_id: test_first_refactor
domain: code/refactoring
conditions:
  has_tests: true
  file_count: ">10"
recommended_action: "Write/extend tests first, then refactor behind them."
success_rate: 0.87
confidence: 0.80
evidence_runs: ["run_..."]
last_updated_at: "2025-12-21T00:00:00Z"
```

Hygiene rules:

- No pattern without `evidence_runs`.
- Confidence decays unless reinforced by new successful evidence.
- Patterns never bypass gates; they only propose actions and priors.

### Pareto frontiers

Frontiers are maintained per `(universe_id, world_id, objective_id)` and contain nondominated points over declared metrics.

Minimum frontier record:

```json
{
  "schema_version": "1.0",
  "universe_id": "medica",
  "world_id": "outora_library",
  "objective_id": "realism_perf_v1",
  "metrics": ["realism", "performance_fps", "file_size_mb"],
  "points": [
    {
      "run_id": "run_...",
      "values": { "realism": 0.88, "performance_fps": 62, "file_size_mb": 18.4 }
    }
  ]
}
```

### Dynamics (behavioral control)

Dynamics capture stable observations about agent/system behavior and map them to policy adjustments.

Example:

```yaml
observation: "3+ repair iterations rarely succeed on geometry failures."
policy_change: "After 2 failed repair loops, escalate to architect or human."
confidence: 0.92
evidence_runs: ["run_..."]
```

---

## Evolution Loop (Universe-level)

Universe evolution is the repeated application of:

1. **Generate**: propose genome/config deltas (via swarm or deterministic search)
2. **Evaluate**: execute the world pipeline and run gates
3. **Select**: update best candidate(s) or Pareto frontier
4. **Mutate**: adjust genome distribution based on results and constraints

ASCII overview:

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Generate │ → │ Evaluate │ → │  Select  │ → │  Mutate  │
│ (Swarm)  │   │ (Gates)  │   │ (Obj/PF) │   │ (Genome) │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
      ↑                                           │
      └───────────────────────────────────────────┘
```

For Fab Worlds, the “genome” can start as a minimal set of parameters already present in `world.yaml` (see `docs/fab-world-schema.md`), then expand into a dedicated `genome.yaml` once mutation operators are defined.

---

## CLI Surface (Proposed)

Universe-level (namespace + policy):

```bash
cyntra universe init medica --template=medica
cyntra universe status medica
cyntra universe ls
```

World execution (existing concepts, Universe-scoped defaults):

```bash
cyntra world build --universe medica --world fab/worlds/outora_library --seed 42
cyntra evolve --universe medica --world outora_library --generations 10 --objective realism_perf_v1
```

Memory:

```bash
cyntra memory search --universe medica "gothic arch"
cyntra memory consolidate --universe medica
```

Note: command names are illustrative; actual CLI should remain consistent with `kernel/src/cyntra/cli.py`.

---

## Mission Control (UI) Scope Cut

Universe UI should follow artifacts. A minimal UI set:

1. Universe picker + world list
2. Run browser (filter by world, objective, gate verdict)
3. Run detail view (artifacts + logs + metrics + lineage)
4. Evolution view (frontier + generation history) once frontiers exist

Defer “deep” features (interactive dynamics tuning, pattern editing) until the memory substrate has stable semantics and enough data.

---

## Milestones (Acceptance Criteria)

### M0: Universe definitions (config + registry)

- `universes/<id>/universe.yaml` exists and can be parsed/validated.
- Worlds can be resolved by `path` and validated using their existing schemas.
- A Universe can be selected as context for `cyntra` commands (even if only as a flag).

### M1: Universe-scoped indexing

- Runs produce a `context.json` (or equivalent) connecting `universe_id` ↔ `world_id` ↔ `issue_id`.
- `.cyntra/universes/<id>/index/runs.jsonl` can be rebuilt from `.cyntra/runs/`.

### M2: Memory substrate (provenance-safe)

- Pattern extraction emits records with `evidence_runs`.
- Frontier tracking produces nondominated sets per world/objective.

### M3: Evolution (v1)

- Mutation operators exist for a declared genome schema.
- Selection updates best candidate(s) and/or frontier deterministically under pinned seeds.

---

## Appendix: Naming Conventions

- `universe_id`: `^[a-z][a-z0-9_]*$` (snake_case)
- `world_id`: existing `world.yaml` conventions (see `docs/fab-world-schema.md`)
- `objective_id`, `swarm_id`: snake_case
