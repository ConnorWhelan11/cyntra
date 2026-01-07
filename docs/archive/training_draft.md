• ## 1) Repo maps (what I inspected + why)

### URM (local copy at train/URM/)

- train/URM/pretrain.py — Hydra entrypoint, distributed setup, dataset wiring (create_dataloader), model construction (create_model), train loop (train_batch), eval loop (evaluate).
- train/URM/evaluate_trained_model.py — checkpoint loading conventions + eval invocation via pretrain.evaluate().
- train/URM/puzzle_dataset.py + train/URM/data/common.py — dataset format (dataset.json + \*.npy memmaps), batching and sharding behavior.
- train/URM/models/urm/urm.py — URM forward signature, loop/halting mechanism (URMCarry, URM.forward, URM_Inner.forward).
- train/URM/models/hrm/hrm_act_v1.py — ACT/TBPTT pattern (many no-grad cycles + 1-step grad), halting policy.
- train/URM/models/losses.py — ACTLossHead contract expected by pretrain.py (carry, loss, metrics, preds, all_finish).
- train/URM/models/layers.py — embedding + attention blocks used by URM/HRM (for understanding encoder reuse).
- train/URM/config/cfg_pretrain.yaml, train/URM/config/arch/\*.yaml — Hydra config knobs + arch selection pattern.
- train/URM/data/build_arc_dataset.py — canonical dataset artifact layout (how .npy + dataset.json are written).
- train/URM/scripts/URM_arcagi1.sh — real invocation style + override patterns.
- train/URM/evaluators/arc.py — how eval expects outputs (required_outputs), useful to mirror for planner eval.

Important gap: train/URM/pretrain.py imports utils.load_model_class / utils.get_model_source_path, but there is no train/URM/utils.py and python -c "import utils" fails in that
directory. Any plan that reuses pretrain.py must either (a) restore utils.py or (b) refactor pretrain.py to avoid it.

———

### Cyntra (local workspace)

- Universe spec + catalogs:
  - universes/medica/universe.yaml, universes/medica/swarms.yaml, universes/medica/objectives.yaml
  - kernel/src/cyntra/universe/config.py:load_universe() + schema checks in kernel/schemas/cyntra/universe.schema.json, swarms.schema.json, objectives.schema.json
  - kernel/src/cyntra/universe/policy.py:apply_universe_policies() (budgets/env/routing overrides)
  - kernel/src/cyntra/universe/run_context.py + kernel/schemas/cyntra/run_context.schema.json
- Kernel decision points to “plug in” a Swarm Planner:
  - kernel/src/cyntra/kernel/scheduler.py (schedule(), should_speculate())
  - kernel/src/cyntra/kernel/runner.py (\_dispatch_single_async(), \_dispatch_speculate_async(), \_dispatch_parallel())
  - kernel/src/cyntra/kernel/dispatcher.py (\_route_toolchain(), \_build_manifest())
  - kernel/src/cyntra/kernel/routing.py (ordered_toolchain_candidates(), speculate_toolchains(), speculate_parallelism())
  - kernel/src/cyntra/control/exploration_controller.py (decide(), speculate_parallelism()) — current heuristic controller to imitate initially
- Artifacts + telemetry + summaries:
  - .cyntra/config.yaml (routing/speculation defaults)
  - .beads/issues.jsonl and kernel/src/cyntra/state/models.py:Issue
  - Workcells and archives: kernel/src/cyntra/workcell/manager.py (archives manifest.json, proof.json, telemetry.jsonl, optionally rollout.json)
  - Telemetry contract: kernel/src/cyntra/adapters/telemetry.py
  - Rollout summary builder: kernel/src/cyntra/rollouts/builder.py:build_rollout() + kernel/schemas/cyntra/rollout.schema.json
  - Dynamics DB ingest path: kernel/src/cyntra/dynamics/transition_logger.py:build_transitions() + transition_db.py
  - World-run indexing: kernel/src/cyntra/universe/index.py:build_runs_index() (useful for “similar world runs”)

———

