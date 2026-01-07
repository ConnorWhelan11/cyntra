# Track 1: Tokenization & Encoding Specification

**Status:** Implementation Ready
**Priority:** P0-CRITICAL
**Owner:** training-agent
**Blocks:** Track 2 (Models), Track 3 (Best-of-K Bench)
**Spec Reference:** `docs/models/swarm_planner_training_spec.md` §6
**Last Updated:** 2025-12

---

## 1. Overview

### 1.1 Purpose

The planner dataset builder (`kernel/src/cyntra/planner/dataset.py`) outputs JSON artifacts conforming to `planner_input.v1` schema. However, neural models require fixed-dimensional numeric tensors. This track implements the **encoding layer** that bridges structured JSON inputs to model-ready tensors and decodes model outputs back to valid actions.

### 1.2 Goals

1. Convert `planner_input.v1` JSON to fixed-dimension tensor representations
2. Handle variable-length history runs with deterministic padding/truncation
3. Preserve compositional structure (issue metadata, history runs, action space)
4. Enable lossless roundtrip for categorical fields
5. Support validity masking at the tensor level

### 1.3 Non-Goals (v1)

- Text tokenization for free-form descriptions (use hash buckets instead)
- Dynamic vocabulary learning (vocab is fixed at build time)
- GPU-specific optimizations (CPU-first for local inference)

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PlannerInputEncoder                          │
├─────────────────────────────────────────────────────────────────────┤
│  planner_input.v1 (JSON)                                            │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ IssueEncoder│  │HistoryEnc   │  │ActionSpaceE │  │SystemStateE│ │
│  │             │  │             │  │             │  │            │ │
│  │ - priority  │  │ - N=8 slots │  │ - swarm_ids │  │ - optional │ │
│  │ - risk      │  │ - zero-pad  │  │ - bins      │  │ - nullable │ │
│  │ - size      │  │ - truncate  │  │ - validity  │  │            │ │
│  │ - tags→hash │  │             │  │             │  │            │ │
│  └─────┬───────┘  └─────┬───────┘  └─────┬───────┘  └─────┬──────┘ │
│        │                │                │                │        │
│        └────────────────┴────────────────┴────────────────┘        │
│                                  │                                  │
│                                  ▼                                  │
│                    Concatenated Feature Tensor                      │
│                         (d_in dimensions)                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         ActionDecoder                               │
├─────────────────────────────────────────────────────────────────────┤
│  Model Logits (per head)                                            │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Validity Mask Application                 │   │
│  │  - mask invalid swarm/bin combinations                       │   │
│  │  - apply -inf to masked logits                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Argmax / Sampling                         │   │
│  │  - joint-action decoding: argmax over VALID_ACTIONS          │   │
│  │  - or per-head argmax with validity check                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  planner_action.v1 (JSON)                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
Dataset Example (JSON)
    │
    ├── planner_input: {...}  ──► PlannerInputEncoder.encode() ──► Tensor[d_in]
    │
    └── label_action: {...}   ──► ActionEncoder.encode_label() ──► Tensor[4] (class indices)
