# Benchmarks Index

This file documents what each Criterion benchmark measures and what it’s intended to catch.

## `ai-nav`

- `nav_mesh`: `NavMesh` funnel/path and corridor query throughput (includes A\* over triangle regions).

## `ai-crowd`

- `crowd`: `Crowd::step_velocities` performance for `1_000` and `10_000` agents.

## `ai-goap`

- `planner`: `GoapPlanner::plan` latency on a small toy domain.

## `ai-htn`

- `planner`: `HtnPlanner::plan` latency on a small toy domain.

## `ai-bt`

- `tick`: BT tick cost for a reactive tree with multiple conditions.

---

# Baselines (recorded)

These are “known-good” reference numbers captured on a real machine.

## Baseline: 2025-12-27 (local)

- Machine: Apple M1 Max (arm64), macOS 14.2 (23C64)
- Rust: rustc 1.92.0 (ded5c06cf 2025-12-08), cargo 1.92.0
- Repo: commit `6402cbb`
- Command pattern: `cd crates && cargo bench -p <crate> --bench <name> -- --noplot`

### `ai-nav` / `nav_mesh`

Scenario: 64×64 grid of triangles, `start=(0.1,0.1)`, `goal=(63.9,63.9)`.

| Benchmark                             | Time (lower / estimate / upper)     |
| ------------------------------------- | ----------------------------------- |
| `ai-nav/navmesh/find_path_alloc`      | `74.595 µs / 78.310 µs / 82.762 µs` |
| `ai-nav/navmesh/find_path_into_reuse` | `67.257 µs / 67.514 µs / 67.795 µs` |
| `ai-nav/navmesh/corridor_alloc`       | `70.023 µs / 70.221 µs / 70.438 µs` |
| `ai-nav/navmesh/corridor_into_reuse`  | `68.094 µs / 68.439 µs / 68.809 µs` |

### `ai-crowd` / `crowd`

Scenario: grid of agents with separation + preferred velocity.

| Benchmark                        | Time (lower / estimate / upper)     |
| -------------------------------- | ----------------------------------- |
| `ai-crowd/step_velocities/1000`  | `471.57 µs / 472.56 µs / 473.67 µs` |
| `ai-crowd/step_velocities/10000` | `6.2804 ms / 6.3206 ms / 6.3684 ms` |

### `ai-goap` / `planner`

| Benchmark                       | Time (lower / estimate / upper)     |
| ------------------------------- | ----------------------------------- |
| `ai-goap/planner.plan(bits=12)` | `2.1639 ms / 2.1689 ms / 2.1742 ms` |

### `ai-htn` / `planner`

| Benchmark                        | Time (lower / estimate / upper)     |
| -------------------------------- | ----------------------------------- |
| `ai-htn/planner.plan(steps=256)` | `1.7318 µs / 1.7415 µs / 1.7533 µs` |

### `ai-bt` / `tick`

| Benchmark                   | Time (lower / estimate / upper)     |
| --------------------------- | ----------------------------------- |
| `ai-bt/tick(conditions=32)` | `97.872 ns / 98.215 ns / 98.581 ns` |
