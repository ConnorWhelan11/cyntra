# Universe (Registry + Policy + Memory) Implementation Plan

Implementation plan for the proposed **Universe** abstraction in `docs/universe.md`.

Status: **Draft** (intended to be executed incrementally via milestones M0–M3).

---

## Overview

The Universe layer adds a **single operational namespace** over existing Cyntra primitives:

- **Registry**: which Worlds exist and where they live
- **Policy overlays**: determinism, budgets, routing overrides, defaults
- **Swarm + Agent catalogs**: explicit, reusable coordination patterns and agent profiles
- **Memory substrate**: provenance-safe patterns, Pareto frontiers, and dynamics-driven policy updates

Key constraint from the spec: this must be **additive**—it should not replace Beads, workcells, Patch+Proof, or Fab World; it composes them.

---

## Principles / Design Constraints

1. **Additive artifacts**: Universe metadata is stored in `context.json` (and universe indices) rather than rewriting existing run schemas.
2. **Schema-first**: Universe config + runtime records are validated with schemas; avoid “free-form” JSON that becomes unmaintainable.
3. **Rebuildable indices**: anything in `.cyntra/universes/<id>/` can be regenerated from `.cyntra/runs/` + git-tracked universe config.
4. **Evidence-based memory**: patterns/frontiers/dynamics require explicit `evidence_runs` and never bypass gates.
5. **Determinism defaults**: Universe policies can _tighten_ determinism (CPU-only, fixed seeds), but should not silently loosen it.

---

## Current State (Repo Reality Check)

Already exists:

- Beads work graph: `.beads/issues.jsonl`
- Kernel routing + gates: `.cyntra/config.yaml`
- Workcells: `.workcells/`
- Runs: `.cyntra/runs/<run_id>/` (contains `run_meta.json`, etc.)
- Memory/dynamics plumbing: `kernel/src/cyntra/memory/`, `kernel/src/cyntra/dynamics/`, `kernel/src/cyntra/kernel/memory_integration.py`
- Frontier + evolution-related schemas: `kernel/schemas/cyntra/frontier.schema.json`, `kernel/schemas/cyntra/evolve_run.schema.json`

Missing (Universe-specific):

- No `universes/<id>/universe.yaml` registry + policy config
- No Universe-aware CLI surface (`cyntra universe ...`, `--universe` flags)
- No run-level `context.json` join key
- No `.cyntra/universes/<id>/index/runs.jsonl` builder / rebuilder
- No Universe-scoped pattern/frontier stores tied to run evidence

---

## Milestone Map (From `docs/universe.md`)

### M0: Universe definitions (config + registry)

- Git-tracked `universes/<id>/universe.yaml` with validation
- Worlds resolved by path and validated with existing schemas where possible
- Universe context selectable from CLI (even if only as a flag)

### M1: Universe-scoped indexing

- Runs produce `.cyntra/runs/<run_id>/context.json`
- `.cyntra/universes/<id>/index/runs.jsonl` rebuildable from `.cyntra/runs/`

### M2: Memory substrate (provenance-safe)

- Patterns emitted with `evidence_runs`
- Frontiers maintained per `(universe_id, world_id, objective_id)`

### M3: Evolution (v1)

- Mutation operators exist for a declared genome schema / parameter surface
- Selection updates best candidate(s) and/or frontier deterministically

---

## Phase 0 — Foundations (Schemas + Config Loader) (M0 prerequisite)

### 0.1 Add git-tracked Universe config layout

Create:

```
universes/<universe_id>/
├── universe.yaml
├── agents.yaml        # optional
├── swarms.yaml        # optional
└── objectives.yaml    # optional
```

Include at least one template universe (e.g. `universes/medica/`) matching the minimal example in `docs/universe.md`.

### 0.2 Add schemas for Universe config + runtime records

Add schemas under `kernel/schemas/cyntra/` (names illustrative):

- `universe.schema.json` (validates `universes/<id>/universe.yaml`)
- `agents.schema.json` (validates `universes/<id>/agents.yaml`)
- `swarms.schema.json` (validates `universes/<id>/swarms.yaml`)
- `objectives.schema.json` (validates `universes/<id>/objectives.yaml`)
- `run_context.schema.json` (validates `.cyntra/runs/<run_id>/context.json`)

Keep these schemas minimal and versioned; the goal is to stabilize required fields early:

- `universe_id`, `worlds[*].world_id`, `worlds[*].world_kind`, `worlds[*].path`
- `policies.determinism`, `policies.budgets`, `policies.routing_overrides`
- `defaults.{swarm_id, objective_id}`

### 0.3 Implement Universe config loader + resolver

