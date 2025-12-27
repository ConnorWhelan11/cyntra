# Cyntra Swarm Planner (URM-style) — Training Plan (v1)

Goal: train a **local-first, artifact-driven** policy model that chooses **swarm topology + budgets** from a **finite action space** (no free-form YAML generation).

This document supersedes `docs/models/training_draft.md` by (1) making explicit architectural/training decisions based on URM/UT literature, and (2) turning the draft into an executable, leakage-safe engineering plan with acceptance criteria.

---

## 0) Assessment of the draft (`training_draft.md`)

**Strong parts**

- Correctly identifies key Cyntra hook points (runner/dispatcher/controller) and relevant artifacts (`manifest.json`, `rollout.json`, `.cyntra/runs/*`).
- Proposes a deterministic “similar runs” retrieval strategy and leakage-safe time splitting.
- Keeps the contract-first approach (planner input/output schemas) and suggests recording executed plans to avoid label inference ambiguity.

**Gaps / changes needed**

- URM training harness is currently blocked: `train/URM/pretrain.py` imports `utils.load_model_class/get_model_source_path`, but `utils.py` is missing in `train/URM/`.
- Draft assumes reusing URM’s ACT-style carry/halting loop; for v1 we should **avoid ACT** and train with **fixed compute** (recurrent refinement without dynamic halting), then add adaptive compute later if needed.
- Draft’s planner action is partially coupled to today’s kernel implementation (`speculate_parallelism` / toolchain candidates). We should formalize an action space that:
  - is stable across system refactors,
  - maps cleanly to enforcement points,
  - supports masking for job-type-specific knobs.
- Evaluation needs offline metrics that detect collapse (always selecting one swarm) and measure cost–quality tradeoffs, plus calibration for safe fallbacks.

---

## 1) Scope and non-goals (v1)

**In scope (v1)**

- Planner decides:
  - `swarm_id` (topology)
  - budget bins: `max_minutes_bin`, `max_candidates_bin`, `max_iterations_bin` (some bins may be N/A depending on job type)
- Planner inputs:
  - `universe.yaml` defaults + relevant policy envelopes
  - issue metadata/tags
  - last N **similar run summaries** (artifact-derived, leakage-safe)
- Training is **supervised imitation first**, then upgraded to counterfactual best-of-K labeling.

**Out of scope (v1)**

- Choosing exact toolchain sets (router over `{codex, claude, opencode, crush}`); this is v2+.
- Online learning / autonomous policy updates during production runs.
- Any free-form YAML/text generation; the model only emits structured categorical decisions.

---

## 2) Contracts (artifacts + schemas)

### 2.1 `planner_input.v1`

Write as JSON and validate with a new schema:

- `kernel/schemas/cyntra/planner_input.schema.json`

Required fields (v1)

- `schema_version`: `"cyntra.planner_input.v1"`
- `created_at`: RFC3339 string
- `universe_id`: string
- `job_type`: string (match `manifest["job_type"]`, e.g. `"code"`, `"fab-world"`)
- `universe_defaults`: `{ swarm_id?: string, objective_id?: string }`
- `issue`: minimal issue descriptor:
  - `issue_id`, `dk_risk`, `dk_size`, `dk_priority`, `dk_tool_hint`, `dk_attempts`
  - `tags`: bounded list of strings
- `history`: `{ last_n_similar_runs: run_summary.v1[] }` where N is fixed (start with `N=8`)
- `action_space`: explicit enums and bin edges used for the label space (so training/inference always agree)

### 2.2 `planner_action.v1`

Write as JSON and validate with:

- `kernel/schemas/cyntra/planner_action.schema.json`

Required fields (v1)

- `schema_version`: `"cyntra.planner_action.v1"`
- `created_at`: RFC3339 string
- `swarm_id`: enum
- `budgets`:
  - `max_minutes_bin`: enum (may be `"NA"` for job types where it isn’t enforceable yet)
  - `max_candidates_bin`: enum
  - `max_iterations_bin`: enum (may be `"NA"`)