```

---

## 3. Detailed Requirements

### 3.1 Issue Metadata Encoding

**Source:** `planner_input["issue"]`

| Field          | Type                          | Encoding Strategy                                 | Output Dim  |
| -------------- | ----------------------------- | ------------------------------------------------- | ----------- |
| `dk_priority`  | enum P0-P3                    | One-hot                                           | 4           |
| `dk_risk`      | enum low/medium/high/critical | One-hot                                           | 4           |
| `dk_size`      | enum XS/S/M/L/XL              | One-hot                                           | 5           |
| `dk_attempts`  | int                           | Log-binned categorical (0,1,2,3+)                 | 4           |
| `dk_tool_hint` | str\|null                     | Hash bucket (1024 buckets) + null flag            | 11 (10 + 1) |
| `tags`         | list[str]                     | Multi-hot hash buckets (1024 buckets, max 8 tags) | 1024        |

**Total issue features:** 4 + 4 + 5 + 4 + 11 + 1024 = **1052**

### 3.2 History Runs Encoding

**Source:** `planner_input["history"]["last_n_similar_runs"]`

**Configuration:**

- `N_HISTORY_SLOTS = 8` (fixed)
- Zero-pad if fewer than N runs available
- Truncate oldest if more than N runs (should not happen with proper retrieval)

**Per-run features:**

| Field                            | Type                 | Encoding Strategy                                              | Output Dim |
| -------------------------------- | -------------------- | -------------------------------------------------------------- | ---------- |
| `job_type`                       | str                  | Categorical (code, fab-world, fab-asset)                       | 3          |
| `domain`                         | str                  | Categorical (code, fab_world, fab_asset)                       | 3          |
| `action_executed.swarm_id`       | str\|null            | Categorical + null                                             | 3          |
| `action_executed.max_candidates` | int\|null            | Binned (1,2,3,NA)                                              | 4          |
| `action_executed.max_minutes`    | int\|null            | Binned (15,30,45,60,120,NA)                                    | 6          |
| `action_executed.max_iterations` | int\|null            | Binned (1,2,3,5,NA)                                            | 5          |
| `outcome.status`                 | enum                 | One-hot (success, failed, timeout)                             | 3          |
| `outcome.fail_codes`             | list[str]            | Multi-hot hash (256 buckets, max 5)                            | 256        |
| `outcome.gates`                  | list[{name, passed}] | Gate presence + pass/fail (16 known gates)                     | 32         |
| `runtime.duration_ms`            | int                  | Log-binned (6 buckets: <1m, 1-5m, 5-15m, 15-30m, 30-60m, >60m) | 6          |
| `cost_usd_est`                   | float\|null          | Log-binned (5 buckets) + null                                  | 6          |
| `recency_bucket`                 | derived              | Categorical (same-day, this-week, this-month, older)           | 4          |
| `valid_mask`                     | derived              | Binary (is this slot populated?)                               | 1          |

**Per-run dimension:** 3+3+3+4+6+5+3+256+32+6+6+4+1 = **332**

**Total history features:** 332 × 8 = **2656**

### 3.3 Action Space Encoding

**Source:** `planner_input["action_space"]`

| Field                 | Encoding Strategy       | Output Dim     |
| --------------------- | ----------------------- | -------------- |
| `swarm_ids`           | Multi-hot presence mask | 8 (max swarms) |
| `max_candidates_bins` | Multi-hot presence mask | 8              |
| `max_minutes_bins`    | Multi-hot presence mask | 8              |
| `max_iterations_bins` | Multi-hot presence mask | 8              |

**Total action space features:** **32**

### 3.4 Universe Defaults Encoding

**Source:** `planner_input["universe_defaults"]`

| Field          | Encoding Strategy  | Output Dim |
| -------------- | ------------------ | ---------- |
| `swarm_id`     | Categorical + null | 3          |
| `objective_id` | Hash bucket + null | 11         |

**Total universe defaults features:** **14**

### 3.5 System State Encoding (Optional)

**Source:** `planner_input["system_state"]` (nullable in v1)

| Field                  | Encoding Strategy                                      | Output Dim |
| ---------------------- | ------------------------------------------------------ | ---------- |
| `active_workcells_bin` | Categorical (0, 1-2, 3-5, 6+, null)                    | 5          |
| `queue_depth_bin`      | Categorical (0, 1-5, 6-20, 20+, null)                  | 5          |
| `hour_bucket`          | Categorical (night, morning, afternoon, evening, null) | 5          |
| `budget_remaining_bin` | Categorical (low, medium, high, unlimited, null)       | 5          |
| `available_toolchains` | Multi-hot (4 known toolchains)                         | 4          |
| `system_state_present` | Binary flag                                            | 1          |

**Total system state features:** **25**

### 3.6 Total Input Dimension

```
d_in = 1052 (issue) + 2656 (history) + 32 (action_space) + 14 (universe) + 25 (system_state)
     = 3779
