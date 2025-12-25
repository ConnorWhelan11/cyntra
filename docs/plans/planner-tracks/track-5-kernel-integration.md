# Track 5: Kernel Inference Integration Specification

**Status:** Implementation Ready
**Priority:** P2-MEDIUM
**Owner:** kernel-agent
**Depends On:** Track 1 (Tokenization), Track 2 (Models), Track 4 (executed_plan Recording)
**Blocks:** None (final integration track)
**Spec Reference:** `docs/models/swarm_planner_training_spec.md` §10
**Last Updated:** 2025-12

---

## 1. Overview

### 1.1 Purpose

This track integrates trained planner models into the Cyntra kernel execution path. The planner inference module predicts optimal swarm topology and budgets for each issue, replacing or augmenting the current heuristic-based decision logic.

### 1.2 Goals

1. Wire planner inference into the scheduler/dispatcher decision point
2. Implement safety fallback when confidence is low or inference fails
3. Record both planned_action (model output) and executed_plan (what actually ran)
4. Support feature-flagged rollout for A/B testing
5. Enable CLI override for model selection

### 1.3 Non-Goals (v1)

- Online learning from execution outcomes
- Multi-model ensemble or routing
- Dynamic model reloading without restart
- Distributed inference

---

## 2. Architecture

### 2.1 Integration Points

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Kernel Decision Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Scheduler                                                          │
│       │                                                             │
│       │ select_next_issue(queue) → Issue                            │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Planner Decision Point                          │   │
│  │                                                              │   │
│  │  ┌────────────────┐    ┌────────────────┐                   │   │
│  │  │ PlannerInference│    │ HeuristicBaseline│                 │   │
│  │  │   (ML Model)    │    │  (Rule-based)   │                  │   │
│  │  └───────┬─────────┘    └───────┬─────────┘                  │   │
│  │          │                      │                            │   │
│  │          ▼                      ▼                            │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │           SafetyGate + Fallback Logic               │    │   │
│  │  │                                                     │    │   │
│  │  │  if model_confidence < threshold:                   │    │   │
│  │  │      use heuristic_baseline                         │    │   │
│  │  │      mark fallback_applied=True                     │    │   │
│  │  │  elif action violates safety_caps:                  │    │   │
│  │  │      clamp to safe values                           │    │   │
│  │  │      mark fallback_applied=True                     │    │   │
│  │  │  else:                                              │    │   │
│  │  │      use model_action                               │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                           │                                  │   │
│  │                           ▼                                  │   │
│  │                    PlannerAction                             │   │
│  │                    {swarm_id, budgets, confidence}           │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  Dispatcher                                                         │
│       │                                                             │
│       │ dispatch_async(issue, planner_action)                       │
│       │ → Records planned_action + executed_plan                    │
│       ▼                                                             │
│  Runner                                                             │
│       │                                                             │
│       │ Execute with planner-determined configuration               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PlannerInference Module                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐   │
│  │  ModelLoader   │  │  InputBuilder  │  │  ActionDecoder     │   │
│  │                │  │                │  │                    │   │
│  │  - ONNX        │  │  - Tokenizer   │  │  - Validity mask   │   │
│  │  - PyTorch     │  │  - History     │  │  - Confidence      │   │
│  │  - Fallback    │  │  - System state│  │  - Decoding        │   │
│  └───────┬────────┘  └───────┬────────┘  └────────┬───────────┘   │
│          │                   │                    │               │
│          └───────────────────┴────────────────────┘               │
│                              │                                     │
│                              ▼                                     │
│                    ┌─────────────────────┐                        │
│                    │  predict(issue)     │                        │
│                    │  → PlannerAction    │                        │
│                    └─────────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Configuration

### 3.1 Planner Configuration Schema

```yaml
# .cyntra/config.yaml (additions)

planner:
  # Enable/disable planner inference
  enabled: true

  # Model configuration
  model:
    # Path to model bundle directory
    path: ".cyntra/models/planner/v1"
    # Model type: onnx | torch | heuristic
    type: "onnx"
    # Fallback if model unavailable
    fallback: "heuristic"

  # Inference settings
  inference:
    # Confidence threshold for using model prediction
    confidence_threshold: 0.6
    # Use calibrated probabilities
    use_calibration: true
    # Timeout for inference (ms)
    timeout_ms: 100

  # Safety caps (hard limits)
  safety:
    max_candidates_cap: 5
    max_minutes_cap: 120
    max_iterations_cap: 10

  # Feature flags
  flags:
    # Log predictions without using them
    shadow_mode: false
    # Force specific swarm for testing
    force_swarm: null
    # Force specific job types to use planner
    enabled_job_types: ["code", "fab-world"]
```