Optional metadata (not part of the action space)

- `model`: `{ checkpoint_id: string, git_sha?: string, version?: string }`
- `probs`: per-head probabilities/logits summary (for analysis)
- `confidence`: calibrated scalar in `[0,1]`
- `abstain_to_default`: boolean + `reason`

---

## 3) Action space definition (finite + enforceable)

Action design principle: each bin must map to a **specific enforcement point** in code and be **stable** under refactors.

### 3.1 `swarm_id` (topology)

- Initial enum (from `universes/*/swarms.yaml`): `{serial_handoff, speculate_vote}`
- Future swarms add new enum values; avoid renaming.

### 3.2 Budget bins

`max_candidates_bin` (v1)

- Enum: `{1, 2, 3}`
- Kernel mapping:
  - Maps to speculation parallelism in `kernel/src/cyntra/kernel/runner.py:_dispatch_speculate_async()`
  - If `swarm_id=serial_handoff`, treat as `1` (masked/forced).
- World evolution mapping:
  - Maps to `population_size` in `kernel/src/cyntra/universe/evolve_world.py:evolve_world()`

`max_minutes_bin` (v1 schema; enforcement in P3/P4)

- Enum: `{15, 30, 45, 60, 120, "NA"}`
- Kernel enforcement option:
  - Add a `timeout_seconds_override` to the workcell manifest (e.g., `manifest["planner"]["timeout_seconds"]`)
  - Teach `kernel/src/cyntra/kernel/dispatcher.py:dispatch_async()` to prefer override over toolchain default timeout.
- World evolution enforcement option:
  - Prefer universe-level envelope (`UniverseConfig.policies.budgets.max_run_minutes`) and allow a per-run override if needed.

`max_iterations_bin` (v1 schema; limited scope in v1)

- Enum: `{1, 2, 3, 5, "NA"}`
- First enforcement target (Fab iteration loops):
  - Hook into Fab iteration config where `max_iterations` is already a first-class knob (`kernel/src/cyntra/fab/iteration.py` / `kernel/src/cyntra/fab/config.py`).
- For pure code issues, initially `"NA"`.

### 3.3 Masking rules (job-type specific)

At training + inference, apply a mask so the model cannot select nonsensical combinations:

- `job_type="code"`:
  - `max_iterations_bin="NA"`
- `job_type="fab-world"`:
  - all three budgets are valid (depending on chosen integration)

Record the exact mask rules inside `planner_input.v1.action_space` so artifacts are self-describing.

---

## 4) Run history representation (local-first, bounded, leakage-safe)

### 4.1 `run_summary.v1` (compact, predictive, deterministic)

Do **not** feed raw logs. Use stable, bounded fields:

- `run_id`
- `started_ms` (or RFC3339)
- `job_type`, `domain` (`code` / `fab_asset` / `fab_world`)
- `action_executed`: what Cyntra actually did:
  - `swarm_id` (or inferred: serial vs speculate)
  - `parallelism` (count)
  - (optional) `toolchains_used` (for analysis; v2 label source)
- `outcome`:
  - `status`: success/failed/timeout
  - `fail_codes`: bounded list
  - `gates`: `{name, passed, score?}` (bounded top-K)
- `cost` / `runtime`:
  - `duration_ms`
  - `token_in/token_out` if available
  - `cost_usd_est` if available

Sources:

- Workcells: prefer `rollout.json` if present (`kernel/src/cyntra/rollouts/builder.py`), else fall back to archived `manifest.json` + `proof.json`.
- World runs: `.cyntra/runs/<run_id>/manifest.json` + stage results.

### 4.2 Similar-runs retrieval

Implement deterministic retrieval (module suggestion):

- `kernel/src/cyntra/planner/similar_runs.py`

Candidate filter:

- same `job_type` / `domain`
- (if world run) same `world_id` and `objective_id` when available

Scoring:

- tag overlap (Jaccard)
- recency bucket
- optional “failure-mode match” overlap (shared fail codes / failing gate names)

Tie-break (deterministic):

- `(score desc, started_ms desc, run_id asc)`

### 4.3 Leakage control (required)

Dataset split:

- time-based split by `started_ms`: train/val/test = 80/10/10

Retrieval constraint:

- when building `last_n_similar_runs` for example `E`, only consider runs with `started_ms < E.started_ms`.

---

## 5) Models to train (baselines → URM)

### 5.1 Required baselines (must ship with v1)

Baselines are essential to detect “URM complexity without gains”.

- `Heuristic baseline`: mimic current behavior (`scheduler.should_speculate()` + routing/speculation defaults + `ExplorationController.decide()`).
- `Feature MLP baseline`: engineered features from `planner_input.v1` (no tokenization).
- `Plain Transformer encoder`: single-pass encoder + multi-head classification.

### 5.2 URM-style recurrent transformer (v1 decision: fixed compute, no ACT)

Key decisions for v1:

- **No ACT / no dynamic halting**: fixed number of refinement loops.
- **Recurrent refinement with weight tying** (UT-style): repeat the same block(s) `M` times.
- **TBPTL** (URM-style): run early loops forward-only, backprop only through the last `K` loops.

Suggested starting ranges:

- `seq_len`: 512–2048 tokens (depending on N and per-run summary budget)
- `d_model`: 256–512
- `layers`: 4–8
- `heads`: 4–8
- `loops M`: 4–16
- `TBPTL`: backprop through last `K ∈ {4, 8, 12}` loops
- MLP: `SwiGLU` baseline, `ConvSwiGLU(kernel=2)` variant (URM default)

### 5.3 Output heads (multi-head classification)

Predict each component as its own categorical head:

- `head_swarm_id`
- `head_max_candidates_bin`
- `head_max_minutes_bin`
- `head_max_iterations_bin`

Loss:

- weighted sum of cross-entropies; start equal weights and add cost-sensitive weighting only after baseline eval.

Calibration:

- per-head temperature scaling on the validation split; export calibration params with the checkpoint.

---

## 6) Training pipeline (URM codebase adaptation)

### 6.1 Unblock training harness

Fix `train/URM/pretrain.py` missing dependency:

- add `train/URM/utils.py` implementing:
  - `load_model_class(path: str, prefix: str | None = None)`
  - `get_model_source_path(path: str)`

Acceptance: `torchrun --nproc-per-node 1 train/URM/pretrain.py ...` can import and start.

### 6.2 Dataset builder

Add:

- `train/URM/data/build_cyntra_planner_dataset.py`

Responsibilities:

- ingest `.beads/issues.jsonl` + `.cyntra/archives/*` + `.cyntra/runs/*`
- build `planner_input.v1` examples
- emit URM-friendly memmaps + `dataset.json` (mirroring `train/URM/data/build_arc_dataset.py`)
- enforce time splits and retrieval leakage rules
- record `dataset_hash` and the action-space spec used

### 6.3 Training entrypoints/configs

Add Hydra configs:

- `train/URM/config/arch/urm_planner.yaml` (URM-style encoder + planner heads)
- `train/URM/config/arch/transformer_planner.yaml` (baseline)
- `train/URM/config/arch/mlp_planner.yaml` (baseline)

Add eval script:

- `train/URM/evaluate_planner_model.py`

---

## 7) Offline evaluation (what “good” means)

Always report (per split + per domain/job_type):

- per-head accuracy
- full-tuple exact match (`swarm_id + budgets`)
- cost proxies: average `duration_ms`, and “success under budget”
- collapse metrics: entropy of `swarm_id` and `max_candidates_bin`
- calibration: ECE + abstain rate + abstain outcome quality

If/when counterfactual best-of-K labels exist:

- regret vs best-of-K under objective (`pass gates first, then duration/cost`)

Required ablations:

- `N` similar runs: `{0, 1, 4, 8, 16}`
- token budget per run summary
- loops `M` and TBPTL window `K`
- ConvSwiGLU on/off

