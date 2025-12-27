# Benchmarks (Criterion)

This workspace uses Criterion for performance benchmarks across the `ai-*` crates.

## Quick start

From the repo root:

```bash
cd crates

# Run a specific crate's benchmark
cargo bench -p ai-nav --bench nav_mesh
cargo bench -p ai-crowd --bench crowd
cargo bench -p ai-goap --bench planner
cargo bench -p ai-htn --bench planner
cargo bench -p ai-bt --bench tick
```

Criterion reports are written to `crates/target/criterion/`.

## Baselines (regressions / comparisons)

Save a baseline:

```bash
cd crates
cargo bench -p ai-nav --bench nav_mesh -- --save-baseline my-machine
```

Compare to a saved baseline:

```bash
cd crates
cargo bench -p ai-nav --bench nav_mesh -- --baseline my-machine
```

See `BENCHMARKS.md` for what each benchmark measures.