### 3.2 Model Bundle Structure

```
.cyntra/models/planner/v1/
├── model.onnx              # ONNX model file
├── config.json             # Model configuration
├── vocab.json              # Tokenizer vocabulary (if applicable)
├── action_space.json       # Action space definition
├── calibration.json        # Temperature/calibration parameters
└── metadata.json           # Version, training info
```

**config.json:**
```json
{
  "model_type": "mlp",
  "d_in": 3779,
  "d_hidden": 512,
  "n_layers": 3,
  "action_space": {
    "swarm_ids": ["serial_handoff", "speculate_vote"],
    "max_candidates_bins": [1, 2, 3, "NA"],
    "max_minutes_bins": [15, 30, 45, 60, 120, "NA"],
    "max_iterations_bins": [1, 2, 3, 5, "NA"]
  }
}
```

**calibration.json:**
```json
{
  "temperature": {
    "swarm": 1.2,
    "candidates": 1.1,
    "minutes": 1.0,
    "iterations": 1.0
  }
}
```

---

## 4. Implementation

### 4.1 PlannerInference Class

```python
# cyntra-kernel/src/cyntra/planner/inference.py

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from cyntra.planner.tokenizer import PlannerInputEncoder, ActionEncoder, ValidityMaskBuilder
from cyntra.planner.action_space import ActionSpace, action_space_for_swarms
from cyntra.planner.models.baseline import HeuristicBaseline
from cyntra.state.models import Issue


@dataclass
class PlannerAction:
    """Model prediction result."""
    swarm_id: str
    max_candidates_bin: int | str
    max_minutes_bin: int | str
    max_iterations_bin: int | str
    confidence: float
    abstain_to_default: bool = False
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "cyntra.planner_action.v1",
            "swarm_id": self.swarm_id,
            "budgets": {
                "max_candidates_bin": self.max_candidates_bin,
                "max_minutes_bin": self.max_minutes_bin,
                "max_iterations_bin": self.max_iterations_bin,
            },
            "confidence": self.confidence,
            "abstain_to_default": self.abstain_to_default,
            "reason": self.reason,
        }


@dataclass
class InferenceConfig:
    """Configuration for planner inference."""
    model_path: Path
    model_type: str = "onnx"
    confidence_threshold: float = 0.6
    use_calibration: bool = True
    timeout_ms: int = 100
    fallback: str = "heuristic"


class PlannerInference:
    """
    Planner inference module for kernel integration.

    Supports ONNX and PyTorch models with automatic fallback.
    """

    def __init__(self, config: InferenceConfig):
        self.config = config
        self._model = None
        self._encoder = None
        self._action_encoder = None
        self._mask_builder = None
        self._calibration = None
        self._baseline = None
        self._action_space = None

        self._load_model()

    def _load_model(self) -> None:
        """Load model and supporting artifacts."""
        model_dir = self.config.model_path

        # Load model configuration
        config_path = model_dir / "config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"Model config not found: {config_path}")

        model_config = json.loads(config_path.read_text())

        # Initialize action space
        swarm_ids = model_config["action_space"]["swarm_ids"]
        self._action_space = action_space_for_swarms(swarm_ids)

        # Initialize encoders
        self._encoder = PlannerInputEncoder()
        self._action_encoder = ActionEncoder(self._action_space)
        self._mask_builder = ValidityMaskBuilder(self._action_space)

        # Initialize baseline fallback
        self._baseline = HeuristicBaseline(self._action_space)

        # Load calibration
        calibration_path = model_dir / "calibration.json"
        if calibration_path.exists():
            self._calibration = json.loads(calibration_path.read_text())

        # Load model based on type
        if self.config.model_type == "onnx":
            self._load_onnx_model(model_dir / "model.onnx")
        elif self.config.model_type == "torch":
            self._load_torch_model(model_dir / "model.pt", model_config)
        else:
            # Heuristic-only mode
            self._model = None

    def _load_onnx_model(self, model_path: Path) -> None:
        """Load ONNX model for inference."""
        try:
            import onnxruntime as ort

            self._model = ort.InferenceSession(
                str(model_path),
                providers=["CPUExecutionProvider"],
            )
            self._model_type = "onnx"
        except Exception as e:
            logger.warning(f"Failed to load ONNX model: {e}, falling back to heuristic")
            self._model = None

    def _load_torch_model(self, model_path: Path, config: dict) -> None:
        """Load PyTorch model for inference."""
        try:
            import torch
            from cyntra.planner.models.mlp import MLPPolicy

            model = MLPPolicy(
                d_in=config["d_in"],
                d_hidden=config.get("d_hidden", 512),
                n_layers=config.get("n_layers", 3),
                action_space=self._action_space,
            )
            model.load_state_dict(torch.load(model_path, map_location="cpu"))
            model.eval()
            self._model = model
            self._model_type = "torch"
        except Exception as e:
            logger.warning(f"Failed to load PyTorch model: {e}, falling back to heuristic")
            self._model = None

    def predict(
        self,
        issue: Issue,
        *,
        history: list[dict[str, Any]],
        universe_defaults: dict[str, Any],
        system_state: dict[str, Any] | None = None,
    ) -> PlannerAction:
        """
        Predict optimal action for an issue.

        Args:
            issue: Issue to plan for
            history: Similar run summaries
            universe_defaults: Universe default settings
            system_state: Optional current system state

        Returns:
            PlannerAction with prediction and confidence
        """
        start_time = time.monotonic()

        # Build planner input
        planner_input = self._build_planner_input(
            issue, history, universe_defaults, system_state
        )
        job_type = planner_input.get("job_type", "code")

        # Check if model is available
        if self._model is None:
            return self._baseline_prediction(planner_input, reason="model_unavailable")

        try:
            # Encode input
            features = self._encoder.encode(planner_input)

            # Run inference
            if self._model_type == "onnx":
                logits = self._run_onnx_inference(features)
            else:
                logits = self._run_torch_inference(features)

            # Check timeout
            elapsed_ms = (time.monotonic() - start_time) * 1000
            if elapsed_ms > self.config.timeout_ms:
                return self._baseline_prediction(planner_input, reason="inference_timeout")

            # Apply calibration
            if self._calibration and self.config.use_calibration:
                logits = self._apply_calibration(logits)

            # Decode with validity masking
            action, confidence = self._decode_action(logits, job_type)

            # Check confidence threshold
            if confidence < self.config.confidence_threshold:
                return self._baseline_prediction(
                    planner_input,
                    reason=f"low_confidence_{confidence:.3f}",
                )

            return PlannerAction(
                swarm_id=action["swarm_id"],
                max_candidates_bin=action["budgets"]["max_candidates_bin"],
                max_minutes_bin=action["budgets"]["max_minutes_bin"],
                max_iterations_bin=action["budgets"]["max_iterations_bin"],
                confidence=confidence,
            )

        except Exception as e:
            logger.error(f"Inference failed: {e}")
            return self._baseline_prediction(planner_input, reason=f"inference_error_{type(e).__name__}")

    def _build_planner_input(
        self,
        issue: Issue,
        history: list[dict[str, Any]],
        universe_defaults: dict[str, Any],
        system_state: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """Build planner_input.v1 from components."""
        return {
            "schema_version": "cyntra.planner_input.v1",
            "created_at": now_rfc3339(),
            "universe_id": universe_defaults.get("universe_id", "unknown"),
            "job_type": issue.job_type or "code",
            "universe_defaults": universe_defaults,
            "issue": {
                "issue_id": issue.id,
                "dk_priority": issue.dk_priority or "P2",
                "dk_risk": issue.dk_risk or "medium",
                "dk_size": issue.dk_size or "M",
                "dk_tool_hint": issue.dk_tool_hint,
                "dk_attempts": issue.dk_attempts or 0,
                "tags": issue.tags or [],
            },
            "history": {"last_n_similar_runs": history},
            "action_space": self._action_space.to_dict(),
            "system_state": system_state,
        }

    def _run_onnx_inference(self, features: np.ndarray) -> dict[str, np.ndarray]:
        """Run ONNX model inference."""
        inputs = {"input": features.reshape(1, -1).astype(np.float32)}
        outputs = self._model.run(None, inputs)

        # Assume output order: swarm, candidates, minutes, iterations
        return {
            "swarm": outputs[0][0],
            "candidates": outputs[1][0],
            "minutes": outputs[2][0],
            "iterations": outputs[3][0],
        }

    def _run_torch_inference(self, features: np.ndarray) -> dict[str, np.ndarray]:
        """Run PyTorch model inference."""
        import torch

        with torch.no_grad():
            x = torch.from_numpy(features).unsqueeze(0)
            logits = self._model(x)
            return {k: v[0].numpy() for k, v in logits.items()}

    def _apply_calibration(self, logits: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
        """Apply temperature scaling calibration."""
        temps = self._calibration.get("temperature", {})
        return {
            head: logits[head] / temps.get(head, 1.0)
            for head in logits
        }

    def _decode_action(
        self,
        logits: dict[str, np.ndarray],
        job_type: str,
    ) -> tuple[dict[str, Any], float]:
        """Decode logits to action with validity masking."""
        # Get validity masks
        masks = self._mask_builder.build_mask(job_type)

        # Apply masks and softmax
        probs = {}
        for head, head_logits in logits.items():
            mask = masks.get(head.replace("swarm", "swarm"), np.ones_like(head_logits, dtype=bool))
            masked_logits = np.where(mask, head_logits, -np.inf)
            exp_logits = np.exp(masked_logits - np.max(masked_logits))
            probs[head] = exp_logits / exp_logits.sum()

        # Decode each head
        swarm_idx = int(np.argmax(probs["swarm"]))
        candidates_idx = int(np.argmax(probs["candidates"]))
        minutes_idx = int(np.argmax(probs["minutes"]))
        iterations_idx = int(np.argmax(probs["iterations"]))

        # Compute confidence as product of max probs
        confidence = float(
            probs["swarm"][swarm_idx]
            * probs["candidates"][candidates_idx]
            * probs["minutes"][minutes_idx]
            * probs["iterations"][iterations_idx]
        ) ** 0.25  # Geometric mean

        action = self._action_encoder.decode_action(
            swarm_idx, candidates_idx, minutes_idx, iterations_idx
        )

        return action, confidence

    def _baseline_prediction(
        self,
        planner_input: dict[str, Any],
        reason: str,
    ) -> PlannerAction:
        """Fall back to heuristic baseline."""
        action = self._baseline.predict(planner_input)
        return PlannerAction(
            swarm_id=action["swarm_id"],
            max_candidates_bin=action["budgets"]["max_candidates_bin"],
            max_minutes_bin=action["budgets"]["max_minutes_bin"],
            max_iterations_bin=action["budgets"]["max_iterations_bin"],
            confidence=1.0,  # Baseline is deterministic
            abstain_to_default=True,
            reason=reason,
        )
```

