# Cyntra Swarm Planner — Executed Plan Dataset Collection (v1)

**Status:** Draft operating spec  
**Last updated:** 2025-12

This document defines a **high-signal, low-noise** strategy to build a large **“executed_plan”** dataset for Stage A training of the Swarm Planner policy model. The dataset is collected as a **byproduct of real kernel usage**, with deliberate controls to ensure **label consistency**, **action diversity**, and **workcell-reproducible outcomes**.

---

## 1) Goals

We want a dataset that is:

- **Large**: thousands → tens of thousands of examples over time.
- **Consistent**: identical or near-identical inputs should not map to contradictory labels due to config drift.
- **Diverse**: covers the action bins we can actually execute today (serial vs speculate, parallelism bins, timeout bins).
- **Realistic**: collected from real tasks that exercise the kernel + verifier + toolchain stack.
- **Deterministic to rebuild**: repeated dataset builds from the same artifacts produce the same dataset hash.

This dataset is used for **Stage A pretraining** (learn priors and sensible defaults). It is _not_ the final quality signal (Stage B best-of-K/outcome labels are).

---

## 2) Non-goals

- Achieving “oracle” labels (that is Stage B via best-of-K / enumeration).
- Optimizing for only-successful runs. Failures/timeouts are valuable for history features and calibration.
- Multi-repo generalization on day one. Start with a single repo/domain where gates are stable.

---

## 3) Definitions

- **Executed plan (label):** What the kernel actually executed for a run (swarm mode + budgets/caps), as recorded under `manifest["planner"]["executed_plan"]`.
- **Example:** One archived run in `.cyntra/archives/*` producing one training row in `dataset.jsonl`.
- **Stable environment:** A fixed `(universe_id, .cyntra/config.yaml policy surface, toolchain timeouts/models, gates)` during a collection window.
- **Lane mix:** A controlled mixture of issue types that yields a target distribution of executed actions (serial vs speculate×2 vs speculate×3, toolchain timeouts, etc).

---

## 4) Dataset artifact and tooling

### 4.1 Primary artifact store (append-only)

- `.cyntra/archives/<workcell_id>/manifest.json`
- `.cyntra/archives/<workcell_id>/proof.json`
- `.cyntra/archives/<workcell_id>/rollout.json` (when present)

These are the raw materials for rebuilding datasets. Prefer treating `.cyntra/archives/` as append-only.

### 4.2 Dataset build command (current)

Build the executed-plan dataset from local artifacts:

```bash
PYTHONPATH=kernel/src python -m cyntra.cli planner build-dataset \
  --out .cyntra/benches/planner_dataset_v1 \
  --no-include-world
```

Notes:

- This builder reconstructs `planner_input` deterministically from archives + Beads issue metadata and uses the run’s executed plan as the label.
- `meta.json` contains `dataset_hash`, counts, split sizes, and `universe_id`.

---

## 5) Stability contract: dataset versioning

### 5.1 What must be stable during a collection window

Keep these effectively fixed while collecting a given dataset version:

- `universe_id` and universe defaults that affect swarm catalogs and validity rules.
- prompt genomes / GEPA frontier and selection defaults (the `prompts/` tree + selector behavior).
- `.cyntra/config.yaml` sections:
  - `routing.rules` / `routing.fallbacks`
  - `speculation.*` (enabled, default/max parallelism, triggers)
  - `control.*` (anything that changes parallelism/sampling decisions)
  - `toolchains.*.timeout_*` and default model selection
  - `gates.*` (commands/timeouts)

### 5.2 When to start a new dataset version

Start a new dataset version (new output dir) when you make changes that can flip executed labels for the same inputs:

- speculation triggers/risk thresholds change
- toolchain timeout defaults change
- toolchain priority/routing changes
- universe swarm catalogs change materially
- prompt genome promotions or changes to genome selection policy (GEPA frontier drift)

### 5.3 GEPA interaction (how this integrates)

GEPA changes the _effective agent policy_ (prompt genomes + sampling defaults). That impacts:

- **Stage A (“executed_plan”) realism:** the label is usually unchanged, but the _distribution of outcomes_ and the history features can drift.
- **Stage B (outcome labels):** prompt quality can dominate which swarm/budget choices win, so you should treat GEPA state as part of the environment.

Operational rules:

- During a planner dataset “policy epoch”, keep the active **prompt frontier** stable (or record it and cut a new dataset version when it changes).
- For **GEPA benches**, keep planner behavior fixed (`planner.mode=off` or `log`) so prompt comparisons aren’t confounded by changing budgets/topology.
- When you do deploy `planner.mode=enforce`, re-run GEPA evaluation under that same planner policy (prompts and planner co-adapt; don’t assume transfer).

Recommended convention:

- `.cyntra/benches/planner_dataset_v1_YYYYMMDD/` per “policy epoch”
- keep `planner_dataset_v1/` as the rolling “latest”

---

## 6) Operational collection pattern (“always-on”)

### 6.1 Run the kernel as a stream, not a batch

Use `--watch` and keep a real queue so the system sees varied schedule pressure:

- `max_concurrent_workcells=2–3`
- keep **10–50 ready issues** in Beads

This yields a realistic distribution of issue mixes, workcell churn, and (eventually) system_state signals.

### 6.2 Avoid one-off “hero runs”

One-offs overfit the dataset to whatever you happened to run that day. The goal is consistent, repeated exposure to diverse work shapes.

---

