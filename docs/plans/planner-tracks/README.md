# Cyntra Planner Implementation Tracks

**Last Updated:** 2025-12
**Master Spec:** `docs/models/swarm_planner_training_spec.md`

---

## Executive Summary

This directory contains detailed implementation specifications for the Cyntra Swarm Planner system. The planner predicts optimal swarm topology and budget configurations for issue resolution, replacing heuristic-based decisions with a trained ML policy.

### Current State

| Component | Status | Maturity |
|-----------|--------|----------|
| Schemas (planner_input, planner_action, executed_plan) | COMPLETE | 100% |
| Action Space | COMPLETE | 100% |
| Dataset Builder | COMPLETE | 100% |
| Run Summaries Extraction | COMPLETE | 100% |
| Similar Runs Retrieval | COMPLETE | 100% |
| Tokenization | NOT STARTED | 0% |
| Models (Baseline, MLP) | NOT STARTED | 0% |
| Best-of-K Bench | NOT STARTED | 0% |
| executed_plan Recording | NOT STARTED | 0% |
| Kernel Integration | NOT STARTED | 0% |
| ONNX Packaging | NOT STARTED | 0% |

**Overall Maturity: 55/100**

---

## Track Overview

| Track | Name | Priority | Owner | Est. Hours | Status |
|-------|------|----------|-------|------------|--------|
| [1](track-1-tokenization.md) | Tokenization & Encoding | P0-CRITICAL | training-agent | 22 | Not Started |
| [2](track-2-models.md) | Baseline + MLP Models | P1-HIGH | training-agent | 37 | Not Started |
| [3](track-3-best-of-k-bench.md) | Best-of-K Labeling Bench | P1-HIGH | training-agent | 48 | Not Started |
| [4](track-4-executed-plan-recording.md) | executed_plan Recording | P0-CRITICAL | kernel-agent | 25 | Not Started |
| [5](track-5-kernel-integration.md) | Kernel Inference Integration | P2-MEDIUM | kernel-agent | 38 | Not Started |
| [6](track-6-onnx-packaging.md) | ONNX Packaging | P3-LOW | training-agent | 20 | Not Started |
| [7](track-7-repo-hygiene.md) | Repo Hygiene & Debt | P3-LOW | any | 12 | Not Started |

**Total Estimated Hours: 202**

---

## Dependency Graph

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌─────────────────────────┐                              │
│  Track 1: Tokenization  │◄──────────────────────┐      │
│  (P0-CRITICAL)          │                       │      │
└───────────┬─────────────┘                       │      │
            │                                     │      │
            ├──────────────────┐                  │      │
            │                  │                  │      │
            ▼                  ▼                  │      │
┌──────────────────┐   ┌──────────────────┐      │      │
│  Track 2: Models │   │  Track 3: Bench  │      │      │
│  (P1-HIGH)       │   │  (P1-HIGH)       │      │      │
└────────┬─────────┘   └──────────────────┘      │      │
         │                      │                │      │
         │                      │                │      │
         ▼                      │                │      │
┌──────────────────┐            │                │      │
│  Track 6: ONNX   │            │                │      │
│  (P3-LOW)        │            │                │      │
└────────┬─────────┘            │                │      │
         │                      │                │      │
         │                      │                │      │
         ▼                      ▼                │      │
┌───────────────────────────────────────────┐    │      │
│  Track 5: Kernel Integration              │◄───┘      │
│  (P2-MEDIUM)                              │           │
└───────────────────────────────────────────┘           │
                    ▲                                   │
                    │                                   │
┌───────────────────────────────────────────┐           │
│  Track 4: executed_plan Recording         │───────────┘
│  (P0-CRITICAL)                            │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  Track 7: Repo Hygiene                    │ (Independent)
│  (P3-LOW)                                 │
└───────────────────────────────────────────┘
```

---

## Recommended Execution Order

### Week 1: Foundation (Parallel)

| Track | Tasks | Owner |
|-------|-------|-------|
| Track 1 | T1.1-T1.7 (Encoding) | training-agent |
| Track 4 | T4.1-T4.9 (Recording) | kernel-agent |

**Milestone:** Tokenizer encodes planner inputs; executed_plan recorded in manifests.

### Week 2: Models & Data (Parallel)

| Track | Tasks | Owner |
|-------|-------|-------|
| Track 1 | T1.8-T1.12 (Decoding, Tests) | training-agent |
| Track 2 | T2.1-T2.9 (Models, Loss) | training-agent |
| Track 4 | T4.10-T4.13 (Tests, Migration) | kernel-agent |

**Milestone:** HeuristicBaseline + MLPPolicy implemented and tested.

### Week 3: Training & Bench

| Track | Tasks | Owner |
|-------|-------|-------|
| Track 2 | T2.10-T2.14 (Training loop, Ablations) | training-agent |
| Track 3 | T3.1-T3.7 (Bench Runner) | training-agent |

**Milestone:** Models trained on dataset; bench harness operational.

### Week 4: Integration

| Track | Tasks | Owner |
|-------|-------|-------|
| Track 5 | T5.1-T5.16 (Full Integration) | kernel-agent |
| Track 6 | T6.1-T6.10 (ONNX Export) | training-agent |

**Milestone:** Planner inference integrated into kernel with ONNX deployment.

### Ongoing: Hygiene

| Track | Tasks | Owner |
|-------|-------|-------|
| Track 7 | All tasks | any |

**Milestone:** CI coverage, documentation complete.

---

## Track Summaries

### Track 1: Tokenization & Encoding

**Purpose:** Convert JSON planner inputs to fixed-dimension tensors for model consumption.

**Key Deliverables:**
- `PlannerInputEncoder` class (JSON → tensor)
- `ActionEncoder` class (indices ↔ actions)
- `ValidityMaskBuilder` class (action validity)

**Critical Design Decisions:**
- Fixed history slots (N=8) with zero-padding
- Hash bucketing for open-set fields (tags, fail codes)
- Compositional encoding preserving structure

[Full Spec →](track-1-tokenization.md)

---

### Track 2: Baseline + MLP Models

**Purpose:** Implement trainable policy models for swarm/budget prediction.

**Key Deliverables:**
- `HeuristicBaseline` class (deterministic rules)
- `MLPPolicy` class (multi-head classifier)
- Training loop with evaluation metrics
- Ablation infrastructure

**Architecture:**
```
Input(3779) → Linear(512) → LN → ReLU → Linear(256) → LN → ReLU → Linear(128)
    → swarm_head(2)
    → candidates_head(4)
    → minutes_head(6)
    → iterations_head(5)