### 4.2 Scheduler Integration

```python
# cyntra-kernel/src/cyntra/kernel/scheduler.py (modifications)

from cyntra.planner.inference import PlannerInference, PlannerAction, InferenceConfig
from cyntra.planner.similar_runs import SimilarRunsQuery, select_similar_runs

class Scheduler:
    def __init__(self, config: KernelConfig):
        self.config = config
        self._planner: PlannerInference | None = None

        # Initialize planner if enabled
        if config.planner.enabled:
            self._init_planner()

    def _init_planner(self) -> None:
        """Initialize planner inference module."""
        planner_config = self.config.planner
        try:
            inference_config = InferenceConfig(
                model_path=Path(planner_config.model.path),
                model_type=planner_config.model.type,
                confidence_threshold=planner_config.inference.confidence_threshold,
                use_calibration=planner_config.inference.use_calibration,
                timeout_ms=planner_config.inference.timeout_ms,
                fallback=planner_config.model.fallback,
            )
            self._planner = PlannerInference(inference_config)
            logger.info("Planner inference initialized", model_path=planner_config.model.path)
        except Exception as e:
            logger.error(f"Failed to initialize planner: {e}")
            self._planner = None

    async def plan_issue(self, issue: Issue) -> PlannerAction | None:
        """
        Get planner prediction for an issue.

        Returns None if planner is disabled or unavailable.
        """
        if self._planner is None:
            return None

        # Check if job type is enabled
        enabled_types = self.config.planner.flags.enabled_job_types
        if issue.job_type not in enabled_types:
            return None

        # Get similar runs for history
        history = await self._get_similar_runs(issue)

        # Get universe defaults
        universe_defaults = self._get_universe_defaults()

        # Get system state
        system_state = self._get_system_state()

        # Run inference
        action = self._planner.predict(
            issue,
            history=history,
            universe_defaults=universe_defaults,
            system_state=system_state,
        )

        # Apply safety caps
        action = self._apply_safety_caps(action)

        # Shadow mode: log but don't use
        if self.config.planner.flags.shadow_mode:
            logger.info("Planner shadow prediction", action=action.to_dict())
            return None

        return action

    async def _get_similar_runs(self, issue: Issue) -> list[dict[str, Any]]:
        """Retrieve similar runs for history context."""
        from cyntra.planner.dataset import collect_run_summaries

        summaries = collect_run_summaries(
            repo_root=self.config.repo_root,
            include_world=(issue.job_type == "fab-world"),
        )

        query = SimilarRunsQuery(
            job_type=issue.job_type or "code",
            started_ms=int(time.time() * 1000),
            tags=issue.tags or [],
        )

        return select_similar_runs(query, summaries, n=8)

    def _apply_safety_caps(self, action: PlannerAction) -> PlannerAction:
        """Enforce safety caps on action."""
        caps = self.config.planner.safety

        max_candidates = action.max_candidates_bin
        if isinstance(max_candidates, int) and max_candidates > caps.max_candidates_cap:
            action.max_candidates_bin = caps.max_candidates_cap
            action.reason = f"capped_max_candidates_from_{max_candidates}"

        max_minutes = action.max_minutes_bin
        if isinstance(max_minutes, int) and max_minutes > caps.max_minutes_cap:
            action.max_minutes_bin = caps.max_minutes_cap
            action.reason = f"capped_max_minutes_from_{max_minutes}"

        return action
```

