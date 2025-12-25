# Frontiers, Evidence, Shelf — Architecture Spec

Status: **Draft** (design spec). Aligns with existing frontier schemas and extends the ecosystem around them (indices, regressions, promotion).

## 1) Purpose

Turn raw runs into long-term value by maintaining:

- **Frontiers**: multi-objective Pareto sets of best-known runs.
- **Evidence indices**: fast lookup of valid runs and their metrics.
- **Regression tracking**: detect when a “new best” breaks something important.
- **Shelf/gallery**: always-on promotion of best-known artifacts into viewable/shippable outputs.

Core principle: **frontier updates are derived** from runs; runs are the source of truth.

## 2) Evidence model

### 2.1 Minimum evidence for frontier eligibility

A run is frontier-eligible if:

- `context.json` matches the universe/world,
- `verdict/gate_verdict.json` exists and is schema-valid,
- verdict is `pass` (unless the objective explicitly allows “fail” points),
- objective metrics can be extracted as numbers.

### 2.2 Metric surface (recommended)

Beyond `overall` and `duration_ms`, track:

- `cost_usd` (estimated or measured)
- `determinism_score` (replay stability)
- `artifact_size_mb`
- `regression_risk` (heuristic or model-based)
- `novelty_score` / `diversity_score`
- `human_rating` (if present)

Design rule: keep the **frontier file minimal**; store richer metadata in run indices.

## 3) Frontier file format (current + guidance)

Current world-frontier schema (see `cyntra-kernel/schemas/cyntra/universe_world_frontiers.schema.json`):

```json
{
  "schema_version": "1.0",
  "universe_id": "medica",
  "world_id": "outora_library",
  "generated_at": "2025-12-22T00:00:00Z",
  "frontiers": [
    {
      "objective_id": "realism_perf_v1",
      "metrics": ["overall", "duration_ms"],
      "objectives": {"overall": "max", "duration_ms": "min"},
      "points": [
        {"run_id": "evo_...", "values": {"overall": 0.82, "duration_ms": 12345}}
      ]
    }
  ]
}
```

Guidance:
- `points[*].values` should include *only* numeric objective metrics.
- Enrichments (artifact paths, digests, git rev, thumbnails) belong in:
  - `.cyntra/universes/<id>/index/runs.jsonl`, or
  - a shelf/gallery artifact (below).

## 4) Frontier update algorithm (deterministic)

For each objective set:

1. Filter eligible runs (policy + evidence contract).
2. Extract metric vector (fill missing metrics with sentinel worst-values).
3. Compute nondominated set (Pareto).
4. Stable-sort points for output (e.g., by primary objective then `run_id`).
5. Write file atomically.

Deterministic tie-breakers:
- `run_id` lexicographic
- `generated_at` must not influence ordering

## 5) Regression tracking

When frontier changes:

- identify “champion” point(s) per objective (or per user-defined selection mode),
- compare new champion to previous champion,
- emit a regression event if any “must-not-regress” metric worsens beyond tolerance.

Suggested output:

```
.cyntra/universes/<id>/regressions/<world_id>.jsonl
```

Each entry includes:
- previous run_id
- new run_id
- metric deltas
- gate verdict summaries
- link to artifacts for review

## 6) Determinism scoring (replay stability)

Determinism score should be based on replay probes, e.g.:

- re-run gate evaluation `N` times on the same artifact,
- compare:
  - `gate_verdict.json` metrics equality (within tolerance),
  - render hashes (exact or perceptual),
  - exported asset hashes (exact).

Store determinism probes as additional evidence linked to the run id (index or run-local).

## 7) Shelf + gallery (tangible value)

### 7.1 Shelf

The shelf is a machine-maintained pointer to “best-known shippable” outputs.

Proposed layout:

```
.cyntra/universes/<id>/shelf/<world_id>.json
```

Payload:
- selected `run_id`
- objective id + metrics used for selection
- artifact pointers (GLB path, renders path, proof pack)
- timestamp + git rev

### 7.2 Gallery

Gallery is a human-facing index of frontier points with thumbnails and provenance links.

Proposed output:

```
fab/outora-library/viewer/assets/gallery/<run_id>/
  outora_library.glb
  thumbnail.png
  verdict.json
  manifest.json
```

Design rule: gallery entries must be immutable; new entries add new directories.

## 8) Human preference integration (optional but high leverage)

If you collect ratings:

- treat `human_rating` as another objective metric,
- keep it separate from gate verdicts (human input is not deterministic),
- store rating events as append-only logs and compute aggregated scores.

Selection modes can then be:
- “gate pass required + maximize human_rating”
- “maximize weighted_sum(overall, human_rating)”

## 9) Operational workflows

- After each `cyntra evolve`, refresh:
  - frontiers
  - indices
  - shelf promotion (optional “auto-promote champion” policy)
- Provide a single “review packet” command for humans:
  - show top frontier points + diffs + artifacts