```

**Note:** This can be reduced via learned embeddings in the model, but the encoder outputs this fixed dimension.

---

## 4. API Specification

### 4.1 Module Structure

```
kernel/src/cyntra/planner/
├── tokenizer.py          # Main encoder/decoder module (NEW)
├── tokenizer_config.py   # Configuration constants (NEW)
└── tokenizer_test.py     # Unit tests (in tests/planner/)
```

### 4.2 Core Classes

```python
# kernel/src/cyntra/planner/tokenizer.py

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from cyntra.planner.action_space import ActionSpace, BudgetBin


@dataclass(frozen=True)
class TokenizerConfig:
    """Immutable configuration for encoder/decoder."""

    n_history_slots: int = 8
    n_tag_buckets: int = 1024
    n_fail_code_buckets: int = 256
    n_gate_slots: int = 16
    max_tags_per_issue: int = 8
    max_fail_codes_per_run: int = 5

    # Derived dimensions (computed)
    @property
    def d_issue(self) -> int:
        return 4 + 4 + 5 + 4 + 11 + self.n_tag_buckets  # 1052

    @property
    def d_run(self) -> int:
        return 332  # See breakdown above

    @property
    def d_history(self) -> int:
        return self.d_run * self.n_history_slots  # 2656

    @property
    def d_action_space(self) -> int:
        return 32

    @property
    def d_universe(self) -> int:
        return 14

    @property
    def d_system_state(self) -> int:
        return 25

    @property
    def d_in(self) -> int:
        return (
            self.d_issue
            + self.d_history
            + self.d_action_space
            + self.d_universe
            + self.d_system_state
        )


class PlannerInputEncoder:
    """
    Encodes planner_input.v1 JSON to fixed-dimension numpy array.

    Thread-safe and stateless after initialization.
    """

    def __init__(self, config: TokenizerConfig | None = None):
        self.config = config or TokenizerConfig()
        self._priority_map = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
        self._risk_map = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        self._size_map = {"XS": 0, "S": 1, "M": 2, "L": 3, "XL": 4}
        self._status_map = {"success": 0, "failed": 1, "timeout": 2}
        self._job_type_map = {"code": 0, "fab-world": 1, "fab-asset": 2}
        self._domain_map = {"code": 0, "fab_world": 1, "fab_asset": 2}

    def encode(self, planner_input: dict[str, Any]) -> np.ndarray:
        """
        Encode a planner_input.v1 dict to a 1D float32 numpy array.

        Args:
            planner_input: Dict conforming to planner_input.v1 schema

        Returns:
            np.ndarray of shape (d_in,) with dtype float32
        """
        features: list[np.ndarray] = []

        # Issue features
        features.append(self._encode_issue(planner_input.get("issue", {})))

        # History features
        features.append(self._encode_history(planner_input.get("history", {})))

        # Action space features
        features.append(self._encode_action_space(planner_input.get("action_space", {})))

        # Universe defaults features
        features.append(self._encode_universe_defaults(planner_input.get("universe_defaults", {})))

        # System state features
        features.append(self._encode_system_state(planner_input.get("system_state")))

        return np.concatenate(features).astype(np.float32)

    def _encode_issue(self, issue: dict[str, Any]) -> np.ndarray:
        """Encode issue metadata to fixed-dim array."""
        # Implementation details...
        pass

    def _encode_history(self, history: dict[str, Any]) -> np.ndarray:
        """Encode history runs with padding/truncation."""
        # Implementation details...
        pass

    def _encode_action_space(self, action_space: dict[str, Any]) -> np.ndarray:
        """Encode action space as presence masks."""
        # Implementation details...
        pass

    def _encode_universe_defaults(self, defaults: dict[str, Any]) -> np.ndarray:
        """Encode universe defaults."""
        # Implementation details...
        pass

    def _encode_system_state(self, system_state: dict[str, Any] | None) -> np.ndarray:
        """Encode optional system state."""
        # Implementation details...
        pass

    @staticmethod
    def _hash_to_bucket(value: str, n_buckets: int) -> int:
        """Deterministic hash to bucket index."""
        import hashlib
        h = hashlib.sha256(value.encode("utf-8")).hexdigest()
        return int(h[:8], 16) % n_buckets