### 4.3 Dispatcher Integration

```python
# cyntra-kernel/src/cyntra/kernel/dispatcher.py (modifications)

async def dispatch_async(
    issue: Issue,
    *,
    config: KernelConfig,
    state: StateManager,
    planner_action: PlannerAction | None = None,
) -> tuple[Workcell, Manifest]:
    """
    Dispatch issue with optional planner action.

    If planner_action is provided, use it to configure execution.
    Otherwise, fall back to heuristic decision.
    """
    if planner_action is not None and not planner_action.abstain_to_default:
        # Use planner decision
        should_spec = planner_action.swarm_id == "speculate_vote"
        parallelism = (
            planner_action.max_candidates_bin
            if isinstance(planner_action.max_candidates_bin, int)
            else 1
        )
        timeout = (
            planner_action.max_minutes_bin * 60
            if isinstance(planner_action.max_minutes_bin, int)
            else None
        )
    else:
        # Heuristic fallback
        should_spec = should_speculate(issue, config)
        parallelism = determine_parallelism(issue, config, should_spec)
        timeout = determine_timeout(issue, config)

    # Build executed_plan
    executed_plan = ExecutedPlan(
        swarm_id_executed="speculate_vote" if should_spec else "serial_handoff",
        max_candidates_executed=parallelism if should_spec else 1,
        timeout_seconds_executed=timeout,
        max_iterations_executed=None,
        fallback_applied=planner_action.abstain_to_default if planner_action else False,
        fallback_reason=planner_action.reason if planner_action else None,
    )

    # Build manifest
    manifest = build_manifest(
        issue,
        config,
        executed_plan=executed_plan,
        planner_action=planner_action.to_dict() if planner_action else None,
    )

    # Create workcell and dispatch
    workcell = await create_workcell(issue, config)
    return workcell, manifest
```