Add `kernel/src/cyntra/universe/`:

- `config.py`: load YAML(s), validate, resolve world paths relative to repo root
- `models.py`: typed models (dataclasses / pydantic) for Universe/WorldRef/Policies
- `validate.py`: schema validation helpers (reusing existing schema tooling)

Key behaviors:

- `load_universe(universe_id, repo_root)` reads `universes/<id>/universe.yaml` plus optional `agents.yaml`, `swarms.yaml`, `objectives.yaml`.
- `resolve_world(world_ref)` returns a canonical `WorldDefinition` including absolute file paths.
- Validate `world_kind == fab_world` by loading the referenced `world.yaml` with the existing Fab World schema (do not revalidate Fab fields in Universe).

Deliverable: a small, importable “UniverseContext” object usable by CLI and kernel.

---

## Phase 1 — CLI Surface + Universe Context Plumbing (M0)

### 1.1 Add `cyntra universe` commands

Extend `kernel/src/cyntra/cli.py` with a `universe` command group:

- `cyntra universe ls` — list available universes from `universes/*/universe.yaml`
- `cyntra universe validate <id>` — validate YAML + referenced world paths/schemas
- `cyntra universe status <id>` — show worlds enabled, defaults, policy summary
- `cyntra universe init <id> --template <name>` — copy a template universe skeleton

### 1.2 Add `--universe` flag to relevant commands

Implement a consistent way to pass Universe context into execution:

- `cyntra run ... --universe <id>` (kernel-run loop)
- `cyntra world build ... --universe <id> --world <world_id|path> ...` (when world execution exists)
- `cyntra evolve ... --universe <id> ...` (Phase 4)
- `cyntra memory ... --universe <id> ...` (Phase 3)

Optional: support default Universe selection via env var (e.g. `CYNTRA_UNIVERSE=medica`).

### 1.3 Apply Universe policies at runtime

Where policies should apply (initial scope):

- **Determinism**:
  - enforce CPU-only for Fab (and any Blender invocations) when configured
  - set `PYTHONHASHSEED` or equivalent process settings when possible
- **Budgets**:
  - cap concurrent workcells (tie into existing scheduler/runner concurrency)
  - cap run minutes (already conceptually supported via timeouts; expose as policy default)
- **Routing overrides**:
  - overlay Universe routing rules ahead of `.cyntra/config.yaml` selection logic

Deliverable: Universe selection changes behavior only via explicit, inspectable policy application.

---

## Phase 2 — Run Context + Universe Indices (M1)

### 2.1 Add `context.json` to run artifacts

Write an additive join-key file to each run directory when Universe context exists:

`.cyntra/runs/<run_id>/context.json`

Fields (from spec, allow nulls when not applicable):

- `schema_version: "1.0"`
- `universe_id`
- `world_id`
- `objective_id`
- `swarm_id`
- `issue_id`

Implementation notes:

- Do **not** mutate existing `run_meta.json` or Fab run-manifest schemas.
- For non-world runs (e.g. generic kernel issue execution), set `world_id` null and still record `universe_id` + `issue_id`.

### 2.2 Build a rebuildable Universe run index

Add `kernel/src/cyntra/universe/index.py` to generate:

`.cyntra/universes/<universe_id>/index/runs.jsonl`

Index record should include (at minimum):

- `run_id`, `started_ms`, `label` (from `run_meta.json`)
- `universe_id` + context fields (from `context.json` when present)
- pointers to known artifacts (paths relative to `.cyntra/runs/<run_id>/`)
- gate summary (if Fab: verdict + key metrics)

Add CLI:

- `cyntra universe index rebuild <id>` (full rebuild by scanning `.cyntra/runs/`)
- `cyntra universe index update <id> --run-id <run_id>` (incremental append/update)

### 2.3 Add generation/lineage indexing hooks (lightweight)

Create:

`.cyntra/universes/<universe_id>/index/generations.jsonl`

Populate from evolve/evolution outputs (existing and future):

- Parse `.cyntra/runs/evolve_loop_*` directories if they contain structured summaries.
- When Phase 4 lands, write generation records directly during evolution.

Deliverable: Universe indices can power Mission Control views without reading every run directory on-demand.

---

## Phase 3 — Memory Substrate (Patterns + Frontiers + Dynamics) (M2)

This phase should build on the existing memory/dynamics plumbing and the plan in
`docs/plans/memory-dynamics-integration.md` (Universe simply scopes and indexes the results).

### 3.1 Universe-scoped pattern store

Target file:

`.cyntra/universes/<universe_id>/patterns/patterns.jsonl`

Requirements (from spec hygiene rules):

