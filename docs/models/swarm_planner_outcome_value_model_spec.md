# Cyntra Swarm Planner — Outcome Value Model + Safe Exploration Spec (v1)

**Status:** Draft operating spec (complements `docs/models/swarm_planner_training_spec.md`)  
**Last updated:** 2025-12

This document upgrades the Swarm Planner training plan from “learn what we did” (Stage A executed-plan imitation) to “learn what works” using **outcome modeling**, **counterfactual coverage**, and (optionally) **safe online exploration** with **off-policy evaluation (OPE)**.

The core claim: **behavior cloning cannot beat its own teacher**. If the planner’s goal is better pass-rate/cost/latency tradeoffs than the current controller, the primary training signal must come from **(x, a) → outcome** supervision and policy selection under explicit objectives/constraints.

---

## 1) Goals and non-goals

### 1.1 Goals

- Train a policy that chooses `(swarm_id, budgets)` to optimize **pass probability vs cost/latency** under explicit constraints.
- Make policy evaluation **scientific**:
  - reproducible candidate generation,
  - recorded propensities (when exploring),
  - offline OPE where feasible,
  - stable dataset epoching to control drift (config + GEPA frontier + toolchain/model versions).
- Keep kernel integration **safe-by-default**:
  - deterministic fallback,
  - conservative enforcement (initially only reductions vs baseline),
  - uncertainty-aware abstain.

### 1.2 Non-goals (v1)

- Full MDP / long-horizon RL across multiple kernel steps. Treat each issue dispatch as a **contextual bandit** decision.
- Learning toolchain routing as part of the action (keep v1 action space finite and enforceable).
- Replacing GEPA. This spec describes coupling rules so planner learning is not confounded by prompt evolution.

---

## 2) Problem framing: contextual bandit over finite actions

For each decision (issue dispatch):

- Context `x`: `planner_input.v1` (+ stability context such as frontier hash / toolchain versions).
- Action `a`: a tuple from `VALID_ACTIONS(job_type)`:
  - `swarm_id`
  - `max_candidates_bin`
  - `max_minutes_bin`
  - `max_iterations_bin`
- Outcome `y`: what happened after running the workcell(s):
  - success/fail/timeout
  - gate summaries + fail codes
  - duration + cost + tokens

We want a learned policy `π(a|x)` that maximizes expected utility:

- hard constraints: prefer “pass all required gates”
- soft objectives: minimize `duration_ms`, `cost_usd`, and avoid instability/thrashing

This is not imitation learning. It is **decision-making under uncertainty** with explicit tradeoffs.

---

## 3) Data and artifact contracts (what must be logged)

Outcome learning and OPE only work if the artifacts contain enough provenance to:

1) reconstruct the decision context,
2) reconstruct the candidate set,
3) reconstruct which policy produced the action and (if randomized) its propensity.

### 3.1 Required per-run planner artifacts (manifest + rollout)

Continue recording:

- `manifest["planner"]["planner_input"]` (`cyntra.planner_input.v1`)
- `manifest["planner"]["planner_action"]` (`cyntra.planner_action.v1`)
- `manifest["planner"]["executed_plan"]` (`cyntra.executed_plan.v1`)

Add a new record (recommended) under `manifest["planner"]["policy_trace"]`:

```json
{
  "schema_version": "cyntra.planner_policy_trace.v1",
  "policy_id": "baseline_heuristic_v0|onnx_value_v1|explore_eps_005_v1",
  "policy_mode": "off|log|enforce",
  "candidate_set_hash": "<sha256>",
  "propensity_executed": 0.975,
  "exploration": {
    "enabled": true,
    "method": "epsilon_greedy",
    "epsilon": 0.05,
    "safe_set": "no_upgrades_vs_baseline"
  },
  "stability": {
    "kernel_config_hash": "<sha256>",
    "universe_hash": "<sha256>",
    "prompt_frontier_hash": "<sha256>",
    "toolchain_versions": { "claude": "model@rev", "codex": "model@rev" }
  }
}
```

