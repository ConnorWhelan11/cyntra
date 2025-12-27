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
