# Cyntra Swarm Planner — Training + Integration Spec (v1)

**Status:** Final spec plan (consolidates `docs/models/training_plan.md` + `docs/models/training_critique.md`)  
**Last updated:** 2025-12

This document defines an **artifact-driven, local-first** training and deployment plan for a **Swarm Planner policy model** that selects **swarm topology + budgets** from a **finite action space**. It is designed to integrate into Cyntra’s existing kernel without requiring free-form YAML generation.

---

## 1) Goals and non-goals

### 1.1 Goals

Build a planner policy that:

- **Inputs**: universe defaults + issue metadata + bounded history of similar runs (+ optional system state).
- **Outputs** (finite structured action):
  - `swarm_id`
  - budgets/stop conditions (categorical bins): `max_minutes_bin`, `max_candidates_bin`, `max_iterations_bin`
- Is **local-first** (no hosted dependencies required for training or inference).
- Is **artifact-driven** (all training data derived from `.cyntra/*` and `.beads/*` artifacts).
- Is **safe by default** (calibrated confidence with deterministic fallback to current behavior).

### 1.2 Non-goals (v1)

- Toolchain routing (choosing `{codex, claude, opencode, crush}` sets) as part of the action space. This is v2+.
- Full offline RL (CQL/IQL) or MDP trajectory learning. This is v3+ after bench + logging maturity.
- Free-form config generation (YAML/text). The model only emits discrete bins.

---

## 2) Terminology (mapping to repo)

- **Universe**: `universes/*/universe.yaml` + catalogs (`swarms.yaml`, `objectives.yaml`).
- **Swarm**: coordination topology (e.g., `speculate_vote`, `serial_handoff`) in `universes/*/swarms.yaml`.
- **Issue run (kernel)**: workcell dispatch from `.beads/issues.jsonl`, archived under `.cyntra/archives/*`.
- **World run (fab-world)**: deterministic world evolution runs under `.cyntra/runs/*`.
- **Executed plan**: what Cyntra actually ran (after availability, masking, and fallbacks).

---

## 3) Planner interface contracts (schemas + artifacts)

### 3.1 `planner_input.v1` (required)

**Artifact:** JSON (stored for provenance).  
**Schema:** `kernel/schemas/cyntra/planner_input.schema.json` (new).

Required fields:

- `schema_version`: `"cyntra.planner_input.v1"`
- `created_at`: RFC3339 string
- `universe_id`: string
- `job_type`: string (match `manifest["job_type"]`, e.g. `"code"`, `"fab-world"`)
- `universe_defaults`: `{ swarm_id?: string, objective_id?: string }`
- `issue`:
  - `issue_id`: string
  - `dk_priority`: `"P0"|"P1"|"P2"|"P3"`
  - `dk_risk`: `"low"|"medium"|"high"|"critical"`
  - `dk_size`: `"XS"|"S"|"M"|"L"|"XL"`
  - `dk_tool_hint`: string|null
  - `dk_attempts`: int
  - `tags`: list[string] (bounded)
- `history`:
  - `last_n_similar_runs`: list[`run_summary.v1`] (N fixed; default `N=8`)
- `action_space`:
  - explicit enums/bin definitions for outputs + validity rules (so training/inference agree)
- `system_state` (optional/nullable in v1, but start logging immediately):
  - `active_workcells_bin`
  - `queue_depth_bin`
  - `available_toolchains`: list[string]
  - `toolchain_health`: per-toolchain recent pass-rate bin or float
  - `hour_bucket`
  - `budget_remaining_bin` (if applicable)

### 3.2 `planner_action.v1` (required)

**Artifact:** JSON (stored for provenance).  
**Schema:** `kernel/schemas/cyntra/planner_action.schema.json` (new).

Required fields:

- `schema_version`: `"cyntra.planner_action.v1"`
- `created_at`: RFC3339 string
- `swarm_id`: enum (from universe swarms catalog)
- `budgets`:
  - `max_minutes_bin`: enum (may be `"NA"` where unenforceable)
  - `max_candidates_bin`: enum (may be `"NA"` where inapplicable)
  - `max_iterations_bin`: enum (may be `"NA"` where inapplicable)

Optional fields:

- `probs`: `{ head_name: [float...] }` (or top-k summary)
- `confidence`: float in `[0,1]` (calibrated)
- `abstain_to_default`: boolean + `reason`
- `model`: `{ checkpoint_id: string, version?: string, git_sha?: string }`
- `input_hash`: string (hash of normalized `planner_input.v1`)