Notes:
- `candidate_set_hash` allows a deterministic rebuild of candidate selection without storing the full set in every artifact (store the set in benches; store hash + top-k in production).
- `propensity_executed` is mandatory if you intend to use IPS/DR OPE from production logs.
- `stability.*` is what makes drift controllable (see §8).

### 3.2 Extend `planner_input` with stability context (minimal-change option)

To avoid bumping the top-level `planner_input` schema immediately, store extra context in existing “extensible” areas:

- `planner_input.issue` has `additionalProperties: true`
- `planner_input.system_state` has `additionalProperties: true`

Recommended fields (wherever you choose to place them, but be consistent):

- `prompt_genome_id_effective`
- `toolchain_selected`
- `toolchain_model_selected`
- `routing_rule_id` (if available)
- `dk_speculate` / `dk_tool_hint_effective` (resolved)

If you prefer strict semantics and future-proofing, define `planner_input.v2` with a new top-level `execution_context` instead.

### 3.3 Bench artifacts for counterfactual labels (best-of-K / enumeration)

The best-of-K bench already produces per-issue candidate outcomes. For outcome/value training, standardize:

- candidate list (actions evaluated)
- per-candidate provenance (toolchain, prompt genome, timeout, parallelism)
- per-candidate outcomes + costs
- winner selection rule + objective weights + tie-breakers

Store a single bench report with:

- `bench_config_hash`
- `candidate_selection_policy` (how candidates were picked)
- stability hashes (config/universe/frontier/toolchain versions)
- list of evaluated actions per case (or a reference to them)

---

## 4) Labels: define the objective explicitly

Outcome/value learning becomes “easy” once the objective is explicit and consistent.

### 4.1 Primary objective (recommended default)

Treat “passes required gates” as a hard constraint:

1) maximize `P(pass_all_required_gates | x, a)`
2) among actions with similar pass probability, minimize expected cost/latency:
   - `E(duration_ms | x, a)`
   - `E(cost_usd | x, a)` (or tokens, if cost is unavailable)

Practical scalar utility:

```
U(x,a) = w_pass * p_pass(x,a)
         - w_time * E[log(duration_ms + 1) | x,a]
         - w_cost * E[cost_usd | x,a]
         - w_risk * RiskPenalty(x,a)
```

Where `RiskPenalty` can be:
- probability of timeout,
- probability of “environment failure” class,
- tail latency (p95) via quantile regression.

### 4.2 Domain-specific guardrails

- For `dk_risk=critical`, you may want a “minimum pass probability” constraint and ignore small cost wins:
  - enforce only if `p_pass_new >= p_pass_baseline - δ` and cost improves by ≥ margin.
- For low-risk issues, you can explore cheaper plans more aggressively.

---

## 5) Modeling: learn outcomes, not just actions

### 5.1 Train an outcome/value model `Q(x,a)`

Recommended multi-task targets:

- `p_pass(x,a)` (binary classification)
- `p_timeout(x,a)` (binary classification; optional but useful)
- `E[log(duration_ms+1) | x,a]` (regression)
- `E[cost_usd | x,a]` or `E[tokens_total | x,a]` (regression)

Why not just “winner-action classification”?
- It throws away counterfactual structure and is brittle under objective changes.
- It makes abstain logic hard (you need calibrated failure risk, not just “which class wins”).

### 5.2 Timeouts and censoring (crucial)

Timeouts are censored latency. Don’t treat `duration_ms` for a timeout as “true duration”.

Minimal workable modeling:
- predict `p_timeout(x,a)`
- predict duration only on non-timeouts (conditional regression)

Better (optional):
- survival-style modeling (hazard) or quantile regression to capture tail behavior.

### 5.3 Uncertainty estimation (for safety + exploration)

You need uncertainty both to:
- abstain when predictions are unreliable,
- explore where you’re uncertain.

Local-first options:
- small ensemble of `N=3–5` models (different seeds) → mean + variance
- Monte Carlo dropout (weaker but cheap)

