# Universe Blueprints (v1)

Status: **Draft** (design spec). This document proposes three “ready-to-build” Universe blueprints:

1. **Fab Shipping Universe** — ship/view best-known 3D assets (Fab Worlds).
2. **Code Evolution Universe** — evolve agent/toolchain behavior to deliver passing patches faster and safer.
3. **Research/Sim Universe** — run deterministic experiments, sweeps, and dynamics-driven exploration loops.

Each blueprint is a concrete instantiation of:

- **Universe** = governance bundle (optimize + allowed ops + memory + evidence)
- **Genome** = explicit knobs we allow to change
- **Swarm** = coordination/search strategy over those knobs
- **Frontier** = persistent best-known evidence set (multi-objective, replayable)

---

## Common Blueprint Template (what to specify)

For any Universe `<U>`:

### A) Registry
- Worlds included (with paths)
- Default objective + swarm

### B) Evidence contract (frontier eligibility)
- Required artifacts per run (context/manifest/verdict + domain-specific proofs)
- Schema validation rules

### C) Determinism policy
- Seeds + environment requirements (CPU-only, pinned tools)
- Replay probes (determinism score)

### D) Genome surfaces (what can change)
- World genes
- Gate genes
- Policy genes
- Prompt/tool genes
- Memory genes

### E) Objectives + metrics
- Metric list and `min/max` directions
- Hard constraints (e.g., “must pass all gates”)

### F) Swarms
- At least one “small + safe” swarm
- One “high risk / speculate+vote” swarm
- One “repair loop” swarm

### G) Promotion path (tangible value)
- Shelf pointer (“best-known”)
- Gallery/viewer publishing
- Regression tracking

---

## Blueprint 1 — Fab Shipping Universe (“FabShip v1”)

### 1) What it’s for

Produce **shippable/viewable** 3D assets from Fab Worlds while accumulating an evidence-driven Pareto frontier.

Primary user outcome:
- “What’s the best-known `outora_library` build right now, and why?”

### 2) Worlds (registry)

- Fab Worlds (existing): `fab/worlds/<world_id>/world.yaml`
  - Example: `outora_library`
- Optional “evaluation-only” worlds (later):
  - lookdev-only renders, LOD export, platform packaging

### 3) Evidence contract (frontier eligibility)

Required per candidate run:
- `context.json` (universe/world join keys)
- `manifest.json` (stage provenance + hashes)
- `verdict/gate_verdict.json` (canonical metrics + pass/fail)
- `world/<world_id>.glb` (phenotype)

Recommended:
- `render/beauty/*.png`, `render/clay/*.png` (for review + critics)
- `stages/validate/**` per-gate artifacts
- optional `asset_proof.json` (bundle verdict + renders + critic reports)

### 4) Determinism policy

Minimum:
- CPU-only (Cycles CPU, no GPU in evaluation)
- stable seeds wired into:
  - mutation RNG
  - world seed
  - render/critic seed
- pinned Blender path/version (Universe-level requirement)

Replay probe (determinism score):
- re-run gate evaluation `N=2..3` on the same exported GLB + render set
- compare metric stability (within tolerance) and key artifact hashes

### 5) Genome surfaces (v1)

**World genome**
- enum knobs: layout/material/lighting presets, bake mode, template selection
- promote “template choice” early (high leverage)

**Gate genome (optional v1, recommended v2)**
- critic weights, thresholds, subscore floors (only after you trust the critics)

**Policy genome (optional)**
- population size, phase budgets, pruning/retention toggles

### 6) Objectives (v1 examples)

`ship_quality_v1` (recommended multi-objective):
- `overall: max` (gate score)
- `duration_ms: min` (time-to-build)
- `artifact_size_mb: min` (GLB size / deployment cost)
- `determinism_score: max` (replay stability)
- `cost_usd: min` (if measured)

Hard constraints:
- `require_all_gates_pass: true` for frontier eligibility

### 7) Swarms (recommended set)

**A) Multi-fidelity funnel (default)**
- Phase 1 (cheap): schema + budgets + static checks
- Phase 2 (medium): build until `export`, run lightweight critics
- Phase 3 (full): run `validate` gates + determinism probe

**B) Parallel compete + vote**
- for high-risk mutations (template swaps, big layout changes)

**C) Serial repair loop**
- if gates fail, apply `verdict.next_actions` → regenerate → re-validate (bounded iterations)

### 8) Agent roles (how it runs)

- Generator: proposes world param deltas
- Repairer: uses gate `next_actions` to fix failures
- Curator: promotes best-known to shelf and viewer
- FrontierManager: updates world frontiers + regression log
- Historian: writes “what changed + why it won” memory blocks
- BudgetController: tightens/loosens fidelity thresholds based on failure rates
- RedTeam: tries edge cases (budgets, determinism, geometry blowups)
- HumanPreferenceProxy (optional): incorporates human ratings into selection