@dataclass(frozen=True)
class EncodedAction:
    """Encoded action as class indices."""
    swarm_idx: int
    max_candidates_idx: int
    max_minutes_idx: int
    max_iterations_idx: int


class ActionEncoder:
    """
    Encodes/decodes planner actions to/from class indices.
    """

    def __init__(self, action_space: ActionSpace):
        self.action_space = action_space
        self._swarm_to_idx = {s: i for i, s in enumerate(action_space.swarm_ids)}
        self._candidates_to_idx = {b: i for i, b in enumerate(action_space.max_candidates_bins)}
        self._minutes_to_idx = {b: i for i, b in enumerate(action_space.max_minutes_bins)}
        self._iterations_to_idx = {b: i for i, b in enumerate(action_space.max_iterations_bins)}

    def encode_label(self, label_action: dict[str, Any]) -> EncodedAction:
        """
        Encode a planner_action.v1 label to class indices.

        Args:
            label_action: Dict with swarm_id, budgets.max_*_bin fields

        Returns:
            EncodedAction with integer indices for each head
        """
        swarm_id = label_action.get("swarm_id", self.action_space.swarm_ids[0])
        budgets = label_action.get("budgets", {})

        return EncodedAction(
            swarm_idx=self._swarm_to_idx.get(swarm_id, 0),
            max_candidates_idx=self._candidates_to_idx.get(budgets.get("max_candidates_bin"), 0),
            max_minutes_idx=self._minutes_to_idx.get(budgets.get("max_minutes_bin"), 0),
            max_iterations_idx=self._iterations_to_idx.get(budgets.get("max_iterations_bin"), 0),
        )

    def decode_action(
        self,
        swarm_idx: int,
        max_candidates_idx: int,
        max_minutes_idx: int,
        max_iterations_idx: int,
    ) -> dict[str, Any]:
        """
        Decode class indices back to planner_action.v1 dict.
        """
        return {
            "swarm_id": self.action_space.swarm_ids[swarm_idx],
            "budgets": {
                "max_candidates_bin": self.action_space.max_candidates_bins[max_candidates_idx],
                "max_minutes_bin": self.action_space.max_minutes_bins[max_minutes_idx],
                "max_iterations_bin": self.action_space.max_iterations_bins[max_iterations_idx],
            },
        }


