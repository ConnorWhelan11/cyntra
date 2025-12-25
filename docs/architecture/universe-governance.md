# Universe Governance Bundle — Architecture Spec

Status: **Draft** (design spec). Companion to `docs/universe.md` (concepts) and `docs/universe-evolution-quickstart.md` (operational workflow).

## 1) Purpose

A Universe is a **reproducible, reviewable governance bundle** for development and evolution loops. It defines:

1. **Optimization**: which metrics matter and how to compare candidates.
2. **Authorization**: what tools/actions are allowed (and where “escalation” is required).
3. **Determinism**: what constraints must be enforced for reproducible runs.
4. **Evidence**: what artifacts count as valid proof for selection/frontiers/memory.
5. **Memory**: what derived knowledge is stored and how it is updated.

The goal is to make “AI-augmented development” behave more like an **operating system** than a chat session.

## 2) Non-goals

- Not a new scheduler: Universe layers on the Cyntra kernel/workcells.
- Not a simulator: Universe organizes pipelines and evaluations, not real-time physics.
- Not a monolithic database: files + schemas remain the source-of-truth for provenance.

## 3) Core invariants (what must stay true)

1. **Evidence first**: only artifacts produced by deterministic pipelines + gates can move the frontier.
2. **No vibes**: memory updates must be traceable to run ids and signed by schemas.
3. **Replays matter**: the system must be able to re-run or re-validate a frontier point.
4. **Policy is explicit**: operational constraints live in config, not in “tribal knowledge”.

## 4) On-disk layout

### 4.1 Git-tracked (reviewable definitions)

```
universes/<universe_id>/
  universe.yaml        # world registry + defaults + policy overlays
  objectives.yaml      # objective sets + metric directions
  swarms.yaml          # swarm catalog (coordination patterns)
  agents.yaml          # (optional) agent catalog / role bindings
  genomes/             # (optional) shared genomes beyond worlds
```

### 4.2 Kernel state (generated evidence + derived knowledge)

```
.cyntra/
  runs/<run_id>/...                              # all run artifacts (immutable after completion)
  universes/<universe_id>/
    frontiers/<world_id>.json                    # generated; Pareto sets per objective
    index/runs.jsonl                             # generated; run index for this universe
    index/generations.jsonl                      # generated; evolution histories
    memory/                                      # generated; structured memory blocks + embeddings
    shelf/<world_id>.json                        # generated; best-known promotion pointers
    regressions/<world_id>.jsonl                 # generated; regression events
```

## 5) Universe config model (conceptual)

Universe definitions are a *composition* of:

- **Registry**: worlds and their paths/ids.
- **Defaults**: which objective/swarm to use when CLI doesn’t specify.
- **Policies**: overlays applied to kernel/toolchains/worlds.

Minimal conceptual schema (not necessarily 1:1 with current YAML):

```yaml
schema_version: "1.0"
universe_id: medica

worlds:
  - world_id: outora_library
    kind: fab_world
    path: fab/worlds/outora_library/world.yaml

defaults:
  objective_id: realism_perf_v1
  swarm_id: speculate_vote

policies:
  determinism:
    pythonhashseed: 0
    enforce_cpu_only: true
  budgets:
    max_concurrent_workcells: 2
    max_run_minutes: 90
  routing_overrides: []
  retention:
    prune_intermediates: true
    keep_stage_ids: ["validate"]
```

## 6) Policy overlays (precedence + merge semantics)

### 6.1 Precedence order

From highest to lowest:

1. **CLI overrides** (explicit user intent)
2. **Universe policies** (governance bundle)
3. **Kernel config** (`.cyntra/config.yaml`)
4. **World defaults** (`world.yaml` parameters/determinism hints)
5. **Tool defaults** (Blender defaults, OS defaults)

### 6.2 Merge rules

- Mappings: deep-merge (Universe can override/extend).
- Lists: append or replace (must be explicit per key to avoid silent drift).
- Scalars: override.

Design recommendation: introduce `merge_strategy` for list-like keys where behavior matters (routing rules, allowed tools, keep stages).

## 7) Determinism policy (enforcement)

Determinism policy should produce **concrete controls**, not just statements:

- Environment variables applied to subprocesses (e.g., `PYTHONHASHSEED`, CPU-only flags).
- Seed wiring into worlds/gates/critics.
- Tool pinning (Blender path/version, addon set).
- Stable ordering in candidate generation, selection, and indexing.

### 7.1 Required determinism signals (v1)

For a run to be “frontier-eligible”, the run context should record:

- `seed` (mutation seed, world seed, render seed where applicable)
- `pythonhashseed`
- tool versions (at least Blender version string + cyntra version)
- `repo_rev` (git commit hash or “dirty” marker)

## 8) Evidence contract (what counts)

Universe tooling should only treat a run as valid evidence if it has:

- `context.json` (join key: universe/world/objective/swarm)
- `manifest.json` (provenance: params, stage status, hashes)
- `verdict/gate_verdict.json` (canonical decision + metrics)

Optional but recommended:

- `render/` (canonical renders used by critics)
- `rollout.json` (for code/tool evolution loops)
- `telemetry.jsonl` (tool usage + events)

Design rule: **frontiers and memory must be rebuildable** from `runs/` + schemas.

## 9) Governance checks (validation gate)

Before a run is admitted into:

- frontiers,
- generation index,
- memory substrate,

it should pass:

1. **Schema validation**: context/manifest/verdict.
2. **Policy compliance**: determinism flags present; banned tools not used; budgets respected (best-effort).
3. **Evidence completeness**: required files exist and are internally consistent (run_id matches directory, etc.).

## 10) Interfaces (CLI / API expectations)

### 10.1 Primary user entrypoints

- `cyntra universe validate <universe_id>`
- `cyntra evolve --universe <id> --world <world_id> ...`
- `cyntra universe frontiers rebuild <universe_id> --world <world_id>`
- `fab-world build/validate/publish/prune ...`

### 10.2 Machine interfaces

- JSONL indices for incremental loading (`runs.jsonl`, `generations.jsonl`).
- Frontier JSON per world (stable schema).
- Shelf pointer (stable schema): “best-known run id + artifact pointers”.

## 11) Security & escalation boundaries

Universes should be able to declare operational constraints like:

- “No network during evaluation”
- “No deleting outside run dir”
- “No GPU usage”
- “Escalation required for system-level tool access”

The system should surface policy violations as **explicit failures** (not silent).

## 12) Open questions (intentionally unresolved)

- How to represent “allowed tools” across heterogeneous toolchains (LLM vs Blender vs OS tools)?
- How to version and migrate universe policies without invalidating historical frontiers?
- What’s the minimal determinism proof we can attach cheaply (e.g., re-run a gate twice, hash artifacts)?

