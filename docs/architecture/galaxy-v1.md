# Galaxy v1 — “Universe of Universes” (Architecture Spec)

Status: **Draft** (design spec). This defines a higher-order control plane that treats **Universes themselves** as evolvable artifacts with measurable behavior.

Core move:
- **Universe-as-World**: a Universe configuration becomes a candidate. We evaluate it on a benchmark suite, produce a verdict + metrics, and maintain a **meta-frontier** of best-performing universes.

This is the “one step out” that starts to feel sci‑fi while staying grounded in Cyntra’s run-ledger + schema-first philosophy.

---

## 0) Definitions (v1)

- **Galaxy**: a container that manages multiple universes + universe variants, plus benchmarks, meta-objectives, meta-frontiers, and routing.
- **Universe template**: a base, human-authored Universe (`universes/<id>/...`) used as a starting point.
- **Universe variant**: a derived Universe config produced by applying a **meta-genome delta** to a template.
- **Meta-genome**: explicit knobs we allow to change in a Universe (policies, swarms, defaults, memory params).
- **Benchmark suite**: a deterministic set of tasks used to evaluate a universe variant.
- **Galaxy eval run (meta-run)**: a run directory that records evaluation of a universe variant across a benchmark suite, pointing to the underlying runs.
- **Meta-frontier**: nondominated set of universe variants over meta-objectives (pass rate, cost, determinism, etc).
- **Router**: chooses which universe should handle a new task, using the meta-frontier and task classification.

---

## 1) Goals

1. **Specialize**: maintain multiple “jurisdictions” (universes) optimized for different domains or risk profiles.
2. **Measure**: evaluate universes by evidence (runs + verdicts), not vibes.
3. **Select**: keep a meta-frontier of best universes under multi-objective tradeoffs.
4. **Route**: automatically pick the best universe for a task (and justify the choice).
5. **Promote safely**: promote a winning variant back into a git-tracked universe via explicit diffs/patches.

## 2) Non-goals (v1)

- Not “auto-write to mainline”: promotion is reviewable and explicit.
- Not a generic RL framework: this is still run-ledger + gates + selection.
- Not infinite recursion: v1 is one meta-level (Galaxy → Universes). “Galaxy-of-galaxies” is a later extension.

---

## 3) On-disk layout

### 3.1 Git-tracked Galaxy definitions (reviewable)

```
galaxies/<galaxy_id>/
  galaxy.yaml                 # templates + benchmarks + meta-objectives + routing
  benchmarks/                 # benchmark suite definitions (YAML)
    fabship_smoke_v1.yaml
    repoevo_smoke_v1.yaml
    simlab_smoke_v1.yaml
  genomes/                    # allowed meta-genome surfaces (YAML)
    universe_policy_surface_v1.yaml
    universe_swarm_surface_v1.yaml
    universe_memory_surface_v1.yaml
```

### 3.2 Generated Galaxy state (evidence + indices)

```
.cyntra/galaxies/<galaxy_id>/
  variants/<variant_id>/              # derived universe configs (generated, reproducible)
    template_ref.json                 # points to base universe id + git rev
    delta.json                        # canonical meta-genome delta (machine-readable)
    universe/                         # fully materialized universe config files
      universe.yaml
      objectives.yaml
      swarms.yaml
      agents.yaml                     # optional
      memory.yaml                     # optional (universe memory settings)

  evals/<eval_run_id>.json            # summary for meta-runs (optional cache)
  frontiers/meta_frontier.json        # nondominated set of universe variants per benchmark/objective
  index/evals.jsonl                   # append-only meta-run index
  index/variants.jsonl                # append-only variant lineage index
  shelf/<domain>.json                 # “best-known universe” pointers per domain slice (optional)
```

### 3.3 Meta-runs (same run ledger)

Meta-evals still write to `.cyntra/runs/<run_id>/` like everything else. A meta-run points to many underlying run ids:

```
.cyntra/runs/galaxy_eval_<...>/
  context.json                        # includes galaxy_id + variant_id + benchmark_id
  galaxy_eval.json                    # meta metrics + underlying runs + selection inputs
  evidence/                           # convenience links (optional)
    underlying_runs.jsonl
```

Design rule: **frontiers and indices must be rebuildable from `.cyntra/runs/`**.

---

## 4) Galaxy config model (conceptual)

`galaxies/<galaxy_id>/galaxy.yaml` (sketch):

```yaml
schema_version: "1.0"
galaxy_id: medica_galaxy

templates:
  - template_id: fabship_base
    universe_id: medica               # points at `universes/medica/`
    allowed_surfaces:
      - galaxies/medica_galaxy/genomes/universe_policy_surface_v1.yaml
      - galaxies/medica_galaxy/genomes/universe_swarm_surface_v1.yaml
      - galaxies/medica_galaxy/genomes/universe_memory_surface_v1.yaml
    constraints:
      require_determinism: true
      forbid_network: true

benchmarks:
  - benchmark_id: fabship_smoke_v1
    path: galaxies/medica_galaxy/benchmarks/fabship_smoke_v1.yaml

meta_objectives:
  # Multi-objective by default (Pareto).
  fabship_default:
    metrics:
      pass_rate: max
      cost_usd: min
      wall_time_ms: min
      determinism_score: max
      regression_rate: min
      novelty_yield: max

routing:
  domains:
    fab_shipping:
      benchmark_id: fabship_smoke_v1
      objective_id: fabship_default
      selection: pareto_then_champion
```

---

## 5) Benchmark suites (what universes are judged on)

Benchmarks are deterministic task sets. Each task must be runnable without “human context”.

`galaxies/<id>/benchmarks/fabship_smoke_v1.yaml` (sketch):

```yaml
schema_version: "1.0"
benchmark_id: fabship_smoke_v1
description: "Tiny FabShip benchmark: 2 gens × 3 pop on outora_library"

tasks:
  - task_id: outora_library_tiny_evolve
    kind: world_evolve
    universe_id: medica                  # overridden by variant at runtime
    world_id: outora_library
    generations: 2
    population: 3
    seed: 42
    require_all_gates_pass: true

probes:
  - probe_id: determinism_replay_v1
    kind: replay_gate_eval
    repeats: 2
    tolerance:
      overall: 0.0001
```

Design rule: a benchmark must produce a **single meta-metric vector** and an overall pass/fail eligibility decision.

---

## 6) Meta-genome surfaces (what can change)

Galaxy must define explicit surfaces to mutate, validated and bounded.

### 6.1 Policy surface examples

- `policies.determinism.enforce_cpu_only` (bool)
- `policies.budgets.max_run_minutes` (int_range)
- `policies.routing_overrides[*]` (enum choices from a predeclared set, or weights)
- `policies.retention.prune_intermediates` (bool)

### 6.2 Swarm surface examples

- default swarm selection (`defaults.swarm_id`) from an allowlist
- per-swarm knobs: `population_size`, phase thresholds, vote triggers

### 6.3 Memory surface examples

- retrieval top-k, decay rates, “which memory blocks are eligible”
- determinism: memory must be provenance-safe (only cite run ids) to remain frontier-eligible

### 6.4 Variant identity

Variant id should be derived deterministically:

- base template id + canonical delta + seed → digest → `variant_id`
- store:
  - `template_ref.json` (template universe + git rev)
  - `delta.json` (canonical meta-genome delta)
  - fully materialized universe config files under `variants/<variant_id>/universe/`

---

## 7) Galaxy eval semantics (Universe-as-World)

To evaluate a universe variant:

1. Materialize the variant universe config (apply delta to template config).
2. Execute each benchmark task under that universe (producing underlying `.cyntra/runs/<run_id>`).
3. Extract metrics from each underlying run (from verdicts/manifests).
4. Aggregate into meta-metrics:
   - `pass_rate` across tasks
   - `cost_usd` and `wall_time_ms` totals or distributions
   - `determinism_score` from replay probes
   - `regression_rate` vs current domain shelf champion
   - `novelty_yield` (new frontier points created / diversity metrics)
5. Write a **meta-run** with:
   - join keys (galaxy_id, variant_id, benchmark_id)
   - list of underlying run ids
   - aggregated meta-metrics and eligibility

Eligibility rule (recommended v1):
- Only include a variant in the meta-frontier if **all benchmark tasks meet evidence contracts** and determinism policy requirements.

---

## 8) Meta-frontier and shelf

### 8.1 Meta-frontier

Maintain nondominated universe variants per `(benchmark_id, objective_id)`:

- points contain `variant_id` + `values` (numeric meta-metrics)
- metadata lives in indices (lineage, diffs, run pointers)

### 8.2 Galaxy shelf (best-known universes)

For each domain slice (e.g., `fab_shipping`, `code_evolution`):

- pick a **champion** from the meta-frontier using a stable tie-break rule (or policy-defined selection mode),
- write `.cyntra/galaxies/<id>/shelf/<domain>.json`:
  - `variant_id`, `template_id`, selection inputs, and links to eval runs

---

## 9) Routing semantics (“which universe should run this?”)

Router inputs:
- task descriptor: `{domain, world_id|repo_id, risk, size, tags}`
- routing policy: which benchmark/objective slice applies

Router outputs:
- chosen universe id or variant id
- justification:
  - meta-metrics for chosen candidate
  - alternatives considered (top-k)
  - policy constraints (why others were excluded)

Routing modes (v1):
- `champion`: always use shelf champion
- `pareto_then_champion`: pick eligible pareto point with best primary metric; tie-break to champion
- `risk_aware`: for high-risk tasks, prefer universes with lower regression/flakiness scores

---

## 10) CLI surface (proposed)

### 10.1 Discovery / validation
- `cyntra galaxy ls`
- `cyntra galaxy validate <galaxy_id>`

### 10.2 Evaluate a universe variant
- `cyntra galaxy eval --galaxy <id> --variant <variant_id|path> --benchmark <benchmark_id> --seed <int>`

### 10.3 Evolve universes (meta-evolution)
- `cyntra galaxy evolve --galaxy <id> --template <template_id> --benchmark <benchmark_id> --generations N --population K --seed <int>`
  - generates variants (meta-genome deltas), evaluates them, updates meta-frontier and shelf

### 10.4 Route a task
- `cyntra galaxy route --galaxy <id> --task <json|issue_id|world_id>`

### 10.5 Promote a variant back into git-tracked universes (reviewable)
- `cyntra galaxy promote --galaxy <id> --variant <variant_id> --to-universe <universe_id> [--write-patch <path>]`
  - produces a patch/diff (does not auto-commit)

---

## 11) Why this feels “sci‑fi” (and why it’s still safe)

Sci‑fi behavior emerges when:

- you have multiple universes that behave like specialized jurisdictions,
- you can measure them on real benchmarks,
- you automatically route work to the best “jurisdiction”,
- and the whole system can improve its own governance without losing auditability.

The safety comes from:

- explicit mutation surfaces,
- strict evidence contracts,
- deterministic selection + replay probes,
- and reviewable promotion back into git-tracked configs.

---

## 12) v1 build plan (minimal)

1. Add `galaxies/<id>/galaxy.yaml` + one benchmark suite (`fabship_smoke_v1`).
2. Implement `galaxy eval` as a wrapper around existing `cyntra evolve` / world runs + metric aggregation.
3. Write meta-run summaries under `.cyntra/runs/`.
4. Implement meta-frontier builder (nondominated set over meta-metrics).
5. Implement `galaxy route` using shelf champion.
6. Add `galaxy evolve` (meta mutation + eval loop) once eval is stable.