- every record must include `evidence_runs`
- confidence decays over time unless reinforced by new successful evidence
- patterns never bypass gates; they only provide priors/recommendations

Implementation approach:

- Extend the existing observation + consolidation pipeline to attach `universe_id/world_id/objective_id` from `context.json`.
- Emit patterns as derived artifacts, not hand-edited truth; rebuildable from the canonical memory DB + run evidence.

### 3.2 Universe-scoped Pareto frontiers

Target file:

`.cyntra/universes/<universe_id>/frontiers/<world_id>.json`

Maintain per `(universe_id, world_id, objective_id)`:

- define objective metrics in `objectives.yaml`
- update nondominated sets after every successful evaluation batch

Schema decision:

- Option A: extend `kernel/schemas/cyntra/frontier.schema.json` to include Universe/world metadata.
- Option B: introduce a new `universe_frontier.schema.json` aligned to `docs/universe.md`.

Pick one early and keep it stable; Mission Control and downstream tooling will depend on it.

### 3.3 Dynamics-driven policy updates (Universe overlay)

Implement the feedback loop:

- aggregate dynamics observations keyed by Universe (and optionally World)
- feed adjustments into:
  - routing priors (toolchain selection probabilities)
  - swarm selection defaults (e.g., escalate to architect after N failed repair loops)
  - budget changes (e.g., reduce max iterations on low-yield loops)

Deliverable: policy changes remain transparent and traceable back to `evidence_runs`.

---

## Phase 4 — Evolution Loop v1 (M3)

Goal: make `cyntra evolve --universe <id> --world <world_id> ...` real, deterministic, and evidence-driven.

### 4.1 Define “genome surface” per world

For Fab Worlds:

- Start by exposing a small, explicit parameter surface from `fab/worlds/<world_id>/world.yaml`.
- Once stable, promote to `fab/worlds/<world_id>/genome.yaml` with mutation operators.

Add/align with `kernel/schemas/cyntra/genome.schema.json`.

### 4.2 Implement candidate generation via Swarms

Use `universes/<id>/swarms.yaml` to drive orchestration:

- `parallel_compete` (speculate+vote) for high-risk changes
- `serial_handoff` (assembly line) for structured build→critic→repair loops

Selection mode should be defined in swarm config (e.g. `gate_score_max`, require all gates pass).

### 4.3 Deterministic evaluation + selection + mutation

For each generation:

1. **Generate** config/genome deltas (seeded)
2. **Evaluate** world pipeline + gates (seeded, CPU-only when required)
3. **Select** winner(s) and update frontier
4. **Mutate** distribution / operators based on measured outcomes

Persist:

- per-candidate run directories in `.cyntra/runs/` with `context.json`
- generation index entries in `.cyntra/universes/<id>/index/generations.jsonl`
- updated frontier file(s)

Deliverable: repeated evolution runs with the same seeds produce identical selected results (modulo nondeterministic external tools, which must be pinned or excluded).

---

## Phase 5 — Mission Control (UI) (Defer Until Artifacts Stabilize)

Minimum UI scope from spec (only after M1/M2 artifacts exist):

1. Universe picker + world list (read `universes/*/universe.yaml`)
2. Run browser (read `.cyntra/universes/<id>/index/runs.jsonl`)
3. Run detail view (hydrate from `.cyntra/runs/<run_id>/` + `context.json`)
4. Evolution view (frontiers + generation history) after M2/M3

Avoid “smart UI” until the underlying artifact contracts are stable.

---

## Verification / Quality Gates

Add unit tests in `kernel/tests/` covering:

- Universe YAML validation + path resolution
- World reference resolution and Fab World schema validation (when `world_kind == fab_world`)
- `context.json` write/read roundtrip + schema validation
- Index rebuild correctness given a fixture `.cyntra/runs/` set
- Frontier update nondominance logic (if implemented in-kernel)

Add CLI smoke checks:

- `cyntra universe validate <id>`
- `cyntra universe index rebuild <id>`

---

## Open Questions (Decide Early)

1. **Source of truth for objectives**: is `objectives.yaml` an expression language, or a list of named metric sets computed elsewhere?
2. **Routing override semantics**: how do Universe `routing_overrides` compose with `.cyntra/config.yaml` (priority order, merge strategy)?
3. **Frontier schema**: extend existing `cyntra.frontier.v1` vs introduce Universe-specific schema aligned to `docs/universe.md`.
4. **World kinds beyond Fab**: do we implement `codebase/dataset/simulation` now (thin stubs) or defer until Fab path is solid?
5. **Index update strategy**: purely rebuildable batch vs incremental append with periodic compaction.