### 4.4 CLI Integration

```python
# cyntra-kernel/src/cyntra/cli.py (additions)

@cli.command()
@click.option("--planner-model", type=Path, help="Override planner model path")
@click.option("--planner-mode", type=click.Choice(["enabled", "disabled", "shadow"]),
              default="enabled", help="Planner mode")
@click.option("--confidence-threshold", type=float, help="Override confidence threshold")
def run(
    planner_model: Path | None,
    planner_mode: str,
    confidence_threshold: float | None,
    **kwargs,
):
    """Run the kernel with optional planner configuration."""
    config = load_config()

    # Apply CLI overrides
    if planner_model:
        config.planner.model.path = str(planner_model)

    if planner_mode == "disabled":
        config.planner.enabled = False
    elif planner_mode == "shadow":
        config.planner.enabled = True
        config.planner.flags.shadow_mode = True

    if confidence_threshold is not None:
        config.planner.inference.confidence_threshold = confidence_threshold

    # Run kernel
    run_kernel(config, **kwargs)
```

---

## 5. Implementation Tasks

### 5.1 Task Breakdown

| Task ID | Description | Est. Hours | Dependencies |
|---------|-------------|------------|--------------|
| T5.1 | Define PlannerAction dataclass | 1 | None |
| T5.2 | Define InferenceConfig dataclass | 1 | None |
| T5.3 | Implement PlannerInference._load_model() | 3 | T5.2 |
| T5.4 | Implement PlannerInference._load_onnx_model() | 2 | T5.3 |
| T5.5 | Implement PlannerInference._load_torch_model() | 2 | T5.3 |
| T5.6 | Implement PlannerInference.predict() | 4 | T5.3-T5.5 |
| T5.7 | Implement PlannerInference._decode_action() | 2 | T5.6 |
| T5.8 | Implement PlannerInference._baseline_prediction() | 1 | T5.6 |
| T5.9 | Implement Scheduler.plan_issue() | 3 | T5.6 |
| T5.10 | Implement Scheduler._get_similar_runs() | 2 | T5.9 |
| T5.11 | Update dispatcher for planner_action | 3 | T5.9 |
| T5.12 | Add planner config to KernelConfig | 2 | T5.2 |
| T5.13 | Add CLI options for planner | 2 | T5.12 |
| T5.14 | Unit tests for PlannerInference | 4 | T5.6-T5.8 |
| T5.15 | Integration test: end-to-end with model | 4 | T5.11 |
| T5.16 | Integration test: fallback behavior | 2 | T5.11 |

