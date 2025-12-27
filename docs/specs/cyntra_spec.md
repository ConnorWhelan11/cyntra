• 1. Repo Findings (with referenced paths)

Repo map (top-level)

- Work graph (Beads): .beads/issues.jsonl, .beads/deps.jsonl
- Kernel config/logs/archives: .cyntra/config.yaml, .cyntra/logs/
  events.jsonl, .cyntra/archives/\*
- Active workcells (git worktrees): .workcells/
- Run artifacts + local venv/bin shims: .cyntra/runs/_, .cyntra/bin/_, .cyntra/venv/\*
- Python orchestrator: kernel/ (package in kernel/src/cyntra/)
- 3D/Fab assets + configs: fab/ (gates, lookdev scenes, assets, world recipes,
  godot template)
- Desktop app (Mission Control): apps/desktop/ (Tauri + React), key backend file
  apps/desktop/src-tauri/src/main.rs
- Specs/docs: docs/_, plus kernel docs under kernel/docs/architecture/_

Current orchestrator/kernel

- CLI entrypoints and subcommands: kernel/src/cyntra/cli.py, script definitions in
  kernel/pyproject.toml
- Core kernel modules: kernel/src/cyntra/kernel/
  {scheduler.py,dispatcher.py,verifier.py,runner.py,routing.py,config.py}
- Beads integration: kernel/src/cyntra/state/manager.py (bd CLI + file fallback)
- Workcells via git worktrees: kernel/src/cyntra/workcell/manager.py (uses git
  worktree add/remove, writes .workcell)
- Observability: .cyntra/logs/events.jsonl written by kernel/src/cyntra/
  observability/events.py
- MCP server: kernel/src/cyntra/mcp/server.py

Current Blender/Godot tooling (render harness / critics / gates)

- Fab “realism gate” + critics + deterministic render harness:
  - Gate runner: kernel/src/cyntra/fab/gate.py
  - Render harness: kernel/src/cyntra/fab/render.py
  - Critics: kernel/src/cyntra/fab/critics/\* (e.g. realism.py, geometry.py,
    category.py)
  - Gate configs: fab/gates/\*.yaml (e.g. fab/gates/interior_realism_v001.yaml, fab/gates/
    godot_integration_v001.yaml)
- Godot integration harness + contract:
  - Contract: fab/godot/CONTRACT.md
  - Template: fab/godot/template/\*
  - Python gate: kernel/src/cyntra/fab/godot.py
- Deterministic world-building pipeline (“Fab World”):
  - World CLI: kernel/src/cyntra/fab/world.py (entrypoint fab-world)
  - Runner/manifest/stages: kernel/src/cyntra/fab/
    {world_runner.py,world_manifest.py,stage_executor.py,world_config.py}
  - World recipe: fab/worlds/outora_library/world.yaml (+ Blender stage scripts under
    fab/worlds/outora_library/blender/stages/\*)
  - Example deterministic run manifest: .cyntra/runs/det_export_2/manifest.json
- Procedural scaffolds incl. Sverchok: kernel/src/cyntra/fab/scaffolds/sverchok.py,
  registry kernel/src/cyntra/fab/scaffolds/registry.py

Existing schemas + CLIs + tests

- Patch+Proof schemas: kernel/schemas/manifest.schema.json, kernel/schemas/
  proof.schema.json
- Fab schemas: kernel/schemas/fab/{run-manifest.schema.json,gate-
  verdict.schema.json,critic-report.schema.json,asset-proof.schema.json}
- Kernel config: .cyntra/config.yaml (routing + speculate + gates)
- Tests: kernel/tests/unit/_, kernel/tests/integration/_, kernel/tests/fab/\*

What already matches the non-negotiables

- Workcells via git worktrees: kernel/src/cyntra/workcell/manager.py + .workcells/\*
- Task graph/state management via Beads: .beads/issues.jsonl, kernel/src/cyntra/
  state/manager.py
- Patch+Proof artifacts exist and are archived: .cyntra/archives/\*/
  {manifest.json,proof.json,.workcell} and contract doc kernel/docs/architecture/
  workcell-contract.md
- Quality gates for code: configured in .cyntra/config.yaml and run by kernel/src/
  cyntra/gates/runner.py
- Realism gate for assets + deterministic render harness: kernel/src/cyntra/fab/
  gate.py, kernel/src/cyntra/fab/render.py, configs in fab/gates/\*
- Deterministic world builds w/ SHA manifests: kernel/src/cyntra/fab/
  world_runner.py, .cyntra/runs/\*/manifest.json

Telemetry / trajectory capture (partial)

- Per-workcell telemetry stream (prompts, tool calls, outputs): kernel/src/cyntra/
  adapters/telemetry.py, documented in docs/specs/telemetry.md