## 2) Minimal Swarm Planner interface spec

### planner_input.v1 (canonical input record)

Implement as a JSON-serializable dict and optionally validate via a new schema (recommended: kernel/schemas/cyntra/planner_input.schema.json).

Required fields

- schema_version: "cyntra.planner_input.v1"
- universe_id: string (match RunContext shape in kernel/src/cyntra/universe/run_context.py)
- job_type: string (align with manifest["job_type"] in kernel/src/cyntra/kernel/dispatcher.py:\_build_manifest())

Optional/nullable universe fields

- world_id: string|null (world evolution)
- objective_id: string|null
- universe_defaults: { swarm_id?: str, objective_id?: str } (from UniverseConfig.defaults in kernel/src/cyntra/universe/config.py)
- universe_policies: { budgets?: { max_concurrent_workcells?: int, max_run_minutes?: int }, determinism?: {...} } (from UniverseConfig.policies)

Issue fields (from Beads + manifest)

- issue: object
  - issue_id: string (from .beads/issues.jsonl or manifest["issue"]["id"])
  - dk_priority: "P0"|"P1"|"P2"|"P3" (see kernel/src/cyntra/state/models.py:Issue)
  - dk_risk: "low"|"medium"|"high"|"critical"
  - dk_size: "XS"|"S"|"M"|"L"|"XL"
  - dk_tool_hint: string|null
  - dk_attempts: int
  - dk_estimated_tokens: int (or bucketed int)
  - tags: list[str] (bounded; sourced from Issue.tags and/or manifest["issue"]["tags"])

History fields (bounded, no leakage)

- last_N_similar_runs: list of run_summary.v1 (N fixed, e.g. 8)
  - Prefer deriving these from cyntra.rollout.v1 produced by kernel/src/cyntra/rollouts/builder.py, and from world run metadata indexed by kernel/src/cyntra/universe/
    index.py.

———

### planner_action.v1 (finite action schema)

Implement as a dict and validate via kernel/schemas/cyntra/planner_action.schema.json (recommended).

Action tuple (all finite)

- schema_version: "cyntra.planner_action.v1"
- swarm_id: enum of known swarm ids (start with universe swarms: speculate_vote, serial_handoff from universes/medica/swarms.yaml)
- parallelism_bucket: enum {1,2,3}
  - Maps to candidate toolchain count in kernel/src/cyntra/kernel/runner.py:\_dispatch_speculate_async()
- max_run_minutes_bucket: enum {15,30,60,120} (or whatever your ops envelope is)
  - Maps to caps applied in kernel/src/cyntra/universe/policy.py:apply_universe_policies()
- max_candidates_bucket: enum {1,2,3}
  - For world evolution: maps to population_size in kernel/src/cyntra/universe/evolve_world.py:evolve_world()
  - For kernel speculate: same as parallelism_bucket initially

Optional model metadata (not part of action space)

- model: { checkpoint_id: str, version: str }
- confidence: float|null

———

## 3) Dataset plan (imitation-first, contract-driven)

### Label source (imitation baseline)

- Kernel issues (code/fab_asset)
  - Labels should reflect what actually ran in kernel/src/cyntra/kernel/runner.py:
    - Single dispatch path: \_dispatch_single_async() ⇒ swarm_id="serial_handoff", parallelism_bucket=1.
    - Speculate path: \_dispatch_speculate_async() ⇒ swarm_id="speculate_vote", parallelism_bucket = len(candidates) after truncation.
  - To extract “actual” parallelism/toolchains deterministically, add a small artifact going forward:
    - Write a planner_plan.json or add manifest["planner"]["executed_plan"] at dispatch time (in kernel/src/cyntra/kernel/runner.py) so you don’t have to infer from loose
      grouping.
- World evolution runs
  - Labels are already explicit at the run level:
    - context.json written by kernel/src/cyntra/universe/run_context.py:write_run_context() inside kernel/src/cyntra/universe/evolve_world.py:evolve_world() includes
      swarm_id.
    - population_size is resolved in evolve_world() and recorded in evolve_world.json output (same module).