class ValidityMaskBuilder:
    """
    Builds validity masks for action decoding.

    Ensures decoded actions satisfy all validity rules from action_space.py.
    """

    def __init__(self, action_space: ActionSpace):
        self.action_space = action_space

    def build_mask(
        self,
        job_type: str,
    ) -> dict[str, np.ndarray]:
        """
        Build per-head validity masks for a given job type.

        Args:
            job_type: "code" or "fab-world"

        Returns:
            Dict with keys swarm, candidates, minutes, iterations
            Each value is a boolean array where True = valid
        """
        from cyntra.planner.action_space import valid_actions

        valid = valid_actions(job_type, self.action_space)

        # Build per-head masks
        swarm_valid = np.zeros(len(self.action_space.swarm_ids), dtype=bool)
        candidates_valid = np.zeros(len(self.action_space.max_candidates_bins), dtype=bool)
        minutes_valid = np.zeros(len(self.action_space.max_minutes_bins), dtype=bool)
        iterations_valid = np.zeros(len(self.action_space.max_iterations_bins), dtype=bool)

        swarm_to_idx = {s: i for i, s in enumerate(self.action_space.swarm_ids)}
        cand_to_idx = {b: i for i, b in enumerate(self.action_space.max_candidates_bins)}
        min_to_idx = {b: i for i, b in enumerate(self.action_space.max_minutes_bins)}
        iter_to_idx = {b: i for i, b in enumerate(self.action_space.max_iterations_bins)}

        for swarm, cand, mins, iters in valid:
            swarm_valid[swarm_to_idx[swarm]] = True
            candidates_valid[cand_to_idx[cand]] = True
            minutes_valid[min_to_idx[mins]] = True
            iterations_valid[iter_to_idx[iters]] = True

        return {
            "swarm": swarm_valid,
            "candidates": candidates_valid,
            "minutes": minutes_valid,
            "iterations": iterations_valid,
        }

    def build_joint_mask(self, job_type: str) -> np.ndarray:
        """
        Build a joint validity mask over all action tuples.

        Returns:
            Boolean array of shape (n_swarms, n_cand, n_min, n_iter)
            where True = valid combination
        """
        from cyntra.planner.action_space import is_valid_action

        n_swarm = len(self.action_space.swarm_ids)
        n_cand = len(self.action_space.max_candidates_bins)
        n_min = len(self.action_space.max_minutes_bins)
        n_iter = len(self.action_space.max_iterations_bins)

        mask = np.zeros((n_swarm, n_cand, n_min, n_iter), dtype=bool)

        for si, swarm in enumerate(self.action_space.swarm_ids):
            for ci, cand in enumerate(self.action_space.max_candidates_bins):
                for mi, mins in enumerate(self.action_space.max_minutes_bins):
                    for ii, iters in enumerate(self.action_space.max_iterations_bins):
                        mask[si, ci, mi, ii] = is_valid_action(
                            job_type=job_type,
                            swarm_id=swarm,
                            max_candidates_bin=cand,
                            max_minutes_bin=mins,
                            max_iterations_bin=iters,
                        )

        return mask
```

### 4.3 Usage Example

```python
from cyntra.planner.tokenizer import (
    PlannerInputEncoder,
    ActionEncoder,
    ValidityMaskBuilder,
    TokenizerConfig,
)
from cyntra.planner.action_space import action_space_for_swarms

# Initialize
config = TokenizerConfig(n_history_slots=8)
encoder = PlannerInputEncoder(config)

action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
action_encoder = ActionEncoder(action_space)
mask_builder = ValidityMaskBuilder(action_space)

# Encode input
planner_input = {...}  # planner_input.v1 dict
features = encoder.encode(planner_input)  # shape: (3779,)

# Encode label
label_action = {...}  # planner_action.v1 dict
encoded_label = action_encoder.encode_label(label_action)

# Build validity mask
masks = mask_builder.build_mask(job_type="code")