### 9) Promotion (“best-known shelf”)

Auto-promotion policy:
- when a new frontier champion appears, publish to:
  - viewer “best-known” slot (overwrite) and/or
  - gallery (immutable directory per run)
- write `.cyntra/universes/<U>/shelf/<world_id>.json` pointing to run_id + artifact paths

### 10) Minimal config sketch

`universes/fabship/universe.yaml` (conceptual):
```yaml
schema_version: "1.0"
universe_id: fabship
worlds:
  - world_id: outora_library
    kind: fab_world
    path: fab/worlds/outora_library/world.yaml
defaults:
  objective_id: ship_quality_v1
  swarm_id: funnel_v1
policies:
  determinism:
    pythonhashseed: 0
    enforce_cpu_only: true
  retention:
    prune_intermediates: true
```

---

## Blueprint 2 — Code Evolution Universe (“RepoEvo v1”)

### 1) What it’s for

Use evolution to improve **how the system builds patches** (prompts, routing, repair playbooks, reviewer behavior) so it:

- produces passing patches more often,
- with lower cost/time,
- and fewer regressions.

Important nuance: the “phenotype” here is often **a patch + proof**, not a single artifact file.

### 2) Worlds (registry)

You can model “code” in two layers:

**Layer A — Project worlds (deterministic gates)**
- `cyntra-kernel` world: gates = `pytest + mypy + ruff` (plus schema validators)
- `glia-fab-desktop` world: gates = `npm test/build + typecheck + lint`

**Layer B — Task worlds (issue-driven)**
- “Issue world” that runs a bead/issue through a standardized pipeline:
  - create workcell
  - implement patch
  - run required gates
  - emit Patch+Proof bundle

### 3) Evidence contract (frontier eligibility)

For a candidate run to be frontier-eligible:
- `context.json` (universe/world/join keys + issue id if applicable)
- Patch artifact:
  - `patch.diff` or structured patch json
- Proof artifact:
  - gate outputs (pytest/mypy/ruff logs)
  - pass/fail + metrics summary (a “code gate verdict” schema)
- Optional:
  - telemetry summary (tool usage)
  - rollout.json (for replay/determinism)

### 4) Determinism policy

Minimum:
- pinned dependency lockfiles respected (no network install during eval, or fully pinned)
- deterministic test suite mode (fixed seeds, stable ordering)
- stable workcell creation + patch application order

Replay probe:
- re-run the verifier step twice for the same patch to detect flakiness

### 5) Genome surfaces (v1)

**Prompt/tool genome (primary)**
- system prompt blocks per role (implementer/reviewer/repairer)
- tool use rules (safe file ops, testing discipline)
- sampling params (temperature, parallelism)
- repair playbook templates keyed by failure types

**Policy genome**
- routing (which toolchains for which risks)
- speculate thresholds (when to parallelize)
- budget allocation (how much time to spend before escalating)

**(Optional) Code config genome**
- feature flags, perf knobs, build configs — only when changes are safe and reversible

### 6) Objectives (v1 examples)

`patch_throughput_v1`:
- `pass_rate: max` (fraction of tasks that pass gates)
- `time_to_pass_ms: min`
- `cost_usd: min`
- `risk_score: min` (heuristic from diff size / touched areas)
- `flakiness_score: min` (replay stability)

Hard constraints (recommended):
- require gates pass for “shipping” points; allow “fail points” only for learning memory, not frontier

### 7) Swarms (recommended set)

**A) Assembly line (serial handoff)**
- Generator (plan) → Implementer (patch) → Reviewer (diff critique) → Repairer → Verifier
- Great for consistent quality and interpretability

**B) Speculate+vote (parallel compete)**
- multiple implementers in parallel for high-risk tasks
- select winner by gates pass + objective ranking

**C) Multi-fidelity funnel**
- Phase 1: static checks (format, ruff, mypy) before running tests
- Phase 2: unit tests
- Phase 3: integration tests (only for survivors)

**D) RedTeam adversarial**
- tries to induce regressions / flaky behavior; hardens policies and playbooks

### 8) What the frontier represents (key design choice)

There are two viable interpretations:

**Option 1 (recommended v1): frontier over “behavior genomes”**
- points are prompt/policy genomes that produce better outcomes across many tasks
- this avoids mixing “frontier points” with the repo’s mainline code state

**Option 2: frontier over “patch candidates”**
- points are patch+proof bundles for specific tasks
- useful for “best-known fix for issue X”, but less reusable across tasks