### 3.3 `executed_plan.v1` (required for labels)

We must be able to label “what actually ran” without inference hacks.  
Implement as `manifest["planner"]["executed_plan"]` (or a sibling JSON file) and archive it.

Minimum:

- `swarm_id_executed`
- `parallelism_executed` / `max_candidates_executed`
- `timeout_seconds_executed` (if enforced)
- `fallback_applied`: boolean + reason (e.g., “low_confidence”, “toolchain_unavailable”)

---

## 4) Action space (finite + enforceable)

Design principle: every action component must map to a **specific enforcement point** in code.

### 4.1 v1 action components

**Topology**

- `swarm_id ∈ {serial_handoff, speculate_vote}` (initially; pulled from `universes/*/swarms.yaml`)

**Budgets**

- `max_candidates_bin ∈ {1,2,3,"NA"}`
  - Kernel mapping: parallelism cap in `kernel/src/cyntra/kernel/runner.py:_dispatch_speculate_async()`
  - World mapping: `population_size` in `kernel/src/cyntra/universe/evolve_world.py:evolve_world()`
- `max_minutes_bin ∈ {15,30,45,60,120,"NA"}`
  - Kernel mapping (v1 recommended): allow `manifest["planner"]["timeout_seconds_override"]`; use it in `kernel/src/cyntra/kernel/dispatcher.py:dispatch_async()` to override toolchain timeout.
  - World mapping: enforce via universe/world policy envelopes or per-run override.
- `max_iterations_bin ∈ {1,2,3,5,"NA"}`
  - Fab mapping: wire into iteration config where `max_iterations` is already a first-class parameter (`kernel/src/cyntra/fab/iteration.py` / `kernel/src/cyntra/fab/config.py`).
  - Code jobs: `"NA"` (v1).

### 4.2 Validity/masking rules (mandatory)

Examples (v1 defaults):

- If `swarm_id=serial_handoff` → `max_candidates_bin=1`.
- If `job_type="code"` → `max_iterations_bin="NA"`.
- If `job_type="fab-world"` → `max_candidates_bin!="NA"` (population required).

**Implementation requirement:** during training and inference, invalid options are masked (`-inf` logits or invalid tuples removed).

### 4.3 Joint validity set (for inference + baseline)

Define `VALID_ACTIONS` deterministically from:

- action enums
- validity/masking rules

Use `VALID_ACTIONS` for:

- a joint-action baseline classifier, and
- robust decoding for multi-head models by selecting:
  - `argmax_a ∈ VALID_ACTIONS Σ_h log p_h(a_h)`

---

## 5) Run-history representation

### 5.1 `run_summary.v1` (bounded, predictive)

Goal: compact signals that predict success/cost without logs.

Required fields:

- `run_id`
- `started_ms` (or RFC3339)
- `job_type` + derived `domain` (`code|fab_asset|fab_world`)
- `action_executed`: `{ swarm_id?, max_candidates?, max_minutes?, max_iterations? }`
- `outcome`:
  - `status`: `success|failed|timeout`
  - `fail_codes`: bounded list (top-k)
  - `gates`: bounded list of `{name, passed, score?}`
- `runtime`: `{duration_ms}`
- optional: `{cost_usd_est?, tokens_in?, tokens_out?}`

Sources:

- Workcells: prefer `rollout.json` (built by `kernel/src/cyntra/rollouts/builder.py`), else `manifest.json` + `proof.json`.
- World runs: `.cyntra/runs/<run_id>/manifest.json` + stage metadata (as used by `kernel/src/cyntra/universe/index.py`).

### 5.2 Similar-runs retrieval (deterministic, leakage-safe)

Module: `kernel/src/cyntra/planner/similar_runs.py` (new).

Candidate filter:

- same `job_type` / domain
- if world run: same `world_id` + `objective_id` when available

Score components:

- tag overlap (Jaccard)
- failure-signal overlap (gate names / fail codes)
- recency bucket
- optional: keyword overlap from issue description (cheap, deterministic)

Tie-break:

- `(score desc, started_ms desc, run_id asc)`

### 5.3 Leakage control (required)

Dataset splits:

- time-based split by `started_ms`: train/val/test = `80/10/10`

Retrieval constraint:

- when building `last_n_similar_runs` for example E, only use runs with `started_ms < E.started_ms`.

---

## 6) Tokenization (deterministic, compositional, bounded vocab)

### 6.1 Sequence layout

Concatenate structured sections with separators:

- `[BOS]`
- Universe section (defaults + policies)
- `[SEP]`
- Issue section (risk/size/tags + extracted keywords)
- `[SEP]`
- System state section (optional, nullable)
- `[SEP]`
- Repeated run summaries (most recent first): `RUN_i` blocks with `[SEP]` between
- `[EOS]`

### 6.2 Compositional key/value tokens

Avoid “flat KEY=VALUE” tokens. Use:

- `[KEY:<name>] [=] [VAL:<value>]`

Open-set fields (tags/keywords):

- hash into fixed buckets:
  - `[TAG_HASH_0..TAG_HASH_1023]`
  - `[KW_HASH_0..KW_HASH_1023]`

This preserves local-first determinism while avoiding OOV collapse.

### 6.3 Numeric features

Use bins as categorical values (still compositional), e.g.:

- `[KEY:QUEUE_DEPTH_BIN] [=] [VAL:0_5]`
- `[KEY:DURATION_BIN] [=] [VAL:10_30S]`

### 6.4 Token budget

Defaults (tune via ablations):

- `N_similar_runs ∈ {0,1,4,8,16}`
- `max_tokens_per_run_summary`: 32–64
- `seq_len`: 512–2048 (depending on N)

---

## 7) Models and objectives (baselines first, URM by ablation)

### 7.1 Baselines (required)

1. **Heuristic baseline**: reproduce current behavior from:
   - `kernel/src/cyntra/kernel/scheduler.py:should_speculate()`
   - `kernel/src/cyntra/control/exploration_controller.py:decide()`
2. **Feature MLP**: tabular features from `planner_input.v1` (no sequence model).
3. **Plain Transformer encoder**: single-pass encoder over token sequence.

### 7.2 URM/UT recurrent encoder (optional in v1)

Allowed only if it beats baselines on outcome-based metrics.

Design:

- fixed recurrence loops `M` (no ACT)
- weight tying across loops (UT-style)
- TBPTL: backprop through last `K` loops
- MLP variant: `SwiGLU` baseline and `ConvSwiGLU(kernel=2)` variant

### 7.3 Output heads and decoding

Primary model interface: **multi-head masked classification**

- heads: `swarm_id`, `max_candidates_bin`, `max_minutes_bin`, `max_iterations_bin`
- mask invalid choices

Baseline/diagnostic: **joint-action classifier**

- logits over `VALID_ACTIONS`

Robust decoding (recommended even for multi-head):

- choose `a* = argmax_{a ∈ VALID_ACTIONS} Σ_h log p_h(a_h)`

### 7.4 Training objectives (v1)

Stage A (bootstrap): supervised imitation on `executed_plan.v1`.

- Loss: weighted sum of cross-entropy losses (start equal weights).
- Handle imbalance: class weighting or focal loss if needed.

Stage B (primary): outcome-based training on best-of-K “winner” labels.

- Label per example is the best action among evaluated candidates under objective:
  - prefer pass-all-gates, then minimize duration/cost (aligned to universe objectives).

For a more powerful formulation (learn `Q(x,a)` outcomes and derive the policy via constrained optimization + optional safe exploration/OPE), see:

- `docs/models/swarm_planner_outcome_value_model_spec.md`

Calibration:

- temperature scaling per head on validation split.
- produce a scalar `confidence` (max prob or entropy-based) used for abstain.

---

## 8) Offline evaluation (what “good” means)

### 8.1 Diagnostics (always)

- per-head accuracy (for label-learning sanity only)
- exact-match accuracy on the full action tuple
- collapse metrics: action distribution entropy, top-1 frequency
- calibration: ECE + abstain rate

### 8.2 Primary outcome metrics (requires best-of-K bench)

- `pass_rate`
- `cost_per_pass` (or duration-per-pass if cost unavailable)
- `mean_time_to_pass`
- regret vs oracle-in-bench (best action among evaluated candidates)

### 8.3 Required ablations

- `N_similar_runs ∈ {0,1,4,8,16}`
- token budget per run summary
- architecture: MLP vs Transformer vs (optional) recurrent URM
- decoding: multi-head masked vs joint-action vs autoregressive
- recurrence: `M`, TBPTL window `K`, ConvSwiGLU on/off

---

## 9) Best-of-K outcome bench (label generator + evaluator)

Purpose:

- generate counterfactual labels (“which action was best for this context?”)
- provide offline outcome metrics and regret

### 9.1 Candidate set

For each example, choose K actions from `VALID_ACTIONS`:

- deterministic selection from a seeded sampler, or
- coverage-based selection ensuring diversity (include baseline action + top alternatives).