### “Similar runs” definition + query (local-first)

Implement a deterministic scorer in a new module (suggested: kernel/src/cyntra/planner/similar_runs.py):

- Filter candidates by:
  - same job_type / domain (see \_domain_for_issue() in kernel/src/cyntra/control/exploration_controller.py)
  - (if world run) same world_id and objective_id
- Score by:
  - tag Jaccard overlap using manifest["issue"]["tags"] from archived workcells (.cyntra/archives/<wc>/manifest.json, produced in kernel/src/cyntra/kernel/
    dispatcher.py:\_build_manifest())
  - recency bucket using proof["metadata"]["started_at"] (workcells) or UniverseRunIndexRecord.started_ms (world runs, from kernel/src/cyntra/universe/index.py)
- Deterministic tie-break: (score desc, started_ms desc, run_id asc).

### run_summary.json (if you want a dedicated compact summary)

You already have a compact-ish artifact for workcells: rollout.json from kernel/src/cyntra/rollouts/builder.py. If you still want a uniform “planner-friendly” summary:

- Add kernel/src/cyntra/planner/run_summary.py that:
  - For workcells: reads rollout.json (or builds it on the fly via build_rollout())
  - For world runs: reads .cyntra/runs/<run>/manifest.json + optional verdict/gate_verdict.json, mirroring the fields used in kernel/src/cyntra/universe/index.py
- Write run_summary.json next to each run/workcell (archive copy handled by kernel/src/cyntra/workcell/manager.py:\_archive_logs()).

### Splits + leakage control

- Split by time using started_at (workcell proof metadata) and started_ms (universe run index):
  - Train = earliest 80%, Val = next 10%, Test = last 10%
- When building last_N_similar_runs for an example, only consider runs with started_ms < example.started_ms.

———

## 4) Model plan (URM encoder + multi-head classification)

### Encoder reuse choice

- Use URM’s embedding + transformer stack as the encoder:
  - train/URM/models/urm/urm.py:URM_Inner already produces hidden_states internally and uses hidden_states[:, 0] for its q_head, which is a natural pooled representation to reuse.
- Implement a planner wrapper model (suggested file: train/URM/models/urm/urm_swarm_planner.py) that:
  - Reuses the URM token embedding + blocks from URM_Inner (same init patterns from train/URM/models/layers.py)
  - Exposes a pooled vector (hidden_states[:, 0] or mean-pool)
  - Adds classification heads:
    - head_swarm_id: logits over |SWARM| (from universe swarms catalog)
    - head_parallelism: logits over {1,2,3}
    - head_budget_minutes: logits over budget bins
    - head_max_candidates: logits over {1,2,3}
- Loss:
  - Sum of cross-entropies with weights (start simple: equal weights; tune later).
  - Metrics: per-head accuracy + exact-match accuracy across full action tuple.

### Input encoding / tokenization

Prefer a discrete token vocab to stay URM-native:

- Build tokens like:
  - U:universe=medica, U:world=outora_library, U:objective=realism_perf_v1
  - I:risk=high, I:size=M, I:priority=P1, I:tag=asset:interior
  - R1:toolchain=codex, R1:passed=0, R1:diff_bucket=small, etc.
- Cap:
  - N_similar_runs = 8
  - max_tokens_per_run_summary = 32
  - seq_len = 512 (start)
  - vocab_size_cap = 8192 with UNK
- This is deterministic, local-first, and avoids free-form generation.

———

## 5) Training plan (configs, entrypoints, commands)

### URM-side entrypoints/configs

Given URM currently relies on a missing utils module, plan for one of:

- Option A (restore missing URM glue):
  - Add train/URM/utils.py implementing load_model_class() and get_model_source_path() so train/URM/pretrain.py:create_model() works unchanged.
- Option B (avoid missing glue):
  - Replace utils.load_model_class usage in train/URM/pretrain.py with direct imports or Hydra/importlib (but this touches core training).

Then add:

- train/URM/config/arch/urm_swarm_planner.yaml — points arch.name to your new model class, and arch.loss.name to your new loss head (modeled after train/URM/models/
  losses.py:ACTLossHead).
- train/URM/data/build_cyntra_planner_dataset.py — converts Cyntra artifacts into URM-ready memmaps + dataset.json (patterned after train/URM/data/build_arc_dataset.py).
- train/URM/evaluate_planner_model.py — mirrors train/URM/evaluate_trained_model.py but reports action accuracies.

### Smoke commands (single GPU)

- Dataset build (example):
  - python train/URM/data/build_cyntra_planner_dataset.py --repo-root . --archives .cyntra/archives --workcells .workcells --runs .cyntra/runs --output-dir train/URM/data/
    cyntra_planner_v1 --universe medica --n-similar 8
- Train:
  - torchrun --nproc-per-node 1 train/URM/pretrain.py data_path=train/URM/data/cyntra_planner_v1 arch=urm_swarm_planner global_batch_size=256 epochs=1000 eval_interval=50
    +run_name=planner_smoke +checkpoint_path=checkpoints/planner_smoke
- Eval:
  - python train/URM/evaluate*planner_model.py --checkpoint-path checkpoints/planner_smoke/step*\*.pt --data-path train/URM/data/cyntra_planner_v1 --output-dir eval_planner_smoke

### Multi-GPU notes

- Mirror URM scripts (e.g., train/URM/scripts/URM_arcagi1.sh) with torchrun --nproc-per-node N.
- Keep the dataset sharding assumptions consistent with URM’s rank-based dataset config (see train/URM/puzzle_dataset.py:PuzzleDatasetConfig(rank, num_replicas)).

———

## 6) Cyntra integration plan (inference + recording)

### Where inference runs

- Kernel issues:
  - Best insertion point is the dispatch decision boundary in kernel/src/cyntra/kernel/runner.py:\_dispatch_parallel() before choosing \_dispatch_single_async() vs
    \_dispatch_speculate_async().
  - Parallelism override happens in kernel/src/cyntra/kernel/runner.py:\_dispatch_speculate_async() right before candidates = candidates[:parallelism].
- World evolution:
  - Add an optional “planner chooses swarm/population” path in kernel/src/cyntra/cli.py inside evolve() (currently resolves resolved_swarm/population_size from universe defaults
    and args).

### CLI surface (minimal)

- Add flags:
  - cyntra run --planner-checkpoint <path> --planner-enabled
  - cyntra evolve --planner-checkpoint <path> --planner-enabled
  - Wire them in kernel/src/cyntra/cli.py and store on KernelRunner (see kernel/src/cyntra/kernel/runner.py:KernelRunner.**init**()).

### Recording predictions

- Add a manifest["planner"] block in kernel/src/cyntra/kernel/dispatcher.py:\_build_manifest() via manifest_overrides (already supported by Dispatcher.dispatch_async(...,
  manifest_overrides=...)).
- Persist into rollouts:
  - Extend kernel/src/cyntra/rollouts/builder.py:build_rollout() to copy manifest["planner"] into the rollout (top-level or under inputs).
  - If you want strict validation, extend kernel/schemas/cyntra/rollout.schema.json to include this field (today, policy is closed but top-level is permissive).
- Optionally write context.json for workcells when --universe is set:
  - Call write_run_context() from kernel/src/cyntra/universe/run_context.py inside KernelRunner so issue runs become universe-indexable.

———

## 7) Phased execution plan (P0 → P5)

### P0 — Spike (prove end-to-end on tiny data)

- [ ] Confirm/restore URM instantiation glue (train/URM/utils.py missing; blocks train/URM/pretrain.py).
- [ ] Implement minimal planner_input.v1 builder in a scratch script (suggested: kernel/src/cyntra/planner/spike.py) using:
  - issues from .beads/issues.jsonl
  - run summaries from kernel/src/cyntra/rollouts/builder.py:build_rollout()
- [ ] Implement a tiny baseline model (even linear) to validate dataset→train→eval plumbing.
- Done when: you can train for ~100 steps and run eval without crashes.
- Risks: URM checkout missing files; too little historical data to learn anything.
- Validation: run smoke commands above; ensure deterministic output.