**Total estimated hours:** 38

### 5.2 File Deliverables

| File | Description | Status |
|------|-------------|--------|
| `cyntra-kernel/src/cyntra/planner/inference.py` | PlannerInference class | NEW |
| `cyntra-kernel/src/cyntra/kernel/scheduler.py` | Add plan_issue() | MODIFY |
| `cyntra-kernel/src/cyntra/kernel/dispatcher.py` | Accept planner_action | MODIFY |
| `cyntra-kernel/src/cyntra/kernel/config.py` | Add planner config | MODIFY |
| `cyntra-kernel/src/cyntra/cli.py` | Add planner CLI options | MODIFY |
| `cyntra-kernel/tests/planner/test_inference.py` | Unit tests | NEW |
| `cyntra-kernel/tests/integration/test_planner_integration.py` | Integration tests | NEW |

---

## 6. Testing Requirements

### 6.1 Unit Tests

```python
# tests/planner/test_inference.py

def test_planner_inference_loads_onnx():
    """Verify ONNX model loads correctly."""
    config = InferenceConfig(
        model_path=Path("test_fixtures/planner_model"),
        model_type="onnx",
    )
    inference = PlannerInference(config)
    assert inference._model is not None
    assert inference._model_type == "onnx"

def test_planner_inference_fallback_on_missing_model():
    """Verify fallback to heuristic when model missing."""
    config = InferenceConfig(
        model_path=Path("nonexistent"),
        model_type="onnx",
        fallback="heuristic",
    )
    inference = PlannerInference(config)
    assert inference._model is None
    assert inference._baseline is not None

def test_planner_inference_predict():
    """Verify prediction returns valid action."""
    inference = create_test_inference()
    issue = create_test_issue()
    history = []
    universe_defaults = {"swarm_id": None}

    action = inference.predict(
        issue,
        history=history,
        universe_defaults=universe_defaults,
    )

    assert action.swarm_id in ["serial_handoff", "speculate_vote"]
    assert 0 <= action.confidence <= 1

def test_planner_inference_low_confidence_fallback():
    """Verify fallback when confidence below threshold."""
    config = InferenceConfig(
        model_path=Path("test_fixtures/planner_model"),
        confidence_threshold=0.99,  # Very high threshold
    )
    inference = PlannerInference(config)
    issue = create_test_issue()

    action = inference.predict(issue, history=[], universe_defaults={})

    # Should fall back due to low confidence
    assert action.abstain_to_default == True
    assert "low_confidence" in action.reason

def test_planner_inference_timeout_fallback():
    """Verify fallback when inference times out."""
    config = InferenceConfig(
        model_path=Path("test_fixtures/slow_model"),
        timeout_ms=1,  # Very short timeout
    )
    inference = PlannerInference(config)
    issue = create_test_issue()

    action = inference.predict(issue, history=[], universe_defaults={})

    assert action.abstain_to_default == True
    assert "timeout" in action.reason
```