```

[Full Spec →](track-2-models.md)

---

### Track 3: Best-of-K Labeling Bench

**Purpose:** Generate counterfactual labels by running multiple action configurations.

**Key Deliverables:**
- `BenchRunner` class (execution orchestration)
- `ActionSampler` (coverage/random/deterministic sampling)
- `WinnerSelector` (objective-based selection)
- CLI commands for bench management

**Value:** Better labels than behavioral cloning (observe what would have worked best, not just what was tried).

[Full Spec →](track-3-best-of-k-bench.md)

---

### Track 4: executed_plan Recording

**Purpose:** Record what the kernel actually executed for accurate training labels.

**Key Deliverables:**
- `ExecutedPlan` dataclass
- Manifest updates in dispatcher/runner
- Rollout propagation
- Extraction updates

**Critical Path:** This blocks accurate data extraction. Without it, labels are inferred heuristically.

[Full Spec →](track-4-executed-plan-recording.md)

---

### Track 5: Kernel Inference Integration

**Purpose:** Wire trained models into kernel decision flow.

**Key Deliverables:**
- `PlannerInference` class (model loading, prediction)
- Scheduler integration (`plan_issue()`)
- Dispatcher integration (accept planner_action)
- Safety fallback logic
- CLI options

**Rollout Plan:**
1. Shadow mode (log predictions, don't use)
2. Limited rollout (low-risk issues only)
3. Full rollout

[Full Spec →](track-5-kernel-integration.md)

---

### Track 6: ONNX Packaging

**Purpose:** Export models for deployment without PyTorch dependency.

**Key Deliverables:**
- `export_onnx.py` script
- Model bundle structure
- `ONNXPlannerModel` loader class
- Numeric equivalence validation

**Bundle Contents:**
- model.onnx
- config.json
- action_space.json
- calibration.json
- metadata.json

[Full Spec →](track-6-onnx-packaging.md)

---

### Track 7: Repository Hygiene

**Purpose:** Clean up tech debt and establish CI/testing infrastructure.

**Key Deliverables:**
- Git cleanup (deleted files)
- CI integration (mypy, ruff, pytest)
- Schema validation tests
- Architecture documentation

[Full Spec →](track-7-repo-hygiene.md)

---

## Key Metrics

### Training Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Exact Match Accuracy | > 60% | All 4 action components correct |
| Per-Head Accuracy | > 70% | Individual component accuracy |
| ECE | < 0.1 | Expected Calibration Error |
| Action Entropy | > 1.0 | Avoid collapse to single action |

### Inference Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Latency | < 100ms | Single prediction time |
| Fallback Rate | < 20% | Rate of heuristic fallback |
| Model Size | < 10MB | ONNX model file size |

### Outcome Metrics (Requires Bench)

| Metric | Target | Description |
|--------|--------|-------------|
| Pass Rate | > baseline | Issues passing all gates |
| Duration per Pass | < baseline | Time to successful resolution |
| Regret vs Oracle | < 0.2 | Gap from best-of-K winner |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Insufficient training data | Training fails | Check dataset size before P0 (min 500 examples) |
| Action collapse | Model only predicts one action | Monitor entropy, adjust loss weighting |
| Inference latency | Kernel slowdown | Timeout fallback, ONNX optimization |
| Execution cost | Bench runs are expensive | Strict cost caps, sampling strategies |
| Model drift | Performance degrades over time | Periodic recalibration, A/B testing |

---

## Reference Documents

| Document | Location | Description |
|----------|----------|-------------|
| Master Spec | `docs/models/swarm_planner_training_spec.md` | Authoritative training specification |
| Schemas | `cyntra-kernel/schemas/cyntra/` | JSON schema definitions |
| Action Space | `cyntra-kernel/src/cyntra/planner/action_space.py` | Action space implementation |
| Dataset Builder | `cyntra-kernel/src/cyntra/planner/dataset.py` | Dataset construction |
| Run Summaries | `cyntra-kernel/src/cyntra/planner/run_summaries.py` | Run extraction |
| Similar Runs | `cyntra-kernel/src/cyntra/planner/similar_runs.py` | History retrieval |

---

## Ownership

| Role | Responsibilities |
|------|------------------|
| **training-agent** | Tracks 1, 2, 3, 6 - Tokenization, models, bench, ONNX |
| **kernel-agent** | Tracks 4, 5 - executed_plan recording, kernel integration |
| **any** | Track 7 - Hygiene tasks |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12 | Planner Agent | Initial specification suite |