- Desktop app reads telemetry via Tauri commands in apps/desktop/src-tauri/src/
  main.rs (workcell_get_info, workcell_get_telemetry)

Gaps (with evidence)

- No GEPA-style prompt evolution “lab” (genomes, rollouts DB, Pareto frontier): repo-wide
  search for GEPA/Pareto/frontier content yielded nothing relevant (rg -n "GEPA|pareto|
  frontier" only hit unrelated UI “transition” strings).
- No detailed-balance/dynamics layer (state coarse-graining, transition DB, potential/
  action estimators): no code/results for “potential/action/transition DB” beyond generic
  UI transitions.
- Patch+Proof contract inconsistencies in existing archives:
  - Example proof missing issue_id despite schema requiring it: .cyntra/archives/wc-
    1-20251219T180213Z/proof.json (schema is kernel/schemas/proof.schema.json)
  - Proof marks status: "success" while verification.all_passed=false in same file
    (status semantics unclear).
- State snapshots for reproducibility are strong for “Fab World” (.cyntra/runs/
  det_export_2/manifest.json) but not standardized across all workcell types (code vs
  Blender vs world) into a single replayable “state bundle”.

2. Cyntra Architecture Overview (diagram in ASCII is fine)

Cyntra = (Kernel + Fab + Labs) glued together by deterministic artifacts, explicit schemas,
and a measurable dynamics/control loop.

                           ┌──────────────────────────────┐
                           │ Cyntra Desktop (Tauri/React)  │
                           │ runs, terminals, viewer,      │
                           │ workcells, replay             │
                           └──────────────┬───────────────┘
                                          │ local-first UI/API
                                          ▼

┌───────────────────────────────────────────────────────────────────────┐
│ CYNTRA KERNEL │
│ Beads State Scheduler/Dispatcher/Verifier Workcell Pool Gates │
│ (.beads) (policy-aware) (git worktrees) │
│ │
│ + Patch+Proof Collector + Rollout Builder + State/Transition Log │
└───────────────┬───────────────────────────┬───────────────────────────┘
│ │
deterministic artifacts │ trajectories + metrics
│ │
▼ ▼
┌───────────────────────────┐ ┌─────────────────────────────────────┐
│ CYNTRA FAB │ │ CYNTRA LABS │
│ Blender/Sverchok/Godot │ │ Prompt Evolution (GEPA-ish) │
│ fab-world stages │ │ - genomes, reflection, Pareto │
│ fab-gate/render/critics │ │ Dynamics (Detailed-Balance Lab) │
│ deterministic seeds + SHA │ │ - transitions, potential, action │
└───────────────────────────┘ │ Exploration Controller │
│ - adjusts exploration/exploitation │
└─────────────────────────────────────┘

All outputs land in a single local store (proposed): `.cyntra/`

- runs/ (workcells, world builds, gates, logs)
- rollouts/ (normalized trajectories)
- dynamics/ (sqlite/db + reports)
- prompts/ (genomes + frontier)
- bundles/ (replayable “state bundles”)

3. Components & Interfaces

Cyntra Kernel (extends existing kernel/)

- Responsibilities
  - Read/write canonical work graph from Beads (.beads/\*) and enforce status machine.
  - Schedule tasks deterministically (priority/risk/critical-path + now: dynamics-aware).
  - Dispatch tasks to workcells (git worktrees) and toolchain adapters.
  - Verify outputs via quality gates (pytest/mypy/ruff + fab gates).
  - Produce standardized artifacts: Manifest → Proof → Rollout → (optional) State Bundle.
- Interfaces (file-first, deterministic)
  - Input: Beads issues/deps (.beads/issues.jsonl, .beads/deps.jsonl)
  - Output per workcell: .workcells/<id>/{manifest.json,proof.json,telemetry.jsonl,logs/
    \*}
  - Archive: .cyntra/archives/<id>/_ (existing) → eventually .cyntra/archives/_

Workcell Runtime (existing + formalized)

- Responsibilities
  - Create/cleanup isolated git worktrees (kernel/src/cyntra/workcell/
    manager.py).
  - Enforce sandbox policies and forbidden paths (already represented in manifest
    schema).
  - Provide a stable “workcell contract” for any adapter: write proof.json + logs +
    telemetry.
- Adapter interface (existing pattern in kernel/src/cyntra/adapters/\*)
  - execute(manifest, workcell_path, timeout) -> proof.json (+ telemetry.jsonl)
  - Must be replayable: if “replay mode” enabled, adapter consumes cached LLM outputs
    rather than calling network.

Fab Pipeline (existing fab/ + kernel/src/cyntra/fab/)

- Responsibilities
  - Deterministic asset evaluation (render harness + critics) and gate verdicts.
  - Deterministic world-building (Fab World: staged pipeline + SHA manifests).
  - Godot integration gate + export harness.
  - Provide repair playbooks for iterative fix loops (kernel/src/cyntra/fab/
    iteration.py).
- Interfaces
  - Gate configs (YAML): fab/gates/\*.yaml
  - World recipes: fab/worlds/<world_id>/world.yaml
  - Outputs: .cyntra/runs/<run_id>/... (proposed to unify under .cyntra/runs/...)

Prompt Evolution Lab (new; first-class task type)

- Responsibilities
  - Store prompts/policies as “genomes” with versioning and structured deltas.
  - Run few-rollout evaluations to update frontier (Pareto optimal prompts).
  - Reflect on failures using captured trajectories; propose prompt patches (diffs).
  - Publish selected genomes into kernel routing (per domain/toolchain).
- Interfaces
  - Input: rollout records + gate outcomes + cost/time metrics.
  - Output: prompts/<domain>/<genome_id>.yaml, frontier.json, evolve_run.json

Dynamics Instrumentation (new; “Detailed Balance Lab”)

- Responsibilities
  - Define coarse-grained “states” and “transitions” across both coding + 3D steps.
  - Log transitions from telemetry + gates + world manifests into a local DB.
  - Estimate transition probabilities, a best-fit potential V(state), and an action
    metric.
  - Feed an Exploration Controller that tunes scheduling + prompt evolution knobs.
- Interfaces
  - Input: telemetry (telemetry.jsonl), proof/gate results (proof.json, fab verdicts),
    world stage manifests.
  - Output: dynamics.sqlite + periodic dynamics_report.json

4. Data Model & Schemas (include JSON examples)

Below are proposed Cyntra schemas that compose existing ones (kernel/schemas/_, dev-
kernel/schemas/fab/_) instead of replacing them. Store under kernel/schemas/cyntra/_
(or future cyntra-_/schemas/\*).

A) Task Manifest (input spec, constraints, tools allowed, acceptance criteria)