# Decode model output
predicted_action = action_encoder.decode_action(
    swarm_idx=0,
    max_candidates_idx=0,
    max_minutes_idx=2,
    max_iterations_idx=4,
)
```

---

## 5. Implementation Tasks

### 5.1 Task Breakdown

| Task ID | Description                                                 | Est. Hours | Dependencies |
| ------- | ----------------------------------------------------------- | ---------- | ------------ |
| T1.1    | Create `tokenizer_config.py` with constants                 | 1          | None         |
| T1.2    | Implement `PlannerInputEncoder._encode_issue()`             | 2          | T1.1         |
| T1.3    | Implement `PlannerInputEncoder._encode_history()`           | 4          | T1.1         |
| T1.4    | Implement `PlannerInputEncoder._encode_action_space()`      | 1          | T1.1         |
| T1.5    | Implement `PlannerInputEncoder._encode_universe_defaults()` | 1          | T1.1         |
| T1.6    | Implement `PlannerInputEncoder._encode_system_state()`      | 1          | T1.1         |
| T1.7    | Implement `PlannerInputEncoder.encode()` concatenation      | 1          | T1.2-T1.6    |
| T1.8    | Implement `ActionEncoder` class                             | 2          | T1.1         |
| T1.9    | Implement `ValidityMaskBuilder` class                       | 2          | T1.8         |
| T1.10   | Write unit tests for encoder roundtrip                      | 3          | T1.7-T1.9    |
| T1.11   | Write unit tests for validity masking                       | 2          | T1.9         |
| T1.12   | Integration test with real dataset examples                 | 2          | T1.10        |

**Total estimated hours:** 22

### 5.2 File Deliverables

| File                                                 | Description                 | Status |
| ---------------------------------------------------- | --------------------------- | ------ |
| `kernel/src/cyntra/planner/tokenizer_config.py`      | Configuration constants     | NEW    |
| `kernel/src/cyntra/planner/tokenizer.py`             | Main encoder/decoder module | NEW    |
| `kernel/tests/planner/test_tokenizer.py`             | Unit tests                  | NEW    |
| `kernel/tests/planner/test_tokenizer_integration.py` | Integration tests           | NEW    |

---

## 6. Testing Requirements

### 6.1 Unit Tests

```python
# tests/planner/test_tokenizer.py

def test_encode_issue_priority_one_hot():
    """Verify priority encoding is correct one-hot."""
    encoder = PlannerInputEncoder()
    issue = {"dk_priority": "P2", "dk_risk": "medium", "dk_size": "M", ...}
    features = encoder._encode_issue(issue)
    # P2 should be index 2 in one-hot
    assert features[2] == 1.0
    assert features[0] == 0.0
    assert features[1] == 0.0
    assert features[3] == 0.0

def test_encode_history_padding():
    """Verify zero-padding for fewer than N runs."""
    encoder = PlannerInputEncoder()
    history = {"last_n_similar_runs": [run1, run2, run3]}  # Only 3 runs
    features = encoder._encode_history(history)
    # Should be N_HISTORY_SLOTS * d_run = 8 * 332
    assert features.shape == (2656,)
    # Last 5 slots should be zero (except valid_mask=0)

def test_encode_history_truncation():
    """Verify truncation for more than N runs."""
    # Should not happen with proper retrieval, but test anyway

def test_hash_determinism():
    """Verify hash_to_bucket is deterministic."""
    assert PlannerInputEncoder._hash_to_bucket("test", 1024) == \
           PlannerInputEncoder._hash_to_bucket("test", 1024)

def test_encode_roundtrip_semantics():
    """Verify encode/decode preserves action semantics."""
    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    encoder = ActionEncoder(action_space)

    original = {
        "swarm_id": "speculate_vote",
        "budgets": {
            "max_candidates_bin": 2,
            "max_minutes_bin": 30,
            "max_iterations_bin": "NA",
        }
    }
    encoded = encoder.encode_label(original)
    decoded = encoder.decode_action(
        encoded.swarm_idx,
        encoded.max_candidates_idx,
        encoded.max_minutes_idx,
        encoded.max_iterations_idx,
    )
    assert decoded["swarm_id"] == original["swarm_id"]
    assert decoded["budgets"] == original["budgets"]

def test_validity_mask_code_job():
    """Verify validity mask for code jobs."""
    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    builder = ValidityMaskBuilder(action_space)
    masks = builder.build_mask(job_type="code")

    # For code jobs, max_iterations_bin must be "NA"
    # So only the "NA" slot should be valid
    na_idx = action_space.max_iterations_bins.index("NA")
    assert masks["iterations"][na_idx] == True

def test_validity_mask_fab_world_job():
    """Verify validity mask for fab-world jobs."""
    action_space = action_space_for_swarms(["serial_handoff", "speculate_vote"])
    builder = ValidityMaskBuilder(action_space)
    masks = builder.build_mask(job_type="fab-world")

    # For fab-world jobs, max_candidates_bin cannot be "NA"
    na_idx = action_space.max_candidates_bins.index("NA")
    assert masks["candidates"][na_idx] == False
