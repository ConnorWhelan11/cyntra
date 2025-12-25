# Genome Surfaces — Architecture Spec

Status: **Draft** (design spec). This describes a generalized “genome surface” model that covers worlds, gates, policies, prompts/tools, and memory.

## 1) Purpose

A **genome surface** is the explicit set of knobs Cyntra is allowed to change. It must be:

- small and intentional (high leverage, low chaos),
- machine-readable (validated against schema),
- deterministic to mutate (seeded),
- provenance-safe (every delta traceable to a run id).

## 2) Genome categories (targets)

### 2.1 World genome (Fab Worlds)

- Target: `fab/worlds/<world_id>/world.yaml` parameters (via dot-path keys).
- Storage: `fab/worlds/<world_id>/genome.yaml` (world-owned).

### 2.2 Gate genome

- Target: gate config YAML(s) (weights, thresholds, floors).
- Storage: `universes/<id>/genomes/gates/<gate_id>.yaml` (universe-owned), or colocated with gates if appropriate.

### 2.3 Policy genome

- Target: universe policies (routing, budgets, determinism flags, retention).
- Use case: “meta-evolution” of the system’s own operating parameters.

### 2.4 Prompt/tool genome

- Target: instruction blocks, tool rules, sampling params, repair playbooks.
- Use case: evolve agent behavior with evidence (not vibes).

### 2.5 Memory genome

- Target: memory retrieval parameters (top-k, decay, eligibility filters).
- Use case: tune “what the system remembers” as an optimization problem.

## 3) Unified genome surface schema (conceptual)

This is a proposed general schema; specific targets may constrain it further.

```yaml
schema_version: "1.0"
genome_id: outora_library_surface_v1
target:
  kind: fab_world
  id: outora_library
  path: fab/worlds/outora_library/world.yaml

mutation:
  per_candidate: 1
  strategy: random_uniform
  seed_scope: universe_seed

genes:
  - key: lighting.preset
    kind: enum
    values: [dramatic, warm_reading, cosmic]

  - key: layout.complexity
    kind: enum
    values: [low, medium, high]

constraints:
  - when: {layout.complexity: high}
    require: {bake.mode: all}
```

## 4) Gene kinds (recommended v1 set)

- `enum`: pick from a fixed set
- `bool`: toggle
- `int_range`: bounded integer with step
- `float_range`: bounded float with step or distribution
- `choice_weighted`: categorical distribution (evolves weights over time)
- `template_ref`: discrete template selection (high leverage)
- `json_patch`: structured patch against a JSON/YAML document (advanced; high risk)

Design rule: prefer `enum` and `template_ref` first. They make reproducibility and debugging dramatically easier.

## 5) Mutation operators

### 5.1 Deterministic mutation

Given a parent value and a seeded RNG:

- mutation must be a pure function,
- must avoid “no-op” mutations where possible,
- must record `from` and `to` per gene.

### 5.2 Operator examples

- `random_other`: choose any value except current
- `gaussian_step`: move along numeric range (clamped)
- `swap`: swap two categorical assignments (useful for template lists)
- `conditional`: only mutate if constraints satisfied

## 6) Canonicalization (candidate identity)

To make evolution replayable:

1. Candidate overrides must be serialized canonically (stable key ordering).
2. Candidate id digest must be derived from canonical serialization.
3. Run ids should embed the digest (or store it in context).

Example digest rule:

- canonical JSON: `sort_keys=true`, `separators=(",", ":")`
- digest: `sha256(canonical_bytes)[:12]`

## 7) Applying deltas (target-specific)

### 7.1 Dot-path overrides (world genomes)

- base = world defaults or frontier parent params
- override = set nested keys by dot-path
- result = full parameter set used for the run

### 7.2 Patch-based overrides (advanced)

For gates/policies/prompts, prefer:
- small, typed parameter surfaces first,
- promote to patches only when surfaces are stable.

## 8) Provenance requirements

Every candidate run should record:

- parent values used,
- applied delta,
- resulting full override map,
- digest,
- universe/world/objective/swarm join keys,
- git revision.

This makes it possible to:
- rebuild frontiers from scratch,
- explain “why this won”,
- reproduce or debug failures.

## 9) Expansion strategy (how to grow safely)

1. Start with 3–10 high-leverage genes.
2. Run small evolutions; confirm determinism and stable selection.
3. Add one gene at a time; ensure gate failures remain interpretable.
4. Promote to richer gene kinds only after you have stable evidence flows.