{
"schema*version": "cyntra.task_manifest.v1",
"task_id": "task_20251220T190000Z_8a31c2",
"issue": {
"id": "42",
"title": "Add spawn+colliders to world export",
"description": "…",
"acceptance_criteria": [
"GLB includes exactly one SPAWN_PLAYER",
"At least one COLLIDER*\* mesh",
"fab-godot gate passes"
],
"tags": ["asset:world", "world:outora_library", "gate:godot"]
},
"job_type": "fab.world.build",
"workcell": {
"workcell_id": "wc-42-20251220T190000Z",
"branch_name": "wc/42/20251220T190000Z",
"repo_root": ".",
"forbidden_paths": [".beads/", ".cyntra/", ".cyntra/secrets/"]
},
"determinism": {
"seed": 42,
"pythonhashseed": 0,
"blender": { "device": "CPU", "threads": 1, "factory_startup": true },
"llm_replay": { "enabled": false }
},
"policy": {
"toolchain": "fab-world",
"prompt_genome_id": null,
"model": null,
"sampling": { "temperature": null, "top_p": null },
"speculate": { "enabled": false, "parallelism": 1 }
},
"inputs": {
"world_path": "fab/worlds/outora_library",
"param_overrides": { "lighting.preset": "dramatic" }
},
"gates": {
"code": {
"test": "cd kernel && pytest -q",
"lint": "cd kernel && ruff check .",
"typecheck": "cd kernel && mypy src/cyntra"
},
"fab": {
"validate": [
"fab/gates/interior_library_v001.yaml",
"fab/gates/godot_integration_v001.yaml"
]
}
},
"outputs": {
"run_dir": ".cyntra/runs/world_outora_library_seed42_20251220T190000Z"
}
}

B) Patch+Proof artifact (code diffs + tests + render outputs + critic reports)

Keep proof.json compatible with kernel/schemas/proof.schema.json, but extend with
Cyntra fields (new schema_version recommended to avoid ambiguity).