Use lower confidence bounds (LCB) for safe improvement:

```
LCB_pass(x,a) = mean(p_pass) - k * std(p_pass)
```

---

## 6) Policy: choose actions by constrained optimization over `VALID_ACTIONS`

Given a trained `Q` model, decision is:

1) enumerate `A = VALID_ACTIONS(job_type)` (finite, small)
2) compute `p_pass, p_timeout, E_cost, E_time` for each action
3) filter by hard constraints (validity + safety caps)
4) choose `argmax` utility (or Pareto / lexicographic rule)

### 6.1 Conservative rollout policy (recommended v1)

Initially enforce only **reductions vs baseline**:

- never increase `max_candidates` above baseline
- never increase timeout above baseline
- never switch topology unless explicitly allowed (e.g., `speculate_vote → serial_handoff` might be allowed; `serial_handoff → speculate_vote` usually not)

This gives you “free wins” (cost reductions) without risking more failures.

### 6.2 Logging policy outputs

For each decision, log:

- predicted per-action summaries for top-k actions
- chosen action + rationale (which constraint bound)
- abstain reason (low confidence, out-of-distribution, missing bundle, etc.)

This is essential for debugging “why did it do that?”.

---

## 7) Counterfactual coverage: how to build the best dataset

The bottleneck is not model size; it’s **coverage of (x,a)** pairs.

### 7.1 Candidate selection policy (for best-of-K benches)

Minimum requirements:
- always include baseline action
- include at least one alternative topology (when valid)
- include at least one “cheaper” and one “more expensive” budget variant (when safe)
- ensure global coverage of action bins over time (stratified sampling)

Recommended upgrade path:

1) **Stratified sampler** over `VALID_ACTIONS` buckets (swarm × candidates × minutes).
2) **Uncertainty-driven sampler** once `Q` exists:
   - include top predicted utility actions
   - include high-uncertainty actions (to reduce epistemic uncertainty)
3) **Anchor enumeration**:
   - pick a small anchor slice (e.g., 50 issues/week) and evaluate *all* (or most) actions to detect blind spots and regressions.

### 7.2 Avoid confounding with GEPA

Prompt genomes change outcomes. For benches:
- either pin prompt_genome_id (fixed champion) during a bench run, or
- treat prompt_genome_id as part of the stability hash and stratify results by it.

If you change the frontier mid-bench, your counterfactual labels stop being comparable.

---

## 8) Drift control: dataset “epochs” must include GEPA + toolchains

Stage A can sometimes ignore drift because it learns the current behavior. Outcome learning cannot.

Define a dataset epoch by these hashes:

- `kernel_config_hash` (routing/speculation/control/toolchain timeouts)
- `universe_hash` (swarms/objectives validity)
- `prompt_frontier_hash` (GEPA active set + selector)
- `toolchain_versions` (LLM model revs; adapter versions)

Rules:
- if any of these change materially → start a new epoch (new dataset dir, new model bundle lineage).
- keep a “latest” pointer, but never mix epochs silently when reporting results.

---

## 9) Off-policy evaluation (optional, but the “right” way to iterate)

OPE lets you estimate policy improvement without deploying it broadly.

### 9.1 What you need for IPS/DR

From production logs you need:
- executed action `a`
- realized reward/outcome `r`
- behavior policy propensity `π_b(a|x)` (logged)

And for doubly-robust (DR) estimators:
- a learned model `Q(x,a)` (or reward model)

If your behavior is deterministic (propensity 1 for one action), IPS is useless. You need at least a small randomized exploration policy (see §10).

### 9.2 DR estimator (high level)

For a target policy `π_e`, the per-sample DR estimate is:

```
DR = Q_hat(x, π_e(x)) + (π_e(a|x)/π_b(a|x)) * (r - Q_hat(x,a))
```

Aggregate over samples to estimate expected reward. Use self-normalized variants for stability when propensities get small.

---

## 10) Safe online exploration (optional, staged rollout)

Exploration is how you keep learning without running huge benches forever.