## 7) Action coverage strategy (what you should run)

### 7.1 Cover the bins that exist today

You want strong coverage across:

- `swarm_id`: `serial_handoff` vs `speculate_vote`
- `max_candidates_bin`: `1` vs `2` vs `3` (primarily driven by speculation parallelism)
- `max_minutes_bin`: `45` vs `60` (primarily driven by toolchain routing today)

### 7.2 Lane mix targets (3-lane strategy)

Maintain a backlog whose _steady-state_ execution roughly matches:

- **Lane A (50–70%)**: low/medium risk, XS–M, mostly `serial_handoff`
- **Lane B (20–40%)**: high risk, M–XL, mostly `speculate_vote ×2`
- **Lane C (5–15%)**: critical risk, L–XL, mostly `speculate_vote ×3`

You don’t need perfect ratios daily; you want these ratios over a week.

### 7.3 How to actually produce those lanes

The scheduler’s behavior is dominated by Beads issue metadata:

- `dk_risk` drives whether speculation triggers.
- `dk_size` and tags influence routing/toolchain choice.
- explicit `dk_tool_hint` and `dk_speculate=true` can override.

Practical levers:

- Ensure you always have at least a few `dk_risk=high` issues ready (for speculate×2).
- Ensure you always have 1–2 `dk_risk=critical` issues ready (for speculate×3).
- Keep a steady pool of `dk_risk=low/medium` issues for serial coverage.

---

## 8) Project/domain selection (minimize label-noise)

### 8.1 Start where gates are stable in workcells

Collect your first large dataset primarily from **`kernel/` code tasks**, because:

- gates are already configured (`pytest`, `mypy`, `ruff`)
- Python deps are more likely to be present/reproducible across workcells

### 8.2 Expand only after reproducibility is proven

Only expand to:

- `apps/desktop` (Node/Rust) when installs/builds are deterministic in workcells, and gates reflect that project.
- `fab-world` once deterministic world runs are regularly passing and archived.

If you collect lots of “failures for environment reasons” (missing deps/build tooling), your history features become noisy and your dataset becomes less predictive.

---

## 9) Issue writing guidelines (make labels learnable)

The model only sees what’s in `planner_input` (tags/keywords/risk/size/history), so keep issue metadata high-quality:

- Use accurate `dk_risk` and `dk_size`.
- Add meaningful tags (domain tags like `kernel`, `architecture`, `deep-reasoning`, `asset:*`).
- Write descriptive titles and descriptions (keywords are hashed and become features).
- Avoid vague placeholders (“fix stuff”, “update”) unless you truly don’t care about learnability.

Optional: create a few reusable issue templates (tiny bugfix, test stabilization, refactor, perf, etc.) and stamp them out as needed.

---

## 10) Weekly audit → targeted fill loop

### 10.1 Weekly audit checklist

1. Summarize available examples:

```bash
PYTHONPATH=kernel/src python -m cyntra.cli planner stats --no-include-world
```

2. Rebuild dataset deterministically and record the hash:

```bash
PYTHONPATH=kernel/src python -m cyntra.cli planner build-dataset \
  --out .cyntra/benches/planner_dataset_v1 \
  --no-include-world
```

3. Inspect label distribution (at minimum):

- `swarm_id` frequency
- `max_candidates_bin` frequency
- approximate timeout bins (45 vs 60)
- breakdown by `dk_risk` and `dk_size`

### 10.2 Targeted fill heuristics

If you see gaps, adjust the backlog intentionally:

- Too few speculate examples → add more `dk_risk=high/critical` and ensure routing rules actually trigger speculation.
- Too few `max_candidates_bin=3` → ensure `dk_risk=critical` issues exist and routing specifies `parallelism: 3` for critical.
- Too few `max_minutes_bin=45` → ensure you have a steady stream of XS/S low-risk issues that route to `opencode` (or the 45m toolchain).

---

## 11) Storage, retention, and hygiene

### 11.1 Don’t lose the core artifacts

At minimum, keep per-run:

- `manifest.json`
- `proof.json`
- `rollout.json` (when present)

These allow deterministic dataset rebuilds and debugging of label drift.

### 11.2 Prune the heavy parts (optional)

If disk pressure grows, prune old per-run log directories while keeping core JSON artifacts. A common policy:

- keep full logs for the last 7–14 days
- delete `archives/*/logs/` older than that

### 11.3 Workcell hygiene

If workcells accumulate or disk spikes, use `cyntra cleanup` or remove stale worktrees. Keep `.cyntra/archives` intact.

---

## 12) Phased plan (recommended)

### Phase 0 — Prove reproducibility (1–2 days)

- Run `cyntra run --watch` on a small backlog (10–15 issues).
- Confirm archives contain `manifest.json` + `proof.json` consistently.
- Confirm gates are meaningful and not failing for “missing tooling” reasons.

### Phase 1 — Scale to first useful model (3–7 days)

- Maintain the lane mix (A/B/C).
- Collect **500–2,000** examples.
- Train the Stage A baseline (Transformer) and evaluate for collapse (entropy) and basic accuracy.

### Phase 2 — Grow to stable priors (1–3 weeks)

- Collect **5,000–20,000** examples with stable policy.
- Re-train weekly; track drift and ablate features if needed.

### Phase 3 — Prepare for Stage B (parallel)

- Identify a slice of issues that frequently produce at least one passing candidate.
- Run best-of-K / enumeration to produce outcome labels and fine-tune.