---

## 8) Cyntra integration (feature-flagged, provenance-first)

### 8.1 Where to call the planner

Kernel runs:

- decision boundary before speculating:
  - `kernel/src/cyntra/kernel/runner.py:_dispatch_parallel()` (choose serial vs speculate)
- apply `max_candidates_bin`:
  - `kernel/src/cyntra/kernel/runner.py:_dispatch_speculate_async()` (override parallelism)
- apply `max_minutes_bin` (if implemented):
  - `kernel/src/cyntra/kernel/dispatcher.py:dispatch_async()` (override timeout)

World evolution:

- in `kernel/src/cyntra/cli.py` evolve path (choose swarm/population budgets)

### 8.2 What to record

Record both:

- `planner_input.v1` (exact context used)
- `planner_action.v1` (predicted action + probs/confidence)
- `executed_plan` (what was actually run after masking and safety fallbacks)

Attach to:

- `manifest.json` under `manifest["planner"]`
- `rollout.json` under `rollout["planner"]` (or equivalent for world runs)

### 8.3 Safety fallback

If `confidence < threshold`:

- fallback to universe defaults (`universe.defaults.swarm_id`) and current controller behavior for budgets.

---

## 9) Phased execution plan (P0 → P5)

### P0 — Plumbing spike (1–2 days)

- Restore URM training harness (`train/URM/utils.py`).
- Build a tiny dataset (e.g., 100 examples) and train a baseline MLP to validate end-to-end.
- Acceptance: dataset build + 100 training steps + eval runs without crashes.

### P1 — Contracts + deterministic dataset (2–4 days)

- Add `planner_input/action` schemas.
- Implement `build_cyntra_planner_dataset.py` with leakage-safe retrieval + time splits.
- Acceptance: dataset is deterministic (same hash) and schema-valid.

### P2 — Baselines + offline metrics (2–4 days)

- Implement heuristic baseline and Transformer baseline.
- Implement evaluation metrics (exact match, entropy/collapse, calibration).
- Acceptance: baselines produce stable metrics on held-out time slice.

### P3 — URM recurrent model (3–7 days)

- Implement URM-style recurrent encoder (fixed compute + TBPTL) + multi-head outputs.
- Run ablations (N, M, K, ConvSwiGLU).
- Acceptance: URM beats baselines on at least one primary metric (exact match or objective-weighted score) without worsening collapse/calibration.

### P4 — Feature-flagged kernel integration (2–5 days)

- Add planner inference module in `kernel/src/cyntra/planner/`.
- Wire into runner/dispatcher; record artifacts.
- Acceptance: `cyntra run --planner-enabled --planner-checkpoint ...` runs successfully and artifacts contain both predicted and executed plans.

### P5 — Counterfactual best-of-K labeling (ongoing)

- Add an evaluation harness that runs K candidate actions per context (bounded budgets) and labels the winner under the universe objective.
- Retrain with best-of-K labels; report regret vs best-of-K.
- Acceptance: offline regret improves and online behavior remains stable under safety budgets.

---

## 10) Risks and mitigations

- **Training instability with recurrence** → use TBPTL (forward-only early loops), keep M modest initially.
- **Policy collapse** → imbalance-aware loss, entropy monitoring, ensure dataset has sufficient action diversity (or generate it via P5).
- **Leakage via similar-run retrieval** → strict `started_ms` gating; time-based splits; unit test retrieval.
- **Offline/online mismatch** → keep v1 conservative; add counterfactual bench before trusting improvements.
- **Operational safety** → confidence-gated fallback to defaults; hard caps on parallelism and timeouts.

---

## 11) Open questions to resolve before implementation

1. Should v2 include **toolchain set selection** (router) as part of the action space?
2. Do we want a single multitask model across `job_type` values, or separate per-job models?
3. Which budgets are enforceable in the kernel immediately (timeout override), vs only for world/fab pipelines?