{
"schema*version": "cyntra.patch_proof.v2",
"task_id": "task_20251220T190000Z_8a31c2",
"workcell_id": "wc-42-20251220T190000Z",
"issue_id": "42",
"job_type": "fab.world.build",
"status": "success",
"patch": {
"branch": "wc/42/20251220T190000Z",
"base_commit": "db9e2df9219646a008c447231873641f2db27969",
"head_commit": "db9e2df9219646a008c447231873641f2db27969",
"diff_stats": { "files_changed": 0, "insertions": 0, "deletions": 0 }
},
"verification": {
"gates": {
"fab-world.validate": { "passed": true, "exit_code": 0, "duration_ms": 120000 }
},
"all_passed": true,
"blocking_failures": []
},
"artifacts": {
"telemetry_path": ".workcells/wc-42-20251220T190000Z/telemetry.jsonl",
"world_run_manifest_path": ".cyntra/runs/world_outora_library_seed42*.../
manifest.json",
"renders*dir": ".cyntra/runs/world_outora_library_seed42*.../render/",
"gate*verdicts": [
".cyntra/runs/world_outora_library_seed42*.../stages/validate/fab_gate_verdict.json"
]
},
"dynamics": {
"state_before_t1": "st1_9f2a…",
"state_after_t1": "st1_1c0b…",
"delta_V": -0.37,
"action": 0.42,
"controller": { "beta": 1.2, "temperature": null, "speculate_parallelism": 1 }
},
"metadata": {
"toolchain": "fab-world",
"started_at": "2025-12-20T19:00:00Z",
"completed_at": "2025-12-20T19:07:12Z",
"duration_ms": 432000,
"versions": { "blender": "5.0.1", "godot": "4.3", "git_commit": "db9e2df" }
}
}

C) Rollout record (prompts, tool calls, outputs, scores, gate results)

This is the canonical “trajectory summary” used by GEPA + dynamics. It is derived from
telemetry + proof + gate outputs.

{
"schema_version": "cyntra.rollout.v1",
"rollout_id": "ro_20251220T190000Z_0e91a0",
"task_id": "task_20251220T190000Z_8a31c2",
"issue_id": "42",
"job_type": "code.patch",
"policy": {
"toolchain": "codex",
"model": "gpt-5.2",
"prompt_genome_id": "code_codex_base_v3",
"sampling": { "temperature": 0.2, "top_p": 0.95 },
"speculate": { "enabled": true, "parallelism": 2, "tag": "spec-claude" }
},
"inputs": {
"manifest_path": ".workcells/wc-42-.../manifest.json",
"repo_commit_base": "db9e2df…"
},
"trajectory": {
"telemetry_path": ".workcells/wc-42-.../telemetry.jsonl",
"tool_summary": {
"Read": 18,
"Write": 6,
"Bash": 9,
"Blender": 0
},
"file_changes": [
{ "path": "kernel/src/cyntra/kernel/scheduler.py", "kind": "modified" }
]
},
"outcomes": {
"verification": { "all_passed": true, "blocking_failures": [] },
"fab": null
},
"scores": {
"quality": 0.91,
"risk": "medium",
"diff_lines": 84,
"cost_usd": 0.63,
"duration_ms": 510000
},
"dynamics": {
"states_t1": ["st1_a1…", "st1_b2…", "st1_c3…"],
"transitions": 27,
"delta_V_total": -0.62,
"action_total": 0.55,
"trapping_flag": false
}
}

D) State representation (coarse-grained but replayable)

Tier 1 (fast/cheap; used for Markov stats):

{
"schema_version": "cyntra.state_t1.v1",
"state_id": "st1_1c0b5f2e…",
"domain": "fab_asset",
"job_type": "fab.gate",
"features": {
"phase": "verdict",
"gate_config_id": "interior_library_v001",
"overall_score_bucket": "0.55-0.60",
"hard_fail_present": false,
"soft_fail_codes": ["REAL_MISSING_TEXTURES_SEVERE"],
"asset_triangle_bucket": "1e6-5e6",
"seed": 1337
},
"policy_key": {
"toolchain": "blender",
"prompt_genome_id": "fab_blender_repair_v2",
"temperature_bucket": "0.3"
},
"artifact_digests": {
"asset_sha256": "543e70e0…",
"gate_verdict_sha256": "aa12…"
}
}

Tier 2 (full/replayable; deterministic audit bundle):

{
"schema*version": "cyntra.state_t2.v1",
"state_id": "st2_7a8c…",
"t1_ref": "st1_1c0b5f2e…",
"replay": {
"bundle_path": ".cyntra/bundles/st2_7a8c…/",
"git_commit": "db9e2df…",
"workcell_id": "wc-…",
"inputs": {
"manifest_path": ".workcells/wc-…/manifest.json",
"telemetry_path": ".workcells/wc-…/telemetry.jsonl",
"fab_run_dir": ".cyntra/runs/run*…/"
},
"determinism": {
"seed": 1337,
"pythonhashseed": 0,
"blender": { "version": "5.0.1", "device": "CPU", "threads": 1 }
}
}
}

E) Transition record (f -> g) with counts/timestamps/tags

