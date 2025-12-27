# AI Planning Contract (PlanNode + GOAP + HTN)

This repo has several primary ways to run “plans” (a sequence of action specs) deterministically:

- `ai-core::PlanSpec` + `ai-core::PlanExecutorAction` (plan-as-data, executed as an action)
- `ai-bt::PlanNode` (planner-agnostic BT leaf that runs a `PlanSpec`)
- `ai-goap::{GoapPlanPolicy, GoapPlanNode}` (GOAP planner + cached plan execution)
- `ai-htn::HtnPlanPolicy` (HTN planner + cached plan execution)

The goal of this document is to keep caching/invalidation and “done” semantics consistent across
these embeddings.

## 1) Done vs Action Success

`PlanExecutorAction` reports `Success` when all steps return `Success`.

That does **not** necessarily mean the agent’s _goal_ is satisfied:
the action specs might be stale, the world may have changed, or the modeled effects may not have
occurred.

**Contract:**

- If you have an explicit goal predicate, treat **goal satisfaction** as the source of truth for
  “done”.
- If a plan action reports `Success` but the goal is still unmet, treat it as **no progress**:
  clear the cached plan and trigger a replan.

Implementations:

- `ai-bt::PlanNode`: provide `.with_done(...)`. When set, the node returns `Success` only when
  `done_fn` is true; a plan action `Success` while `done_fn` is false triggers replan.
- `ai-goap::GoapPlanPolicy/Node`: `goal_fn` provides desired facts; done is `(start & goal) == goal`.
  A plan action `Success` while the goal is still unmet triggers replan.
- `ai-htn::HtnPlanPolicy`: provide `.with_done(...)` (same semantics as `PlanNode`).

## 2) Invalidation vs Cache Keys

Planning can be expensive, so we cache when possible. But caching is only safe when the cache key
captures _all_ inputs that influence the planned result.

**Contract:**

- **Invalidation key**: when it changes, a currently-running plan is considered invalid and should
  be cancelled/restarted (subject to throttling/backoff).
- **Cache key**: when it matches, the previously computed plan may be reused.

`ai-bt::PlanNode` supports these explicitly:

- `.with_invalidation_key(...)`: drives cancel/restart while running.
- `.with_cache_key(...)`: enables plan caching.
- `.with_signature(...)`: convenience for “same function for invalidation + caching”.

`ai-goap` uses:

- Plan cache key = `(start, goal, signature)`
- `signature` is the explicit invalidation input for planner-dependent facts not in `start/goal`.

If your GOAP planning depends on additional facts beyond `start`/`goal`, include them in the
`signature` (or encode them into the `start` state).

`ai-htn` mirrors `PlanNode`:

- `.with_invalidation_key(...)`: drives cancel/restart while running.
- `.with_cache_key(...)`: enables plan caching.
- `.with_signature(...)`: convenience for “same function for invalidation + caching”.

## 3) Backoff + Loop Protection

**Contract:**

- Support throttling to avoid cancel/restart thrash when inputs fluctuate.
- Provide an optional restart budget to prevent infinite restart loops when the world never reaches
  the goal.

Implementations:

- `ai-bt::PlanNodeConfig.min_replan_interval_ticks` and `.max_plan_starts_per_key`
- `ai-goap::GoapPlanPolicyConfig.min_replan_interval_ticks` and `.max_plan_starts_per_key`
- `ai-htn::HtnPlanPolicyConfig.min_replan_interval_ticks` and `.max_plan_starts_per_key`