### P1 — Dataset + schemas (make it reproducible)

- [ ] Add JSON schemas:
  - kernel/schemas/cyntra/planner_input.schema.json
  - kernel/schemas/cyntra/planner_action.schema.json
- [ ] Implement dataset builder:
  - train/URM/data/build_cyntra_planner_dataset.py (memmaps + dataset.json like train/URM/data/build_arc_dataset.py)
- [ ] Implement “similar runs” query:
  - kernel/src/cyntra/planner/similar_runs.py
- [ ] Implement leakage-safe time splits (train/val/test) inside dataset builder.
- Done when: dataset build is deterministic and schema-valid; split counts reported; last_N_similar_runs never includes the target run.
- Risks: older workcells lack explicit universe context; need to start recording it going forward.

### P2 — URM Swarm Planner model + training loop

- [ ] Add model wrapper:
  - train/URM/models/urm/urm_swarm_planner.py (URM encoder + pooled rep + multi-head outputs)
- Done when: training produces checkpoints and metrics (swarm_id acc + exact-match acc) on val.
- Risks: training loop semantics (carry across batches in train/URM/pretrain.py:train_batch()) may not fit planner; easiest fix is to force “halt each step” (loops=1) in planner config.

### P3 — Offline eval (prove it beats trivial baselines)

- [ ] Implement train/URM/evaluate_planner_model.py with:
  - swarm_id accuracy
  - full-tuple exact match
  - (optional) cost-weighted regret proxy using duration_ms/cost_usd from rollouts (kernel/src/cyntra/rollouts/builder.py)
- [ ] Add a baseline predictor that emulates current heuristics:
  - speculation triggers from kernel/src/cyntra/kernel/scheduler.py:should_speculate() and kernel/src/cyntra/control/exploration_controller.py:decide()
- Done when: model performance is quantified vs baseline on a held-out time slice.
- Risks: dataset too small; need more runs or augment via P5.

### P4 — Wire into Cyntra (feature-flagged)

- [ ] Add kernel/src/cyntra/planner/ inference module:
  - loads checkpoint
  - builds planner_input.v1
  - outputs planner_action.v1
- [ ] Add CLI flags in kernel/src/cyntra/cli.py and plumb into KernelRunner.
- [ ] Integrate in kernel/src/cyntra/kernel/runner.py:
  - decide single vs speculate in \_dispatch_parallel()
  - override parallelism in \_dispatch_speculate_async()
- [ ] Record predictions into manifest.json (kernel/src/cyntra/kernel/dispatcher.py:\_build_manifest()) and into rollout.json (kernel/src/cyntra/rollouts/
      builder.py:build_rollout()).
- Done when: cyntra run --once --planner-enabled --planner-checkpoint ... executes, and artifacts contain the predicted plan.
- Risks: torch dependency in kernel (mitigate by optional import + fallback to current routing/controller).

### P5 — Best-of-K / self-play labeling loop (upgrade labels)

- [ ] Implement a “plan proposal + evaluate + select” loop:
  - propose K plans (vary swarm_id/parallelism/budgets)
  - execute them (reusing existing speculate infra in kernel/src/cyntra/kernel/runner.py:\_dispatch_speculate_async() and vote logic in kernel/src/cyntra/kernel/
    verifier.py:vote())
  - select best by objective (pass gates first, then cost/duration)
- [ ] Store improved labels alongside the run (e.g., planner_labels.json in archives/runs).
- [ ] Retrain + re-evaluate (P2/P3).
- Done when: offline metrics improve and the kernel remains stable with planner enabled.
- Risks: cost explosion; enforce strict max_candidates_bucket and max_run_minutes_bucket.

If you confirm whether Swarm Planner should (a) only choose swarm_id/parallelism/budgets or (b) also choose toolchain sets, I can tighten the action space and the exact logging/
integration points in kernel/src/cyntra/kernel/runner.py accordingly.