### 9.2 Execution

Code issues:

- add a feature-flagged override in the runner to force:
  - `serial_handoff` vs `speculate_vote`
  - parallelism cap
  - timeout override

World runs:

- call `evolve_world` with chosen `swarm_id` and `population_size` (and any enforced budgets).

### 9.3 Determinism + cost caps

- Fix seeds (where supported) and run with deterministic policies (`pythonhashseed`, CPU-only for fab).
- Enforce strict caps per candidate (minutes, iterations, max candidates).

### 9.4 Label rule

Select the best candidate using:

1. `all_required_gates_passed` (hard constraint)
2. objective metrics (e.g., maximize `overall`, minimize `duration_ms`)
3. deterministic tie-breaks

Store:

- all candidate outcomes
- chosen winner action
- bench config hash

---

## 10) Cyntra kernel integration (feature-flagged, provenance-first)

### 10.1 Where inference runs

Kernel issues:

- decide serial vs speculate: `kernel/src/cyntra/kernel/runner.py:_dispatch_parallel()`
- apply parallelism cap: `kernel/src/cyntra/kernel/runner.py:_dispatch_speculate_async()`
- apply timeout override: `kernel/src/cyntra/kernel/dispatcher.py:dispatch_async()`

World evolution:

- evolve CLI path (choose swarm/population/budgets): `kernel/src/cyntra/cli.py` evolve command.

### 10.2 What to record (required)

For every planned run:

- attach `planner_input.v1`, `planner_action.v1`, and `executed_plan.v1` to `manifest.json` under `manifest["planner"]`
- copy the same fields into `rollout.json` (or world-run equivalents)

### 10.3 Safety fallback (required)

If any of the following:

- inference failure
- `confidence < threshold`
- action violates hard safety caps

Then:

- fallback to current behavior (universe defaults + existing controller)
- record `fallback_applied=true` with reason

---

## 11) Inference packaging (no torch in kernel)

Target: keep kernel lean; avoid importing torch.

v1 recommended:

- Export trained model to **ONNX** (CPU inference).
- Run inference using **onnxruntime** inside the kernel, or via a small sidecar process.

Deliverables:

- `planner.onnx` + `vocab.json` + `action_space.json` + `calibration.json`
- a versioned `PlannerModelBundle` directory layout.

---

## 12) Implementation plan (phases with acceptance criteria)

### P0 — Feasibility gates (1–5 days)

- Count examples available (by domain); stop if insufficient.
- Build minimal dataset and train a trivial baseline (MLP).
- Acceptance:
  - dataset size meets minimum threshold (set per domain; start at 500+ for “code” if possible)
  - label consistency for near-duplicate inputs is acceptable (target 80%+ agreement)
  - loss improves vs random baseline; no NaNs; stable gradients

### P1 — Contracts + deterministic dataset (2–6 days)

- Add schemas for `planner_input.v1` and `planner_action.v1`.
- Implement deterministic dataset builder + leakage-safe retrieval + time splits.
- Acceptance:
  - repeated builds yield identical dataset hash
  - schema validation passes

### P2 — Outcome bench (small slice) + baseline models (3–10 days)

- Implement best-of-K bench harness on a bounded slice.
- Train Transformer baseline; evaluate with outcome metrics.
- Acceptance:
  - bench produces stable outcomes and winner labels
  - baselines evaluated on regret/cost-per-pass vs oracle-in-bench

### P3 — URM recurrence (optional) + ablations (3–14 days)

- Implement recurrent encoder (fixed M, TBPTL) and compare to baselines.
- Acceptance:
  - recurrent model demonstrates measurable lift on primary outcome metrics or calibration/collapse metrics

### P4 — Kernel integration + ONNX packaging (3–14 days)

- Add planner inference module and feature flag.
- Export ONNX and load with onnxruntime (or sidecar).
- Acceptance:
  - planner-enabled runs succeed; artifacts contain predicted + executed plans
  - fallback works deterministically

### P5 — Expand labels + continuous improvement (ongoing)

- Increase bench coverage; broaden action set; incorporate system_state features as they become logged.
- Track drift, update calibration, and rerun ablations periodically.

---

## 13) Open questions (must be answered to lock v2 scope)

1. Should v2 include **toolchain set routing** as part of the action space?
2. Which budgets are truly enforceable for code issues (timeout override vs toolchain config)?
3. What is the acceptable cost envelope for best-of-K labeling (K, minutes, issue set size)?
4. Deployment target: onnxruntime in-kernel vs sidecar (ops preference)?
