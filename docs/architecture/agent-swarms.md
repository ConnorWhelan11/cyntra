# Agent Roles + Swarms — Architecture Spec

Status: **Draft** (design spec). Builds on `docs/universe.md` and formalizes “how groups of agents work” in a repeatable way.

## 1) Purpose

Define reusable **agent roles** and **swarm topologies** that can be applied across universes (Fab worlds, codebases, datasets) to produce:

- deterministic candidate generation,
- bounded evaluation,
- repair loops,
- evidence-driven selection,
- frontier/memory updates,
- promotion of best-known artifacts.

## 2) Agent roles (canonical interface)

Each role should be describable as:

- **Inputs**: run context + artifacts + policies
- **Action**: deterministic or LLM-driven transformation
- **Outputs**: new artifacts with schemas + provenance pointers
- **Stop conditions**: success/failure/escalate

### 2.1 Generator

Goal: propose candidate deltas (genome mutations / patches).

Outputs (minimum):
- `candidate_delta.json` (machine-readable delta)
- `candidate_plan.md` (optional; human-readable)
- `risk.json` (optional; predicted risk/cost)

### 2.2 Repairer

Goal: fix failures (usually from gate verdict `next_actions`), producing a new candidate delta.

Key design: **repairs must be local and minimal** (avoid turning repair into a full redesign unless allowed).

### 2.3 Curator

Goal: decide what is “ship-worthy” and promote it:

- update shelf (best-known pointer),
- publish to viewer/gallery,
- produce “release bundle” with provenance.

### 2.4 Historian

Goal: translate run artifacts into memory substrate:

- extract patterns (what worked/failed),
- summarize deltas and outcomes,
- write structured memory blocks (with citations to run ids).

### 2.5 FrontierManager

Goal: maintain Pareto frontiers and detect regressions:

- ingest new evidence,
- update nondominated sets,
- track champion changes,
- optionally schedule replays for determinism scoring.

### 2.6 BudgetController

Goal: control spend and time via policies:

- reduce population on repeated failures,
- increase compute for promising candidates,
- choose multi-fidelity thresholds,
- enforce “stop early” rules.

### 2.7 RedTeam

Goal: attempt to break contracts:

- determinism violations,
- policy violations (network/tool use),
- adversarial inputs that should fail gates cleanly (not crash).

Outputs:
- `redteam_report.json` (violations + repro steps)

### 2.8 HumanPreferenceProxy

Goal: integrate human ratings into selection and frontier ranking.

Inputs:
- “thumbs up/down”, star ratings, side-by-side comparisons.

Outputs:
- `human_rating.jsonl` events
- optional learned model for preference prediction (future)

## 3) Swarm topologies (patterns)

Swarms are not “just parallelism”. They are **search + coordination policies** with contracts.

### 3.1 Parallel compete + vote (`parallel_compete`)

Use when:
- mutations are high-risk,
- evaluation is relatively expensive,
- you want diversity and a clean selection rule.

Semantics:
- generate `K` candidates,
- evaluate all,
- select deterministically by objective ordering (with stable tie-breakers),
- optionally run a “vote pack” on top candidates if scores are close.

### 3.2 Serial handoff (`serial_handoff`)

Use when:
- pipeline is structured (build → critic → repair → re-evaluate),
- you want a small population but deeper iteration per candidate.

Semantics:
- one candidate at a time,
- stepwise refinement until pass or budget exhausted,
- produces fewer runs but higher per-run quality.

### 3.3 Multi-fidelity funnel (`multi_fidelity_funnel`)

Use when:
- full evaluation is expensive (Blender renders, Godot export),
- you can cheaply filter bad candidates early.

Example phases:
1. **Cheap**: schema checks + static budgets + fast heuristics
2. **Medium**: limited renders + lightweight critics
3. **Full**: full gate suite + determinism probe

Key requirement: each phase must emit a **compatible metric surface** so selection remains well-defined.

### 3.4 Explorer / Exploiter split (`explore_exploit`)

Use when:
- you want novelty without losing hill-climb efficiency.

Semantics:
- split population into `explore_k` and `exploit_k`,
- explorers maximize novelty/diversity subject to minimal gate health,
- exploiters mutate from frontier parents.

### 3.5 Tournament over parents (`tournament_parents`)

Use when:
- single-parent hillclimb gets stuck.

Semantics:
- sample `P` parents from the frontier (weighted by recency, diversity, or score),
- generate child candidates from each,
- evaluate and select.

### 3.6 Adversarial swarms (`adversarial`)

Use when:
- robustness matters (determinism, budgets, crash safety).

Roles:
- Generator proposes candidates,
- FailureFinder proposes “edge-case” parameterizations,
- Repairer tries to make the pipeline resilient to those edge cases.

Outputs:
- improved guardrails, better failure modes, fewer crashes.

## 4) Swarm configuration (DSL sketch)

Swarms should be defined in `universes/<id>/swarms.yaml` and be fully declarative.

Minimal conceptual schema:

```yaml
swarms:
  speculate_vote:
    type: parallel_compete
    population_size: 3
    selection:
      mode: objectives            # or gate_score_max, weighted_sum, human_rating
      require_all_gates_pass: true
      tie_breakers: [duration_ms, run_id]
    vote_pack:
      enabled: true
      trigger_margin: 0.02

  funnel_v1:
    type: multi_fidelity_funnel
    population_size: 12
    phases:
      - id: cheap
        evaluator: static_checks
        promote_if: {passes: true}
      - id: medium
        evaluator: partial_world
        until_stage: export
        promote_if: {overall: ">=0.6"}
      - id: full
        evaluator: full_world
        until_stage: validate
    selection:
      mode: objectives
      require_all_gates_pass: true
```

## 5) Determinism rules for swarms (hard requirements)

1. Stable ordering for candidate ids and selection comparisons.
2. Seed usage must be explicit and recorded (mutation RNG, world seed, critics seed).
3. Any nondeterministic tool must be pinned or excluded from “frontier eligibility”.
4. Tie-breakers must be deterministic (e.g., `run_id`).

## 6) Human-in-loop triggers (escalation)

A swarm should be able to request human review when:

- all candidates fail but the failure modes are ambiguous,
- the objective differences are within a small margin,
- a candidate violates a policy but might be acceptable with explicit approval,
- a regression is detected vs the current champion.

“Escalate” should produce a **review packet**:
- top candidates (renders + metrics),
- diffs/deltas,
- gate failures and suggested next actions,
- provenance links to run ids.