```

### 6.2 Integration Tests

```python
# tests/planner/test_tokenizer_integration.py

def test_encode_real_dataset_example():
    """Verify encoding works on real dataset examples."""
    # Load actual dataset
    dataset_path = Path(".cyntra/planner/dataset.jsonl")
    if not dataset_path.exists():
        pytest.skip("No dataset available")

    encoder = PlannerInputEncoder()

    with open(dataset_path) as f:
        for line in f:
            example = json.loads(line)
            features = encoder.encode(example["planner_input"])
            assert features.shape == (encoder.config.d_in,)
            assert not np.isnan(features).any()
            assert not np.isinf(features).any()

def test_batch_encoding_consistency():
    """Verify batch encoding produces same results as individual."""
    # Encode same input multiple times, verify identical output
```

### 6.3 Property-Based Tests

```python
# Using hypothesis for property-based testing

from hypothesis import given, strategies as st

@given(st.sampled_from(["P0", "P1", "P2", "P3"]))
def test_priority_encoding_valid(priority):
    encoder = PlannerInputEncoder()
    issue = {"dk_priority": priority, "dk_risk": "medium", "dk_size": "M", ...}
    features = encoder._encode_issue(issue)
    # Exactly one position should be 1.0 in priority section
    assert features[:4].sum() == 1.0
```

---

## 7. Acceptance Criteria

### 7.1 Functional Requirements

- [ ] `PlannerInputEncoder.encode()` produces fixed-dimension output for any valid `planner_input.v1`
- [ ] Output dimension matches `TokenizerConfig.d_in` exactly
- [ ] Encoding is deterministic (same input → same output)
- [ ] No NaN or Inf values in output
- [ ] `ActionEncoder` roundtrip preserves all categorical values
- [ ] `ValidityMaskBuilder` correctly masks invalid actions per job type

### 7.2 Performance Requirements

- [ ] Single encode() call completes in < 1ms on average
- [ ] Memory allocation per encode() is bounded (no unbounded growth)

### 7.3 Quality Requirements

- [ ] 100% unit test coverage for encoder/decoder logic
- [ ] All tests pass with `pytest -v`
- [ ] Type hints pass `mypy --strict`
- [ ] Code passes `ruff check`

---

## 8. Dependencies

### 8.1 Upstream Dependencies

| Dependency                   | Location          | Status   |
| ---------------------------- | ----------------- | -------- |
| `planner_input.schema.json`  | `schemas/cyntra/` | COMPLETE |
| `planner_action.schema.json` | `schemas/cyntra/` | COMPLETE |
| `action_space.py`            | `cyntra/planner/` | COMPLETE |
| `dataset.py`                 | `cyntra/planner/` | COMPLETE |

### 8.2 Downstream Dependents

| Dependent             | Description                       |
| --------------------- | --------------------------------- |
| Track 2 (Models)      | Uses encoded tensors for training |
| Track 3 (Best-of-K)   | Uses encoder for bench inputs     |
| Track 5 (Integration) | Uses encoder for inference        |

---

## 9. Open Questions

1. **Tag bucket size:** Is 1024 buckets sufficient for tag hashing, or should we use learned embeddings?
   - Recommendation: Start with 1024, measure collision rate, upgrade if > 5%

2. **History ordering:** Should runs be ordered by recency or score in the tensor?
   - Recommendation: Recency (most recent first) for positional encoding compatibility

3. **Null handling:** Should null values be a separate category or zero vector?
   - Recommendation: Separate null flag + zero features for explicit modeling

---

## 10. Revision History

| Version | Date    | Author        | Changes               |
| ------- | ------- | ------------- | --------------------- |
| 1.0     | 2025-12 | Planner Agent | Initial specification |
