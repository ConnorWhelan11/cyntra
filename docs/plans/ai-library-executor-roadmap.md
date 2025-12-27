# Executor Roadmap: Next Subsystems

This repo is building an engine-agnostic, deterministic AI substrate (actions + policies + plan
execution) and then layering decision + navigation + tooling on top.

Status (implemented):

- `ai-core`: deterministic tick + action runtime + plan execution (`PlanSpec` + `PlanExecutorAction`)
- `ai-bt`: abort-friendly reactive BT nodes, plus planner-agnostic `PlanNode`
- `ai-goap`: deterministic GOAP planner, policy wrapper, and optional BT node
- `ai-htn`: deterministic HTN planner producing `PlanSpec` (BT embedding via `ai-bt::PlanNode`)
- `ai-nav`: deterministic grid A\*, plus an initial triangle-based navmesh backend
- `ai-crowd`: deterministic preferred-velocity + separation steering (spatial hashing via deterministic buckets)
- `ai-tools`: lightweight trace events + Blackboard hook, with `PlanNode`/GOAP emitting planning/replan/outcome events
- `ai`: umbrella crate re-exporting `ai-*` + embedded rustdoc guides

## Next: Navigation (navmesh “v1” → “v2”)

1. Navmesh API hardening
   - Expose poly/portal-level query results for debug drawing (corridor + portals) ✅
   - Add stable IDs for triangles/polys and optional serialization (`serde` feature) ✅
   - Expose funnel corners/corridor corners for debug drawing ✅
   - Add allocation-reuse query APIs (`NavMeshQuery`, `find_path_into`, `find_corridor_into`) ✅
2. Baking
   - “v1”: accept user-provided triangles/polys (already supported)
   - “v2”: add a simple 2D polygon baker (earcut/triangulation) or a 2.5D heightfield pipeline
   - “v3”: tiled build + incremental rebuild regions
3. Runtime
   - Dynamic obstacles: obstacle “version” → invalidate path/plan signatures deterministically
   - Path following helpers: corridor tracking, local steering hooks

## Next: Crowds / Local Avoidance

- New crate: `ai-crowd`
  - v0: deterministic steering primitives (separation + preferred velocity) ✅
  - Add spatial hashing for 1k–10k agents (stable bucket ordering) ✅
  - Upgrade path: ORCA/RVO-style constraints (feature-gated)

## Next: Decision Expansion

- Utility AI
  - New crate: `ai-utility` with a deterministic selector policy (stable tie-breaks) ✅
  - Optional BT integration: utility selector node as a leaf/selector primitive (`ai-utility/bt`) ✅
- HTN
  - New crate: `ai-htn` producing `PlanSpec` (plan-as-data), executed via `PlanExecutorAction` ✅
  - Replanning triggers: explicit invalidation key + goal predicate, reuse `ai-bt::PlanNode` ✅
  - Standalone `ai-core::Policy` wrapper: `ai-htn::HtnPlanPolicy` (same cache/done/budget contract as `PlanNode`) ✅

## Next: Tooling / Tracing

- New crate: `ai-tools`
  - v0: Blackboard-based trace sink/log + plan events from BT/GOAP ✅
  - Optional JSON export: `ai-tools/serde` + serde roundtrip tests ✅
  - Criterion benches + baseline workflow docs (see `crates/benches/README.md`) ✅
  - Expand schema (policy ticks, action starts/cancels/outcomes, nav/crowd debug)
  - In-engine debug drawing hooks (navmesh, paths, BT/GOAP introspection)
  - Determinism + replay: stable trace logs + determinism tests ✅

## Next: Engine Adapters (Bevy First)

- New crate: `ai-bevy`
  - Bevy ECS adapters for `WorldView/WorldMut`, nav world, debug draw, and optional inspector UI

## Next: Serialization / Hot Reload

- Keep core data model serializable (plan specs, GOAP domains, BT graphs)
- Versioned schemas + hot reload hooks (feature-gated)

## Next: ML Policy Boundary

- New crate: `ai-ml`
  - Define inference boundary as a `Policy` implementation + “safety wrapper”
  - Keep training out-of-scope; only inference + integration tests