{
"schema_version": "cyntra.transition.v1",
"transition_id": "tr_20251220T190012Z_aa39",
"rollout_id": "ro_20251220T190000Z_0e91a0",
"from_state": "st1_a1…",
"to_state": "st1_b2…",
"transition_kind": "tool",
"action_label": {
"tool": "Bash",
"command_class": "run_gate",
"domain": "code"
},
"context": {
"issue_id": "42",
"job_type": "code.patch",
"toolchain": "codex",
"prompt_genome_id": "code_codex_base_v3"
},
"timestamp": "2025-12-20T19:00:12Z",
"observations": {
"delta_diff_lines": 0,
"gate": null,
"score_delta": null
}
}

F) Potential + action report (V(state), ΔV, log-ratio constraints, trapping warnings)

{
"schema_version": "cyntra.dynamics_report.v1",
"generated_at": "2025-12-20T20:00:00Z",
"estimation": {
"window": { "since": "2025-12-01T00:00:00Z", "until": "2025-12-20T20:00:00Z" },
"smoothing_alpha": 1.0,
"fit": { "rmse_logratio": 0.19, "edges_used": 842 }
},
"potential": [
{ "state_id": "st1_a1…", "V": 1.72, "stderr": 0.11 },
{ "state_id": "st1_b2…", "V": 1.31, "stderr": 0.09 }
],
"action_summary": {
"global_action_rate": 0.48,
"by_domain": { "code": 0.52, "fab_asset": 0.41, "fab_world": 0.29 },
"traps": [
{
"state_id": "st1_dead…",
"reason": "low action + no ΔV",
"recommendation": "increase exploration (temperature, parallelism); switch
scaffold"
}
]
},
"controller_recommendations": {
"code": { "beta": 1.0, "temperature": 0.25, "speculate_parallelism": 2 },
"fab_asset": { "beta": 0.8, "temperature": 0.35, "max_iterations": 4 }
}
}

5. Dynamics Layer: State/Transition/Potential/Action (how measured + how used)

This is the “engineering-first” detailed-balance layer that turns trajectories into
controllable signals.

A) What is a “state” in Cyntra?

- State = a deterministic summary of where we are in a task + artifacts + outcomes +
  policy.
- Two tiers:
  - Tier 1 (T1): coarse-grained, discretized feature vector → state_id (fast, used for
    Markov stats).
  - Tier 2 (T2): replayable bundle pointer (full audit/replay; used when debugging/
    regressing).

Concrete T1 features (examples)

- Coding domain (job_type=code.patch)
  - phase: plan|edit|test|lint|typecheck|merge
  - failing_gate: none|test|lint|typecheck|build
  - diff_bucket: 0|1-20|21-100|101-500|>500
  - files_touched_bucket: 0|1-5|6-20|>20
  - error_class: import_error|flake|timeout|unknown
- 3D asset domain (job_type=fab.gate / fab.asset.author)
  - gate_config_id, verdict: pass|fail|escalate
  - overall_score_bucket
  - fail_codes (hard/soft sets, truncated to top-k)
  - geometry buckets (triangles, bounds, material count)
  - seed (or bucket)
- World domain (job_type=fab.world.build)
  - stage: prepare|generate|bake|materials|lighting|export|render|validate|godot
  - stage_status: success|fail|optional_failed
  - budget_violation: none|materials|draw_calls|nodes|size

T2 state bundle contents (minimum viable)

- state_t1.json, manifest.json, proof.json, telemetry.jsonl (or offsets), relevant gate
  outputs, plus a reproducible reference:
  - For code: git patch + base commit, plus gate logs.
  - For fab: render outputs + critic report + verdict JSON + seeds.
  - For world: run manifest.json + stage logs + SHA256 list.

B) What is a “transition”?
A transition is one coarse step that moves us from one state to another. Two important
classes:

- Coding transitions
  - tool transitions: (read/write/bash) grouped at macro boundaries (e.g., “edit batch”,
    “run tests”)
  - gate transitions: running test/lint/typecheck/build
  - git transitions: repo content changed (tree hash or diff bucket changes)
- 3D transitions
  - blender_op transitions: parameter/node changes; export
  - render transitions: canonical renders produced
  - critic transitions: scores/fail codes updated
  - stage transitions: world pipeline stage completion

C) How to log/estimate P(g|f)
Instrumentation sources (all already local-first):

- Workcell telemetry (.workcells/\*/telemetry.jsonl) gives an ordered event stream (docs/
  telemetry.md).
- Proof/gate outputs (proof.json, fab verdict/critic JSONs) provide outcome metrics.
- World manifests (.cyntra/runs/\*/manifest.json) provide stage-by-stage transitions.

Logging pipeline (proposed)

1. Rollout Builder: on workcell completion, build rollout.json from telemetry + proof.
2. State Extractor: compute T1 states along the trajectory at chosen boundaries (start,
   after gate runs, after export/verdict).
3. Transition Logger: write transition records into a local DB.

