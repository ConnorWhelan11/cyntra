# Universe World Evolution Quickstart (Frontier Builder v1)

Status: **Operational spec (v1)** — describes the minimal, high-leverage workflow for running a tiny, deterministic Universe-scoped evolution loop on a Fab World to (a) build a meaningful Pareto frontier and (b) produce “best-known” shippable/viewable assets.

This spec targets the concrete example:

```bash
cyntra evolve --universe medica --world outora_library --generations 2 --population 3 --seed 42
```

and the follow-up inspection of:

- `.cyntra/universes/medica/frontiers/outora_library.json`
- the selected candidate run’s artifacts under `.cyntra/runs/<run_id>/`

---

## 1) Goal

Run a small evolution batch (few generations, small population) that:

1. Proposes a handful of deterministic world parameter mutations (“candidates”)
2. Evaluates each candidate via the Fab World pipeline + gates
3. Selects the best candidate per objective (and/or Pareto set)
4. Updates the Universe-scoped frontier so subsequent runs start from best-known evidence

This is the shortest path to **tangible artifacts** (GLB + renders + verdicts) while beginning to accumulate a stable **frontier**.

---

## 2) Preconditions / Required Config

### 2.1 Universe registry + defaults

Universe config must exist and include the world in its registry:

- `universes/medica/universe.yaml`
  - `worlds[*].world_id: outora_library`
  - `defaults.objective_id` (or passed via CLI)
  - `defaults.swarm_id` (or passed via CLI)

### 2.2 Objectives catalog

Objective directions (max/min) must be defined:

- `universes/medica/objectives.yaml`
  - Example: `overall: max`, `duration_ms: min`

These objective directions drive selection ordering and frontier updates.

### 2.3 Swarm catalog

Swarm config must exist and define the coordination/selection mode:

- `universes/medica/swarms.yaml`
  - `speculate_vote` (recommended default):
    - `type: parallel_compete`
    - `population_size` (or CLI `--population`)
    - `selection.mode` (recommended: `objectives`)
    - `selection.require_all_gates_pass` (recommended: `true` for provenance hygiene)

### 2.4 World definition

The Fab World must be present and runnable:

- `fab/worlds/outora_library/world.yaml`

### 2.5 Genome surface (world parameter surface)

The evolvable surface must be explicit:

- `fab/worlds/outora_library/genome.yaml`

This file defines which world parameters Cyntra may mutate (v1 typically uses enum knobs like `layout.complexity`, `lighting.preset`, etc.).

---

## 3) Determinism Contract

### 3.1 What determinism means (v1)

Given:

- the same repo revision
- the same toolchain versions (Blender, addons, Python deps)
- the same Universe determinism policies (e.g., CPU-only)
- the same CLI inputs (universe/world/objective/swarm/generations/population/seed)

then:

- **candidate generation is deterministic** (same candidate run_ids and parameter overrides)
- **selection is deterministic** (same selected run_id), assuming the underlying evaluation emits consistent metrics

### 3.2 Known nondeterminism sources

External tools can introduce nondeterminism (especially rendering). This workflow assumes determinism policies are tightened and the Fab World is configured accordingly (fixed seeds, CPU-only). If the gates/metrics are unstable, the selection may diverge.

---

## 4) Command Interface (World Evolution)

### 4.1 Minimal command

```bash
cyntra evolve --universe medica --world outora_library --generations 2 --population 3 --seed 42
```

### 4.2 Key options

- `--universe <id>`: Universe namespace (must exist under `universes/<id>/`)
- `--world <world_id>`: World id from `universes/<id>/universe.yaml`
- `--generations <n>`: number of generations (v1: small numbers recommended)
- `--population <k>`: candidates per generation
- `--seed <int>`: seeds mutation RNG and world execution seed
- `--objective-id <id>`: override objective (otherwise uses universe defaults)
- `--swarm-id <id>`: override swarm (otherwise uses universe defaults)
- `--no-reuse-candidates`: forces re-evaluation even if deterministic candidate dirs already exist

---

## 5) Execution Semantics

### 5.1 Baseline (“parent”) selection

Each evolution run establishes baseline gene values from:

1. The best-known evidence in the existing Universe frontier (if present), otherwise
2. The world’s parameter defaults from `world.yaml`

This makes evolution **evidence-driven**: it continues from the best-known configuration rather than restarting from defaults every time.

### 5.2 Candidate generation (per generation)

For each candidate:

- Start from the current parent gene values
- Apply `mutation.per_candidate` gene mutations from `genome.yaml`
- Compute a deterministic digest from the candidate overrides
- Create a deterministic candidate run id:

`evo_<universe_id>_<world_id>_seed<seed>_g<generation>_c<idx>_<digest>`

### 5.3 Evaluation

Each candidate is evaluated by running the world pipeline and gates, writing artifacts under:

`.cyntra/runs/<candidate_run_id>/`

The evaluation must produce `verdict/gate_verdict.json` for metrics extraction.

Note: v1 evolution evaluation stops after the last `gate` stage (typically `validate`) to keep runs small and selection-focused.

### 5.4 Selection