### 6.2 Integration Tests

```python
# tests/integration/test_planner_integration.py

@pytest.mark.asyncio
async def test_dispatch_with_planner():
    """Verify dispatch uses planner action."""
    config = create_test_config(planner_enabled=True)
    state = create_test_state()
    issue = create_test_issue(dk_risk="high")

    # Get planner action
    scheduler = Scheduler(config)
    action = await scheduler.plan_issue(issue)
    assert action is not None

    # Dispatch with action
    workcell, manifest = await dispatch_async(
        issue,
        config=config,
        state=state,
        planner_action=action,
    )

    # Verify manifest has planner section
    assert "planner" in manifest.__dict__ or hasattr(manifest, "planner")
    assert "planned_action" in manifest.planner

@pytest.mark.asyncio
async def test_shadow_mode():
    """Verify shadow mode logs but doesn't use prediction."""
    config = create_test_config(
        planner_enabled=True,
        shadow_mode=True,
    )
    scheduler = Scheduler(config)
    issue = create_test_issue()

    action = await scheduler.plan_issue(issue)

    # Shadow mode should return None (don't use prediction)
    assert action is None

@pytest.mark.asyncio
async def test_fallback_on_planner_error():
    """Verify graceful fallback when planner fails."""
    config = create_test_config(
        planner_enabled=True,
        model_path="invalid/path",
    )
    scheduler = Scheduler(config)
    issue = create_test_issue()

    # Should not raise, should fall back to heuristic
    action = await scheduler.plan_issue(issue)
    # Planner might be None if completely failed to initialize
    # or might return with abstain_to_default=True
```

---

## 7. Acceptance Criteria

### 7.1 Functional Requirements

- [ ] PlannerInference loads ONNX models correctly
- [ ] PlannerInference loads PyTorch models correctly
- [ ] Inference fallback to heuristic when model unavailable
- [ ] Inference fallback when confidence below threshold
- [ ] Inference fallback on timeout
- [ ] Safety caps enforced on predictions
- [ ] Shadow mode logs without affecting execution
- [ ] CLI options override config correctly

### 7.2 Performance Requirements

- [ ] Inference latency < 100ms (configurable)
- [ ] Model loading time < 5 seconds
- [ ] Memory overhead < 500MB for model in memory

### 7.3 Safety Requirements

- [ ] Never crash kernel on inference failure
- [ ] Always record fallback_applied and reason
- [ ] Safety caps always enforced regardless of model output

---

## 8. Rollout Plan

### 8.1 Phase 1: Shadow Mode (Week 1)
- Deploy with `shadow_mode: true`
- Log all predictions without using them
- Collect data on prediction quality vs heuristic

### 8.2 Phase 2: Limited Rollout (Week 2)
- Enable for low-risk issues only (`dk_risk: low`)
- Monitor outcomes vs historical baseline
- Tune confidence threshold based on results

### 8.3 Phase 3: Full Rollout (Week 3+)
- Enable for all issue types
- Monitor fallback rate and adjust
- Collect data for model retraining

---

## 9. Dependencies

### 9.1 Upstream Dependencies

| Dependency | Location | Status |
|------------|----------|--------|
| Track 1 (Tokenization) | `cyntra/planner/tokenizer.py` | REQUIRED |
| Track 2 (Models) | `cyntra/planner/models/` | REQUIRED |
| Track 4 (executed_plan) | `kernel/dispatcher.py` | REQUIRED |
| onnxruntime | `requirements.txt` | EXTERNAL |

### 9.2 Downstream Dependents

| Dependent | Description |
|-----------|-------------|
| None | This is the final integration track |

---

## 10. Open Questions

1. **Model versioning:** How should we handle model version updates during runtime?
   - Recommendation: Require restart for model updates in v1

2. **A/B testing:** Should we support running multiple models simultaneously?
   - Recommendation: Not in v1, use shadow mode for comparison

3. **Warm-up:** Should we warm up the model with dummy inference on startup?
   - Recommendation: Yes, run one dummy inference to avoid cold start latency

---

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12 | Planner Agent | Initial specification |