Estimating P(g|f)

- For each state f, count transitions to each g: C(f→g) (optionally conditional on
  action_label).
- Estimate:
  - P(g|f) = (C(f→g)+α) / (Σ_g C(f→g)+α·K) (Laplace smoothing α; K=#observed neighbors)
- Maintain separate models per domain/job_type, and optionally per prompt_genome_id
  (policy-conditioned dynamics).

D) How/why to estimate a potential V(state)
Goal: infer a scalar “landscape” that explains directional tendency of the system under
near-detailed-balance assumptions, while still being useful under non-equilibrium.

- For edges where both directions are observed:
  - r_fg = log(P(f→g) / P(g→f))
- In detailed balance: r_fg ≈ V(f) - V(g)
- Estimate V by least-squares over all reversible edges (graph Laplacian solve), with
  anchoring (V(s_ref)=0) and ridge regularization for stability.
  Outputs:
- V(state) (with uncertainty from bootstrap / edge weights)
- residuals per edge/cycle indicating non-equilibrium “drives” (useful diagnostics)

E) What is “action” and how it’s used
Define an engineering-friendly action metric tied to irreversibility:

- Local action for a transition: a_fg = log(P(f→g) / P(g→f))
- Trajectory action: A = Σ a*(s_t→s*{t+1})
- Action rate (entropy-production-like): aggregate over edges:
  - EP = Σ\_{f<g} (P_fg - P_gf) · log(P_fg/P_gf)
    Interpretation knobs
- Very low action + low ΔV (potential not improving): “over-convergence / trapping” (stuck
  loops, timid edits, repeated gate failures).
- Very high action + noisy ΔV: “chaos” (thrashing, large diffs, inconsistent outcomes).

How it influences scheduling + prompt evolution

- Scheduling: prefer actions/strategies that yield expected ΔV decrease per unit cost, and
  use action as a feedback signal to adjust exploration intensity.
- Prompt evolution: treat (success, cost, determinism variance, action band adherence) as
  Pareto objectives; keep prompts that don’t trap or thrash.

6. Prompt Evolution Layer (GEPA-ish) (how integrated + Pareto objectives)

Core idea

- Prompts/policies are versioned “genomes” that can be mutated and selected based on a
  small number of rollouts, using captured trajectories for reflection and patching.

Genome representation (practical)

- Store as YAML in-repo (diffable) + hashed ID:
  - prompts/<domain>/<toolchain>/<genome_id>.yaml
- Contains:
  - system_prompt, instruction_blocks, tool_use_rules
  - default sampling knobs (temperature/top_p), parallelism defaults, reflection depth
  - allowed tool whitelist/blacklist, “determinism protocol” section

GEPA-ish loop (task-integrated)

1. Select evaluation set: a small suite of Beads issues or “micro-bench” tasks (can be
   synthetic and local).
2. Run rollouts: kernel executes N rollouts per genome (few, e.g. 3–10) and stores
   rollout.json.
3. Reflect: a “reflector” pass reads failed rollouts and produces structured prompt deltas:
   - output format = prompt patch (diff against genome YAML) + rationale + expected effect
4. Pareto selection: keep non-dominated genomes across objectives (below).
5. Crossover: merge complementary deltas (mechanically: merge YAML blocks with conflict
   rules).
6. Promote: publish selected genomes into routing defaults for a domain, while pinning old
   champions for regression.

Pareto objectives (engineering-aligned)

- Quality:
  - code: gate pass rate, diff size, reviewer score/confidence
  - fab: critic overall, hard-fail rate, gate pass
  - world: stage success rate, budget compliance, validation pass
- Cost:
  - tokens_used, wall time, number of tool calls, GPU/CPU minutes
- Determinism / reproducibility:
  - variance of outputs across replays (when replay uses cached LLM outputs, should be
    zero; for real LLM calls, measure instability)
- Safety:
  - forbidden path violations, policy violations, external network calls (except model)
- Diversity:
  - novelty of solutions (state-space coverage, different scaffolds, different fix
    strategies)
- Dynamics regularization (new):
  - action in target band (avoid trapping/over-thrashing)
  - expected ΔV/cost improvements

Integration with Beads

- Prompt evolution runs as a first-class issue type:
  - tags: lab:evolve, domain:code|fab|world, genome:..., bench:...
- Kernel routes lab:evolve to a non-interactive toolchain or a specialized adapter that:
  - launches rollouts
  - writes evolve_run.json + updated frontier/genomes
  - opens follow-up issues when regressions detected

7. Control Policy (action-based exploration/exploitation) (explicit knobs)

Define a single scalar control target per domain: keep action within [A_low, A_high] while
driving ΔV negative (toward success).

Knobs Cyntra can tune (explicit)