Selection is controlled by swarm config:

- If `selection.require_all_gates_pass: true`, only passing candidates are eligible.
- If no eligible candidate exists, the generation records `selected_run_id: null` and the parent remains unchanged.

Default mode (`objectives`) ranks candidates lexicographically using the objective order/directions in `objectives.yaml` (e.g., maximize `overall`, then minimize `duration_ms`).

---

## 6) Artifacts Produced

### 6.1 Evolution run directory

The evolve command writes a top-level evolution run directory under `.cyntra/runs/`:

`.cyntra/runs/evolve_world_outora_library_<timestamp>/`

Required files:

- `context.json` (Universe join key)
- `evolve_world.json` (generation history + selections)

### 6.2 Candidate run directories

Each candidate produces a normal world run directory:

`.cyntra/runs/evo_medica_outora_library_seed42_g0_c0_<digest>/`

Typical contents include:

- `context.json`
- `manifest.json`
- `verdict/gate_verdict.json`
- optional `pruned_intermediates.json` (if intermediates were deleted to save disk)
- `world/outora_library.glb` (and other world outputs)
- optional renders under `render/`

### 6.3 Universe-scoped frontier

After completion, the Universe frontier for the world is refreshed:

`.cyntra/universes/medica/frontiers/outora_library.json`

This file stores nondominated sets per objective, pointing back to candidate `run_id`s and their objective metric values.

### 6.4 Universe indices (supporting)

Best-effort updates occur for:

- `.cyntra/universes/medica/index/runs.jsonl`
- `.cyntra/universes/medica/index/generations.jsonl`

---

## 7) Inspection / “Did It Work?”

### 7.1 Find the selected run

The CLI prints the selected candidate run id. It is also stored in:

- `.cyntra/runs/<evolve_run_id>/evolve_world.json` at `history[-1].selected_run_id`

### 7.2 Inspect the frontier

Open:

- `.cyntra/universes/medica/frontiers/outora_library.json`

Confirm:

- It contains the objective id (e.g. `realism_perf_v1`)
- `points[*].run_id` refers to real runs under `.cyntra/runs/`
- `values` contain objective metrics (e.g. `overall`, `duration_ms`)

### 7.3 Inspect the selected run artifacts

Open the selected candidate’s run directory:

- `.cyntra/runs/<selected_run_id>/`

Key files:

- `verdict/gate_verdict.json` (pass/fail + metrics)
- `world/outora_library.glb` (ship/view candidate)
- `render/beauty/*.png` (if render stage executed)

---

## 8) Operational Guidance (Tiny → Valuable)

### 8.1 Recommended “tiny” settings

- `--generations 2`
- `--population 3`
- `--seed 42` (or any fixed seed you want to baseline)

This keeps cost bounded while starting to accumulate frontier evidence.

### 8.2 Iteration loop

Once you have the first frontier points:

1. Re-run with the same seed to verify stability (and optionally reuse candidates).
2. Increase `--generations` slowly.
3. Expand `fab/worlds/outora_library/genome.yaml` with higher-leverage knobs once you trust the loop.

---

## 9) Acceptance Criteria (Quickstart Success)

This quickstart is considered successful when:

- `cyntra evolve ...` completes without error
- at least one candidate produces `verdict/gate_verdict.json`
- a selected candidate is printed (or clearly absent because all candidates failed gates)
- `.cyntra/universes/medica/frontiers/outora_library.json` exists and references candidate run ids
- the selected candidate’s `world/*.glb` exists and is viewable

---

## 10) Publish / View the “Best-Known” Asset (Recommended)

If you want the selected candidate to be immediately shippable/viewable, publish it into the Outora viewer (this overwrites the viewer’s `assets/exports/<world_id>.glb`):

```bash
fab-world publish --run .cyntra/runs/<selected_run_id> --viewer fab/assets/viewer
```

Then serve the viewer over HTTP:

```bash
(cd fab/assets/viewer && python3 -m http.server 8000)
```

Open `http://localhost:8000/` and load `outora_library.glb`.|

If you prefer a versioned export directory (no overwrite):

```bash
fab-world publish --run .cyntra/runs/<selected_run_id> --export fab/assets/exports/releases/
```

---

## 11) Troubleshooting

- Frontier file missing/stale: `cyntra universe frontiers rebuild medica --world outora_library`
- No candidates selected: check `.cyntra/runs/<evolve_run_id>/evolve_world.json` and candidate `verdict/gate_verdict.json` (likely all candidates failed gates with `require_all_gates_pass`).
- Metrics missing: ensure the evaluation reaches `validate` and writes `verdict/gate_verdict.json`.
- Blender segfaults on startup (macOS Metal): try `--factory-startup`, clear Blender prefs, or pin a known-good Blender build via `FAB_BLENDER=/path/to/Blender`; sandboxed environments may need to run Blender outside the sandbox.
- Disk full / huge runs: Outora Library can generate multi-GB intermediates (notably `world/*_baked.blend*`); use `fab-world prune --run .cyntra/runs/<run_id>` (keeps `stages/validate` by default), or delete old `.cyntra/runs/*`, then re-run.
