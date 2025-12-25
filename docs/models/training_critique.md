# Swarm Planner Training: Review of External Critique (Resolution)

**Status:** Consolidated response to “Architecture Review” feedback, aligned to `docs/models/training_plan.md`  
**Date:** 2025-12

This doc answers: “Which critique points are correct, which need adjustment, and what concrete changes should we make?”

---

## Executive Summary

The external critique is mostly high-signal. The most important corrections are:

- **Outcome-based evaluation + labels must arrive earlier** than a “late P5”: imitation is a bootstrap, not a success criterion.
- **Action coupling is real**; we should not pretend independent heads are sufficient without explicit masking/conditioning and/or a joint-action baseline.
- **System-state features + uncertainty handling** are required for safe deployment.
- **Kernel inference should not depend on torch** for anything beyond local prototyping; ship ONNX/runtime or a sidecar.

Where the critique overreaches:

- Treating planning as a full MDP/offline-RL problem is directionally right but **too risky for v1**; it’s a v3+ path gated on logging/propensity/bench maturity.
- Multi-head classification is not “wrong”; it’s fine **if** we enforce validity (masks) and compare against a joint-action baseline.

---

## 1) Framing: classification vs decision-making

**Feedback:** “This is sequential decision-making; multi-head classification ignores coupling.”

**My take:** **Agree on coupling; partially agree on sequential framing.**

- In Cyntra today, the planner decision is typically **one-shot per issue dispatch** (serial vs speculate, plus parallelism/budget). That’s compatible with supervised classification.
- However, the action space has **hard constraints** (e.g., `serial_handoff ⇒ parallelism=1`) and soft couplings (e.g., `speculate_vote` usually implies `parallelism>1`), so independent heads without constraints will produce illegal/degenerate combos.

**Resolution (v1):**
- Keep multi-head as the primary model interface (better extensibility, avoids Cartesian-product sparsity), **but**:
  - apply **hard masking** at train + inference (invalid combos have `-inf` logits), and
  - add a **joint-action baseline head** that predicts from a curated `VALID_ACTIONS` list (20–100 tuples) to validate whether factorization hurts.
- If coupling remains a pain: add **autoregressive factorization** (swarm → parallelism|swarm → budgets|swarm,parallelism).

---

## 2) Imitation learning ceiling

**Feedback:** “Imitation caps performance; move best-of-K earlier.”

**My take:** **Agree.**

Imitation is still useful as a bootstrap because it:
- yields a safe “can replicate current behavior” model,
- surfaces data/label pipeline issues early,
- provides a calibrated “fallback policy” (when uncertain, do what today’s system does).

But **we should not judge success on imitation accuracy** except as a sanity metric.

**Resolution (v1):**
- Keep imitation as P0/P1 training, but introduce an **outcome-labeled bench** earlier:
  - Run a **bounded Best-of-K** bench on a small, deterministic slice (e.g., 50–200 issues/seeds), with strict budget caps.
  - Use that bench for regret/cost-per-pass metrics and for “winner” labels.
- DAgger-style “oracle labeling” is optional; prefer best-of-K since it produces outcome labels without humans.

---

## 3) Similar-runs retrieval

**Feedback:** “Jaccard is shallow; N=8 arbitrary; must ablate; consider learned retrieval.”

**My take:** **Agree on ablations; defer learned retrieval.**

**Resolution (v1):**
- Keep deterministic retrieval initially (local-first, debuggable), but:
  - add failure-signal overlap (gate names / fail codes) to scoring,
  - include a text-derived signal (cheap keywords) rather than full semantic retrieval,
  - run explicit ablations over `N ∈ {0,1,4,8,16}` and token budget per run.
- Learned retrieval (embedding index) is v2+ after we’ve proven retrieval is worth the complexity.

---

## 4) Architecture choice: URM vs “simple transformer”

**Feedback:** “URM is overkill; don’t use loops=1.”

**My take:** **Agree on “start simple”; disagree that URM is categorically overkill.**

URM/UT recurrence can be useful when:
- the context is long and structured,
- you need iterative refinement and robustness to noisy histories,
- you can benefit from TBPTL (stable training at higher loop counts).

But it should be **earned via ablation**, not assumed.

**Resolution (v1):**
- Baselines first (heuristic + MLP + plain Transformer).
- URM-style recurrent encoder is allowed in v1 **only if** it wins on outcome-based bench or improves calibration/collapse metrics.
- Do **not** ship “URM with loops=1”; either (a) use a plain Transformer baseline, or (b) use recurrence with a real loop count and TBPTL.