### 9) Promotion (“best-known behavior”)

- Promote best-performing prompt/policy genomes into:
  - default universe config for new runs
  - Mission Control UI presets
- Keep regression logs when a “new best behavior” increases failure rates or flakiness.

### 10) Minimal config sketch

`universes/repoevo/universe.yaml` (conceptual):
```yaml
schema_version: "1.0"
universe_id: repoevo
worlds:
  - world_id: cyntra_kernel_repo
    kind: code_project
    path: cyntra-kernel/
  - world_id: fab_desktop_repo
    kind: code_project
    path: apps/glia-fab-desktop/
defaults:
  objective_id: patch_throughput_v1
  swarm_id: assembly_line_v1
policies:
  determinism:
    pythonhashseed: 0
  budgets:
    max_run_minutes: 45
```

---

## Blueprint 3 — Research/Sim Universe (“SimLab v1”)

### 1) What it’s for

Run deterministic experiments, parameter sweeps, and dynamics-driven exploration loops where:

- worlds are “experiments” (pipelines producing structured metrics),
- gates are “scientific validity checks” (schema + constraints + sanity),
- frontiers track best trade-offs (e.g., exploration quality vs compute).

### 2) Worlds (registry)

Typical worlds:
- **Ingest world**: converts raw telemetry/rollouts into canonical artifacts (e.g., transition DB)
- **Experiment world**: runs a simulation/rollout with fixed seeds
- **Analysis world**: produces reports (dynamics_report, action metrics, trap warnings)

Outputs are almost entirely JSON/CSV + plots, not GLBs.

### 3) Evidence contract (frontier eligibility)

Required:
- `context.json`
- experiment manifest (inputs, params, seeds, tool versions)
- metric report (schema-validated)
- determinism probe (replay stability) if used as an objective

Recommended:
- raw trajectories / rollouts (or hashes of them)
- transition matrices / state ids

### 4) Determinism policy

Minimum:
- fixed seeds at every stage
- pinned data versions (hash-addressed datasets)
- pinned library versions (lockfile-based)

Replay probe:
- rerun the same experiment twice and compare key metrics + checksums

### 5) Genome surfaces (v1)

**Experiment genome**
- environment parameters (difficulty, stochasticity)
- controller parameters (temperature, exploration settings)
- batch sizes / horizon lengths

**Analysis genome**
- smoothing constants, thresholds for trap detection, objective weights

**Memory genome**
- retrieval rules for which historical runs influence new runs
- decay rates and confidence thresholds

### 6) Objectives (examples)

`exploration_quality_v1`:
- `action_metric: max` (exploration / irreversibility metric)
- `trap_rate: min` (how often stuck states occur)
- `delta_v: max` (improvement proxy)
- `duration_ms: min`
- `cost_usd: min`
- `determinism_score: max`

Hard constraints:
- schema-valid reports only
- “no trap catastrophes” as a hard fail threshold

### 7) Swarms (recommended set)

**A) Explore/exploit split**
- explorers: maximize novelty/diversity subject to basic sanity gates
- exploiters: hill-climb from frontier parents

**B) Tournament parents**
- sample multiple parents from the frontier to avoid local minima

**C) Multi-fidelity funnel**
- short-horizon runs to filter bad configs
- long-horizon runs for finalists only

**D) Adversarial (trap finder)**
- a “FailureFinder” role searches for trap-inducing configs
- repairer adjusts controller/memory policies to reduce trap_rate

### 8) Promotion (“best-known controller / config”)

Shelf output becomes:
- a “best-known controller config” for the next rollout runs
- plus an evidence pack showing why it’s best (metrics + stability)

### 9) Minimal config sketch

`universes/simlab/universe.yaml` (conceptual):
```yaml
schema_version: "1.0"
universe_id: simlab
worlds:
  - world_id: dynamics_ingest
    kind: pipeline
    path: cyntra-kernel/   # or a dedicated world definition
  - world_id: experiment_rollout
    kind: pipeline
    path: cyntra-kernel/
defaults:
  objective_id: exploration_quality_v1
  swarm_id: explore_exploit_v1
policies:
  determinism:
    pythonhashseed: 0
  budgets:
    max_run_minutes: 60
```

---

## Suggested “Start Here” Sequencing

1. **FabShip v1**: easiest to see value (viewer + shelf + tangible artifacts).
2. **RepoEvo v1**: optimize the system’s own productivity (prompt/policy genomes).
3. **SimLab v1**: deeper research loop once evidence + memory pipelines are stable.

If you want, I can turn each blueprint into a concrete folder under `universes/` with starter `universe.yaml`, `objectives.yaml`, `swarms.yaml`, plus a minimal “world wrapper” for the code and sim universes. 