- LLM sampling: temperature, top_p, max_tokens
- Candidate generation: M (num candidates), vote_threshold, majority_n
- Speculate+vote: parallelism, toolchain mix (codex/claude/opencode/crush)
- Constraint tightening: max diff lines/files, forbidden paths strictness, “must write
  tests” toggles
- Fab iteration knobs: max iterations (GateConfig.iteration.max_iterations), whether to
  enable vote_pack on uncertainty (already in YAML gate configs), critic weights/thresholds
  (gate YAML), render samples/resolution (gate YAML)
- Prompt evolution knobs: mutation rate, crossover rate, reflection depth, rollout budget
  per genome

Control policy (example, deterministic)

- Compute per issue (and per domain) over a sliding window of recent transitions:
  - Ā = mean action
  - ΔV̄ = mean potential change per transition (or per rollout)
  - stall = (gates failing same way for N cycles) OR (ΔV̄ ~ 0 for N transitions)
- Policy:
  - If stall=true AND Ā < A_low (trapped/over-converged):
    - Increase exploration:
      - raise temperature by +0.1 (cap 0.6)
      - increase M by +1 (cap 4)
      - enable/raise speculate parallelism by +1 (cap 3)
      - in fab: enable vote_pack_on_uncertainty, increase max_iterations by +1 (cap
        from config)
      - increase prompt mutation rate (e.g. 0.05 → 0.15)
  - If Ā > A_high OR large diff thrash (chaos):
    - Increase directionality/constraints:
      - lower temperature by -0.1 (floor 0.1)
      - reduce M (min 1) or require vote agreement >0.7
      - bias routing toward “deep reasoning” toolchain (codex) or require review
      - tighten max diff lines/files; require tests for code
      - in fab: raise critic floors or increase render samples (if noise suspected)
  - If ΔV̄ improving strongly and Ā in band:
    - exploit: keep knobs stable; reduce cost (lower M / parallelism gradually)

Implementation note: you can treat beta as the scheduler knob that controls how strongly
the kernel prefers lower-V next states:

- choose next strategy with probability ∝ exp(-beta·V_predicted)
- then adjust beta to keep measured action in band.

8. Phased Implementation Plan (with acceptance criteria)

Phase 1 — Cyntra “shell” + unified artifact directory

- Goals
  - Introduce cyntra CLI as an umbrella over existing kernel + fab-\* CLIs.
  - Create a single local-first store .cyntra/ while maintaining compatibility with .dev-
    kernel/ and .cyntra/.
- Concrete tasks (paths)
  - Add kernel/src/cyntra/cyntra/cli.py (new) and register cyntra script in dev-
    kernel/pyproject.toml.
  - Add .cyntra/config.yaml (new) as a superset wrapper around .cyntra/config.yaml.
  - Add .cyntra/README.md documenting run layout and replay conventions.
- Tests/validation
  - cd kernel && pytest -q
  - Smoke: cyntra run --once behaves like cyntra run --once
- Done when
  - Running cyntra can list workcells and runs without breaking existing flows.
- Risks + mitigations
  - Risk: confusion between .cyntra and .cyntra; mitigate by symlinks or a “dual-write”
    period with clear precedence rules.

Phase 2 — Rollout Builder (normalized trajectory) + schema validation

- Goals
  - Produce a canonical rollout.json for every completed workcell/world run, derived from
    telemetry + proof + fab manifests.
- Concrete tasks (paths)
  - New module: kernel/src/cyntra/cyntra/rollouts/
    {builder.py,schemas.py,store.py}
  - New schema: kernel/schemas/cyntra/rollout.schema.json
  - Kernel hook: in kernel/src/cyntra/kernel/verifier.py (post-proof collection),
    call rollout builder.
- Tests/validation
  - Unit tests: kernel/tests/unit/test_rollout_builder.py (new)
  - Validate JSON against schema with jsonschema in tests.
- Done when
  - Every workcell has {manifest.json,proof.json,telemetry.jsonl,rollout.json} or a clear
    “missing telemetry” reason.
- Risks + mitigations
  - Risk: telemetry formats differ by adapter; mitigate with adapter-specific parsers and
    a normalized event model.

Phase 3 — Dynamics DB: states/transitions + P(g|f) estimation

- Goals
  - Implement Tier-1 state extraction and transition logging for code + fab + world
    domains.
  - Compute transition counts and probabilities locally (SQLite).
- Concrete tasks (paths)
  - New package: kernel/src/cyntra/cyntra/dynamics/
    - state_t1.py, transition_logger.py, transition_db.py
  - New CLI: cyntra dynamics ingest, cyntra dynamics stats
  - New schema(s): kernel/schemas/cyntra/
    {state_t1.schema.json,transition.schema.json}