### 10.1 Principle: explore only where it’s safe

Start with exploration constrained to “no-upgrades vs baseline”:
- for speculate issues: explore lower parallelism and/or shorter timeout
- for serial issues: explore slightly longer timeout only in a tagged lab lane (optional)

Keep exploration limited to:
- `dk_priority=P3` or tagged `lab:planner_explore`
- a fixed small budget (e.g., 1–5% of runs)

### 10.2 Deterministic pseudo-randomness

To preserve reproducibility while still being “random enough”, use a deterministic RNG seeded by:
- hash of normalized `planner_input` (e.g., `planner_action.input_hash` / `hash_planner_input(planner_input)`) or `run_id`
- an epoch seed

Log:
- the exploration decision (explore vs exploit)
- the propensity
- the seed material or derived `u∈[0,1)`

### 10.3 Exploration policies

Recommended v1: epsilon-greedy over a safe action set.

- With probability `1-ε`: choose best action under current `Q` (or baseline early on)
- With probability `ε`: choose uniformly from `A_safe(x)`

Propensities:
- if exploit action is `a*`:
  - `π_b(a*|x) = 1-ε + ε/|A_safe|`
  - for other `a`: `π_b(a|x) = ε/|A_safe|`

---

## 11) Packaging and integration (kernel-safe)

### 11.1 Bundle contents

For an outcome/value planner:

- `planner_value.onnx` (or a small set of ONNX models)
- `vocab.json`
- `action_space.json`
- `calibration.json` (for `p_pass` and/or utility)
- `bundle_meta.json` including stability hashes and training dataset hash

### 11.2 Kernel integration modes

- `off`: baseline policy only, no inference.
- `log`: run inference and record predictions, but execute baseline.
- `enforce`: execute chosen action, but only under safe constraints initially.

### 11.3 Mandatory safety checks

- validate action tuple is in `VALID_ACTIONS`
- enforce caps (no upgrades unless explicitly allowed)
- abstain on:
  - missing bundle / inference error
  - low confidence / high uncertainty
  - out-of-epoch mismatch (bundle stability hashes disagree with runtime environment)

---

## 12) Implementation plan (phases + acceptance criteria)

### Phase 0 — Logging upgrades (1–3 days)

- Add `policy_trace.v1` logging (policy_id + propensity + stability hashes).
- Ensure prompt genome + toolchain/model versions are recorded for each run.
- Acceptance:
  - all new fields present in 95%+ of archives
  - stable epoch hashes are reproducible

### Phase 1 — Counterfactual dataset maturity (3–10 days)

- Upgrade best-of-K candidate selection for coverage (stratified buckets).
- Add a weekly “anchor enumeration” slice.
- Acceptance:
  - outcome dataset spans all action bins you intend to learn
  - bench results are stable (repeatable within expected variance)

### Phase 2 — Train `Q(x,a)` + calibrate (3–14 days)

- Train multi-task outcome/value model.
- Calibrate `p_pass` (temperature/isotonic) and validate uncertainty behavior.
- Acceptance:
  - strong AUC / calibration on held-out epoch slice
  - predicted tradeoffs correlate with real bench outcomes

### Phase 3 — Integrate as a logged policy (3–10 days)

- Add ONNX inference module that scores all actions and produces a chosen action + rationale.
- Run in `planner.mode=log` for 1–2 weeks.
- Acceptance:
  - artifacts include predicted outcomes + chosen action + baseline action
  - no run regressions (since baseline still executes)

### Phase 4 — Conservative enforcement (3–14 days)

- Enable `enforce` for safe reductions only.
- Acceptance:
  - no pass-rate regression beyond agreed tolerance
  - measurable cost/latency improvement

### Phase 5 — Safe exploration + OPE (optional, ongoing)

- Enable ε-greedy in a lab lane with propensities logged.
- Add DR OPE reports to the weekly planner audit.
- Acceptance:
  - OPE correlates with canary results
  - exploration does not create unacceptable failure regressions