---

## 5) Tokenization/vocabulary

**Feedback:** “key=value tokens explode; no compositionality; OOV kills signal.”

**My take:** **Agree.**

**Resolution (v1):**
- Use a **compositional tokenizer**:
  - emit `[KEY] [=] [VALUE]` tokens (two vocab spaces: keys and values), plus separators.
- Use a **hashing trick** for open-set fields (tags, keywords) to avoid UNK collapse:
  - e.g., `TAG_HASH_0..TAG_HASH_1023`, `KW_HASH_0..KW_HASH_1023`.
- Encode ordinals as ordered bins (still categorical) but also provide a small numeric embedding if useful.

This keeps determinism and bounded vocab while avoiding “new tag = lost signal”.

---

## 6) Missing critical features (system state + text)

**Feedback:** “Need workcell/queue/toolchain health/time-of-day/budget remaining; need issue text.”

**My take:** **Agree, with a logging caveat.**

Historical runs likely don’t contain all these features. But we can:
- add them to the schema now (nullable),
- start logging them immediately for future training,
- backfill approximations when possible.

**Resolution (v1):**
- Extend `planner_input.v1` to include optional `system_state`:
  - `active_workcells`, `queue_depth`, `available_toolchains`, `toolchain_recent_pass_rate`, `hour_bucket`, `budget_remaining_bin` (if applicable).
- Add issue text signal via **keyword extraction** (cheap, local, deterministic); defer sentence-embedding encoders until needed.

---

## 7) Metrics: imitation fidelity vs outcome quality

**Feedback:** “Accuracy/exact-match are wrong metrics; use pass rate, cost-per-pass, regret.”

**My take:** **Agree, with an offline constraint.**

Without counterfactual outcomes, pass-rate deltas are not identifiable offline. So:
- accuracy is fine as a “does it learn labels?” metric,
- outcome metrics require a best-of-K bench (or online A/B).

**Resolution (v1):**
- Make outcome-based bench the primary evaluator:
  - `pass_rate`, `cost_per_pass`, `mean_time_to_pass`, and regret vs oracle-in-bench.
- Keep accuracy/exact-match as secondary diagnostics only.

---

## 8) Uncertainty + safe fallback

**Feedback:** “Need calibration + thresholding/ensembles.”

**My take:** **Agree.**

**Resolution (v1):**
- Implement temperature scaling on validation data.
- Add `confidence` and `abstain_to_default` outputs.
- Start with single-model thresholding; ensembles are optional if calibration is inadequate.

---

## 9) P0 success criteria

**Feedback:** “P0 should test data sufficiency/label consistency/learning signal.”

**My take:** **Agree.**

**Resolution (v1):**
- Add explicit P0 gates:
  - minimum dataset size (domain-specific thresholds),
  - label agreement for near-duplicate inputs,
  - loss improvement over random baseline,
  - gradient/NaN checks.

---

## 10) Kernel dependency: avoid torch

**Feedback:** “Torch in kernel is too heavy; use ONNX or sidecar.”

**My take:** **Strongly agree.**

**Resolution (v1):**
- Prototype inference with torch locally if needed.
- For integration, plan to ship either:
  - **ONNXRuntime** inference in-kernel, or
  - a **planner sidecar** process with a stable JSON RPC contract.

ONNX is the simplest “single binary dependency” path and keeps kernel startup/memory sane.

---

## Concrete deltas to apply to `docs/models/training_plan.md`

1) Add a “joint action head baseline” option and/or autoregressive factorization; keep masking mandatory.  
2) Move a bounded “Best-of-K bench” into P2/P3 (small slice) and make outcome metrics primary.  
3) Add `system_state` (nullable) and issue keyword tokens to `planner_input.v1`; start logging now.  
4) Replace flat `KEY=VALUE` tokens with compositional tokens + hashed buckets for tags/keywords.  
5) Add explicit P0 feasibility gates (data sufficiency, label consistency, learning signal).  
6) Add an inference packaging plan that avoids torch in kernel (ONNX/sidecar).

---

## Remaining open questions (still blocking final action-space lock)

1) Does the planner eventually choose **toolchain sets** (router), or only swarm/budgets?  
2) Which “budgets” are truly enforceable for code issues (timeout override vs toolchain timeout) vs only for world/fab runs?  
3) What is the acceptable cost envelope for best-of-K labeling (K, minutes, candidates) and where does it run (CI vs manual bench)?  
4) Target inference latency and deployment target (in-kernel ONNX vs sidecar)?