- Tests/validation
  - Deterministic hashing tests (same inputs → same state_id)
  - DB roundtrip tests (insert transitions, compute P)
- Done when
  - cyntra dynamics ingest builds a DB from existing .workcells/_/telemetry.jsonl + .dev-
    kernel/archives/_.
- Risks + mitigations
  - Risk: state explosion; mitigate by strict discretization/bucketing + “top-k fail
    codes” truncation.

Phase 4 — Potential estimator + action metrics + trapping detector

- Goals
  - Estimate V(state) from reversible edges; compute action; emit actionable “trap”
    warnings.
- Concrete tasks (paths)
  - Add kernel/src/cyntra/cyntra/dynamics/{potential.py,action.py,report.py}
  - New CLI: cyntra dynamics report writing dynamics_report.json
- Tests/validation
  - Synthetic small Markov graph tests (known V recovery).
  - Regression test: stable report output for fixed synthetic input.
- Done when
  - Report shows: top high-V states, top traps (low action + no ΔV), and per-domain
    action bands.
- Risks + mitigations
  - Risk: insufficient reverse transitions; mitigate by (a) backing off to heuristic V
    from gate scores, and (b) encouraging occasional “reverse probes” in evaluation
    suites.

Phase 5 — GEPA-ish Prompt Evolution Lab (genomes + Pareto frontier)

- Goals
  - Implement genomes, few-rollout evaluation, reflection patches, Pareto frontier
    management.
- Concrete tasks (paths)
  - New package: kernel/src/cyntra/cyntra/evolve/
    - genome.py, evaluation.py, pareto.py, reflect.py
  - Storage: prompts/ (new top-level) or kernel/prompts/ with schema + versioning.
  - New CLI: cyntra evolve run, cyntra evolve frontier, cyntra evolve promote
- Tests/validation
  - Unit tests for Pareto set correctness.
  - Integration: run 3–5 tiny local bench tasks and generate frontier.json.
- Done when
  - You can evolve prompts for a domain and see measurable improvement across at least
    two objectives (e.g., success↑, cost↓) without regressions in determinism metrics.
- Risks + mitigations
  - Risk: evaluation noise; mitigate with cached-replay mode and fixed seeds where
    possible.

Phase 6 — Closed-loop controller integration (scheduler + adapters)

- Goals
  - Use action/potential signals to tune exploration knobs in kernel scheduling and
    adapter invocation.
- Concrete tasks (paths)
  - Add kernel/src/cyntra/cyntra/control/exploration_controller.py
  - Wire into scheduling/routing:
    - kernel/src/cyntra/kernel/scheduler.py (priority scoring augmentation)
    - kernel/src/cyntra/kernel/dispatcher.py (toolchain params, speculate
      parallelism)
- Tests/validation
  - Simulation tests: when “trap” is flagged, controller increases exploration knobs;
    when “chaos” is flagged, it tightens.
  - End-to-end dry run: cyntra run --dry-run prints chosen knobs per scheduled issue.
- Done when
  - Kernel decisions are reproducible (same inputs → same knob outputs) and measurable
    shifts occur under controlled scenarios.
- Risks + mitigations
  - Risk: feedback instability; mitigate by hysteresis, bounded updates, and per-domain
    target bands.

9. Open Questions / Assumptions

- Naming/migration: should Cyntra rename kernel/ + .cyntra/ + .cyntra/, or keep
  compatibility indefinitely with .cyntra/ as a superset?
  answer: yeah rename to cyntra. no need to keep compat
- Replay determinism: do we require “offline replay” of LLM steps via cached outputs
  (strong reproducibility), or accept that re-calling models changes behavior and treat
  replay as “audit only”?
  answer: accept that re-calling models changes behavior
- State granularity: what’s the minimal T1 feature set that still predicts success and
  supports actionable control without exploding the state space?
  answer: not sure. when this issue comes up during the development i can address it
- Potential estimator validity: how much reversibility exists in real trajectories (enough
  P(g|f) and P(f|g) pairs), and should we schedule intentional “reverse probes” in benches
  to improve estimation?
  answer: i'm not sure. whatever you think will lead to best agent performance
- Storage budgets: large Blender/world artifacts are huge (see sizes in .cyntra/runs/
  det_export_2/manifest.json); should state bundles store full binaries, or content-address
  them and store pointers only?
  answer: yeah keep huge artifacts out of state bunder, pointer is fine
- Desktop integration scope: should Cyntra Desktop become the canonical viewer for world
  builds + gate deltas, or remain a kernel/workcell monitor with links out to fab/outora-
  library/viewer/?
  answer: yeah at some point we will refactor desktop app for optimal world builder UX and harness or change existing functionality
