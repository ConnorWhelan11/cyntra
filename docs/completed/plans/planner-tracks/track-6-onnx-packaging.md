# Track 6: ONNX Packaging Specification

**Status:** Implementation Ready
**Priority:** P3-LOW
**Owner:** training-agent
**Depends On:** Track 2 (Models)
**Blocks:** Track 5 (Kernel Integration) - partially
**Spec Reference:** `docs/models/swarm_planner_training_spec.md` §11
**Last Updated:** 2025-12

---

## 1. Overview

### 1.1 Purpose

The Cyntra kernel should run planner inference without importing PyTorch. This track implements ONNX export of trained models and the supporting artifacts needed for deployment.

### 1.2 Goals

1. Export trained PyTorch models to ONNX format
2. Package model with all required artifacts (vocab, action_space, calibration)
3. Verify numeric equivalence between PyTorch and ONNX inference
4. Establish model versioning and bundle structure
5. Support CPU-only inference via onnxruntime

### 1.3 Non-Goals (v1)

- GPU inference optimization
- Model quantization (INT8)
- Model compression/pruning
- Dynamic batching
- Model serving infrastructure

---

## 2. Architecture

### 2.1 Export Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ONNX Export Pipeline                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Trained Model (PyTorch)                                            │
│       │                                                             │
│       │ state_dict + architecture                                   │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Model Preparation                         │   │
│  │                                                              │   │
│  │  1. Load model weights                                       │   │
│  │  2. Set eval mode                                            │   │
│  │  3. Create dummy input for tracing                           │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    torch.onnx.export()                       │   │
│  │                                                              │   │
│  │  - Dynamic batch size                                        │   │
│  │  - Named inputs/outputs                                      │   │
│  │  - Opset version 14                                          │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    ONNX Validation                           │   │
│  │                                                              │   │
│  │  1. onnx.checker.check_model()                               │   │
│  │  2. Run onnxruntime inference                                │   │
│  │  3. Compare outputs to PyTorch                               │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Bundle Assembly                           │   │
│  │                                                              │   │
│  │  - model.onnx                                                │   │
│  │  - config.json                                               │   │
│  │  - action_space.json                                         │   │
│  │  - calibration.json                                          │   │
│  │  - metadata.json                                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│                    Model Bundle Directory                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Model Bundle Structure

```
.cyntra/models/planner/v1/
├── model.onnx              # ONNX model (primary artifact)
├── model.pt                # PyTorch checkpoint (optional, for retraining)
├── config.json             # Model architecture configuration
├── action_space.json       # Action space definition
├── calibration.json        # Temperature scaling parameters
├── tokenizer_config.json   # Tokenizer configuration
├── metadata.json           # Version, provenance, training info
└── validation_report.json  # Numeric equivalence test results
```

---

## 3. Configuration Files

### 3.1 config.json

```json
{
  "model_type": "mlp",
  "d_in": 3779,
  "d_hidden": 512,
  "n_layers": 3,
  "dropout": 0.0,
  "heads": {
    "swarm": { "n_classes": 2 },
    "candidates": { "n_classes": 4 },
    "minutes": { "n_classes": 6 },
    "iterations": { "n_classes": 5 }
  },
  "onnx": {
    "opset_version": 14,
    "input_names": ["input"],
    "output_names": ["swarm", "candidates", "minutes", "iterations"],
    "dynamic_axes": {
      "input": { "0": "batch_size" },
      "swarm": { "0": "batch_size" },
      "candidates": { "0": "batch_size" },
      "minutes": { "0": "batch_size" },
      "iterations": { "0": "batch_size" }
    }
  }
}
```

### 3.2 action_space.json

```json
{
  "swarm_ids": ["serial_handoff", "speculate_vote"],
  "max_candidates_bins": [1, 2, 3, "NA"],
  "max_minutes_bins": [15, 30, 45, 60, 120, "NA"],
  "max_iterations_bins": [1, 2, 3, 5, "NA"],
  "validity_rules": [
    {
      "description": "If swarm_id=serial_handoff, then max_candidates_bin=1.",
      "if": { "swarm_id": "serial_handoff" },
      "then": { "max_candidates_bin": 1 }
    },
    {
      "description": "If job_type=\"code\", then max_iterations_bin=\"NA\".",
      "if": { "job_type": "code" },
      "then": { "max_iterations_bin": "NA" }
    }
  ]
}
```

### 3.3 calibration.json

```json
{
  "method": "temperature_scaling",
  "temperature": {
    "swarm": 1.2,
    "candidates": 1.1,
    "minutes": 1.0,
    "iterations": 1.0
  },
  "validation_ece": 0.045,
  "calibration_date": "2025-12-20T10:00:00Z"
}
```

### 3.4 metadata.json

```json
{
  "schema_version": "cyntra.model_bundle.v1",
  "model_version": "1.0.0",
  "model_name": "planner_mlp_v1",
  "created_at": "2025-12-20T12:00:00Z",

  "training": {
    "dataset_hash": "abc123...",
    "example_count": 5000,
    "epochs": 50,
    "best_val_accuracy": 0.72,
    "test_metrics": {
      "exact_match_accuracy": 0.68,
      "per_head_accuracy": {
        "swarm": 0.85,
        "candidates": 0.75,
        "minutes": 0.7,
        "iterations": 0.95
      }
    }
  },

  "provenance": {
    "git_sha": "def456...",
    "training_script": "train/planner/train.py",
    "config_hash": "ghi789..."
  },

  "compatibility": {
    "cyntra_kernel_min_version": "0.5.0",
    "onnxruntime_min_version": "1.16.0",
    "required_opset": 14
  }
}
```

### 3.5 validation_report.json

```json
{
  "schema_version": "cyntra.onnx_validation.v1",
  "validated_at": "2025-12-20T12:30:00Z",

  "onnx_check": {
    "passed": true,
    "errors": []
  },

  "numeric_equivalence": {
    "n_test_cases": 100,
    "max_abs_diff": 1.2e-6,
    "max_rel_diff": 1.5e-5,
    "all_within_tolerance": true,
    "tolerance": 1e-5
  },

  "inference_time": {
    "pytorch_mean_ms": 2.5,
    "pytorch_std_ms": 0.3,
    "onnx_mean_ms": 1.8,
    "onnx_std_ms": 0.2,
    "speedup": 1.39
  }
}
```

---

## 4. Implementation

### 4.1 Export Script

```python
# train/planner/export_onnx.py

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch

from cyntra.planner.models.mlp import MLPPolicy
from cyntra.planner.action_space import ActionSpace, action_space_for_swarms
from cyntra.planner.tokenizer import TokenizerConfig


def load_pytorch_model(
    checkpoint_path: Path,
    config_path: Path,
) -> tuple[MLPPolicy, dict[str, Any]]:
    """Load trained PyTorch model."""
    config = json.loads(config_path.read_text())

    swarm_ids = config["action_space"]["swarm_ids"]
    action_space = action_space_for_swarms(swarm_ids)

    model = MLPPolicy(
        d_in=config["d_in"],
        d_hidden=config.get("d_hidden", 512),
        n_layers=config.get("n_layers", 3),
        dropout=0.0,  # No dropout for inference
        action_space=action_space,
    )

    model.load_state_dict(torch.load(checkpoint_path, map_location="cpu"))
    model.eval()

    return model, config


def export_to_onnx(
    model: MLPPolicy,
    config: dict[str, Any],
    output_path: Path,
    *,
    opset_version: int = 14,
) -> None:
    """Export PyTorch model to ONNX."""
    d_in = config["d_in"]

    # Create dummy input
    dummy_input = torch.randn(1, d_in)

    # Define input/output names
    input_names = ["input"]
    output_names = ["swarm", "candidates", "minutes", "iterations"]

    # Define dynamic axes for variable batch size
    dynamic_axes = {
        "input": {0: "batch_size"},
        "swarm": {0: "batch_size"},
        "candidates": {0: "batch_size"},
        "minutes": {0: "batch_size"},
        "iterations": {0: "batch_size"},
    }

    # Export
    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        input_names=input_names,
        output_names=output_names,
        dynamic_axes=dynamic_axes,
        opset_version=opset_version,
        do_constant_folding=True,
        export_params=True,
    )

    print(f"Exported ONNX model to {output_path}")


def validate_onnx_model(
    onnx_path: Path,
    pytorch_model: MLPPolicy,
    config: dict[str, Any],
    *,
    n_test_cases: int = 100,
    tolerance: float = 1e-5,
) -> dict[str, Any]:
    """Validate ONNX model against PyTorch."""
    d_in = config["d_in"]
    report: dict[str, Any] = {
        "schema_version": "cyntra.onnx_validation.v1",
        "validated_at": None,  # Set by caller
    }

    # Check ONNX model
    try:
        onnx_model = onnx.load(str(onnx_path))
        onnx.checker.check_model(onnx_model)
        report["onnx_check"] = {"passed": True, "errors": []}
    except Exception as e:
        report["onnx_check"] = {"passed": False, "errors": [str(e)]}
        return report

    # Load ONNX runtime session
    session = ort.InferenceSession(
        str(onnx_path),
        providers=["CPUExecutionProvider"],
    )

    # Test numeric equivalence
    max_abs_diff = 0.0
    max_rel_diff = 0.0
    pytorch_times = []
    onnx_times = []

    pytorch_model.eval()

    for _ in range(n_test_cases):
        # Random input
        x = np.random.randn(1, d_in).astype(np.float32)
        x_torch = torch.from_numpy(x)

        # PyTorch inference
        import time
        start = time.perf_counter()
        with torch.no_grad():
            pytorch_out = pytorch_model(x_torch)
        pytorch_times.append((time.perf_counter() - start) * 1000)

        # ONNX inference
        start = time.perf_counter()
        onnx_out = session.run(None, {"input": x})
        onnx_times.append((time.perf_counter() - start) * 1000)

        # Compare outputs
        for i, head in enumerate(["swarm", "candidates", "minutes", "iterations"]):
            pt = pytorch_out[head].numpy()[0]
            ox = onnx_out[i][0]

            abs_diff = np.abs(pt - ox).max()
            rel_diff = np.abs((pt - ox) / (pt + 1e-10)).max()

            max_abs_diff = max(max_abs_diff, abs_diff)
            max_rel_diff = max(max_rel_diff, rel_diff)

    all_within_tolerance = max_abs_diff < tolerance

    report["numeric_equivalence"] = {
        "n_test_cases": n_test_cases,
        "max_abs_diff": float(max_abs_diff),
        "max_rel_diff": float(max_rel_diff),
        "all_within_tolerance": all_within_tolerance,
        "tolerance": tolerance,
    }

    report["inference_time"] = {
        "pytorch_mean_ms": float(np.mean(pytorch_times)),
        "pytorch_std_ms": float(np.std(pytorch_times)),
        "onnx_mean_ms": float(np.mean(onnx_times)),
        "onnx_std_ms": float(np.std(onnx_times)),
        "speedup": float(np.mean(pytorch_times) / np.mean(onnx_times)),
    }

    return report


def create_model_bundle(
    checkpoint_path: Path,
    config_path: Path,
    calibration_path: Path | None,
    output_dir: Path,
    *,
    model_version: str = "1.0.0",
    git_sha: str | None = None,
) -> Path:
    """
    Create complete model bundle for deployment.

    Args:
        checkpoint_path: Path to trained model checkpoint
        config_path: Path to model config.json
        calibration_path: Optional path to calibration.json
        output_dir: Output directory for bundle
        model_version: Semantic version string
        git_sha: Optional git SHA for provenance

    Returns:
        Path to created bundle directory
    """
    import datetime

    output_dir.mkdir(parents=True, exist_ok=True)

    # Load model
    model, config = load_pytorch_model(checkpoint_path, config_path)

    # Export ONNX
    onnx_path = output_dir / "model.onnx"
    export_to_onnx(model, config, onnx_path)

    # Validate
    report = validate_onnx_model(onnx_path, model, config)
    report["validated_at"] = datetime.datetime.utcnow().isoformat() + "Z"

    if not report["numeric_equivalence"]["all_within_tolerance"]:
        raise ValueError(
            f"ONNX validation failed: max_abs_diff={report['numeric_equivalence']['max_abs_diff']}"
        )

    # Copy/create config files
    (output_dir / "config.json").write_text(json.dumps(config, indent=2))

    # Action space
    action_space_data = config.get("action_space", {})
    (output_dir / "action_space.json").write_text(json.dumps(action_space_data, indent=2))

    # Calibration
    if calibration_path and calibration_path.exists():
        calibration = json.loads(calibration_path.read_text())
    else:
        calibration = {
            "method": "none",
            "temperature": {"swarm": 1.0, "candidates": 1.0, "minutes": 1.0, "iterations": 1.0},
        }
    (output_dir / "calibration.json").write_text(json.dumps(calibration, indent=2))

    # Tokenizer config
    tokenizer_config = TokenizerConfig()
    (output_dir / "tokenizer_config.json").write_text(json.dumps({
        "n_history_slots": tokenizer_config.n_history_slots,
        "n_tag_buckets": tokenizer_config.n_tag_buckets,
        "d_in": tokenizer_config.d_in,
    }, indent=2))

    # Validation report
    (output_dir / "validation_report.json").write_text(json.dumps(report, indent=2))

    # Metadata
    metadata = {
        "schema_version": "cyntra.model_bundle.v1",
        "model_version": model_version,
        "model_name": f"planner_mlp_{model_version.replace('.', '_')}",
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
        "provenance": {
            "git_sha": git_sha,
            "checkpoint_path": str(checkpoint_path),
        },
        "compatibility": {
            "cyntra_kernel_min_version": "0.5.0",
            "onnxruntime_min_version": "1.16.0",
            "required_opset": 14,
        },
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

    # Optionally copy PyTorch checkpoint
    if checkpoint_path.exists():
        import shutil
        shutil.copy(checkpoint_path, output_dir / "model.pt")

    print(f"Created model bundle at {output_dir}")
    return output_dir


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Export planner model to ONNX")
    parser.add_argument("--checkpoint", type=Path, required=True, help="Model checkpoint path")
    parser.add_argument("--config", type=Path, required=True, help="Model config path")
    parser.add_argument("--calibration", type=Path, help="Calibration config path")
    parser.add_argument("--output", type=Path, required=True, help="Output bundle directory")
    parser.add_argument("--version", type=str, default="1.0.0", help="Model version")
    parser.add_argument("--git-sha", type=str, help="Git SHA for provenance")

    args = parser.parse_args()

    create_model_bundle(
        args.checkpoint,
        args.config,
        args.calibration,
        args.output,
        model_version=args.version,
        git_sha=args.git_sha,
    )
```

### 4.2 ONNX Model Wrapper for Inference

```python
# kernel/src/cyntra/planner/onnx_model.py

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np


class ONNXPlannerModel:
    """
    ONNX-based planner model for inference.

    Loads model bundle and provides inference interface.
    """

    def __init__(self, bundle_path: Path):
        self.bundle_path = bundle_path
        self._session = None
        self._config = None
        self._action_space = None
        self._calibration = None

        self._load_bundle()

    def _load_bundle(self) -> None:
        """Load model bundle artifacts."""
        import onnxruntime as ort

        # Load ONNX model
        onnx_path = self.bundle_path / "model.onnx"
        if not onnx_path.exists():
            raise FileNotFoundError(f"Model not found: {onnx_path}")

        self._session = ort.InferenceSession(
            str(onnx_path),
            providers=["CPUExecutionProvider"],
        )

        # Load config
        config_path = self.bundle_path / "config.json"
        if config_path.exists():
            self._config = json.loads(config_path.read_text())

        # Load action space
        action_space_path = self.bundle_path / "action_space.json"
        if action_space_path.exists():
            self._action_space = json.loads(action_space_path.read_text())

        # Load calibration
        calibration_path = self.bundle_path / "calibration.json"
        if calibration_path.exists():
            self._calibration = json.loads(calibration_path.read_text())

    @property
    def d_in(self) -> int:
        """Input dimension."""
        return self._config.get("d_in", 3779)

    @property
    def action_space(self) -> dict[str, Any]:
        """Action space configuration."""
        return self._action_space or {}

    def predict(self, features: np.ndarray) -> dict[str, np.ndarray]:
        """
        Run inference on input features.

        Args:
            features: Input array of shape (batch, d_in) or (d_in,)

        Returns:
            Dict of logits per head
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)

        features = features.astype(np.float32)
        outputs = self._session.run(None, {"input": features})

        result = {
            "swarm": outputs[0],
            "candidates": outputs[1],
            "minutes": outputs[2],
            "iterations": outputs[3],
        }

        # Apply calibration
        if self._calibration and self._calibration.get("method") == "temperature_scaling":
            temps = self._calibration.get("temperature", {})
            for head in result:
                temp = temps.get(head, 1.0)
                if temp != 1.0:
                    result[head] = result[head] / temp

        return result

    def get_metadata(self) -> dict[str, Any]:
        """Get model metadata."""
        metadata_path = self.bundle_path / "metadata.json"
        if metadata_path.exists():
            return json.loads(metadata_path.read_text())
        return {}
```

---

## 5. Implementation Tasks

### 5.1 Task Breakdown

| Task ID | Description                              | Est. Hours | Dependencies |
| ------- | ---------------------------------------- | ---------- | ------------ |
| T6.1    | Implement export_to_onnx() function      | 3          | Track 2      |
| T6.2    | Implement validate_onnx_model() function | 3          | T6.1         |
| T6.3    | Implement create_model_bundle() function | 2          | T6.1-T6.2    |
| T6.4    | Implement ONNXPlannerModel class         | 2          | T6.3         |
| T6.5    | Define bundle file schemas               | 1          | None         |
| T6.6    | Add CLI for export script                | 1          | T6.3         |
| T6.7    | Unit tests for export                    | 3          | T6.1-T6.3    |
| T6.8    | Unit tests for ONNX inference            | 2          | T6.4         |
| T6.9    | Integration test: full export + load     | 2          | T6.3-T6.4    |
| T6.10   | Documentation for bundle structure       | 1          | T6.5         |

**Total estimated hours:** 20

### 5.2 File Deliverables

| File                                          | Description          | Status |
| --------------------------------------------- | -------------------- | ------ |
| `train/planner/export_onnx.py`                | Export script        | NEW    |
| `kernel/src/cyntra/planner/onnx_model.py`     | ONNX model wrapper   | NEW    |
| `kernel/tests/planner/test_onnx_export.py`    | Export tests         | NEW    |
| `kernel/tests/planner/test_onnx_inference.py` | Inference tests      | NEW    |
| `docs/models/model-bundle-format.md`          | Bundle documentation | NEW    |

---

## 6. Testing Requirements

### 6.1 Unit Tests

```python
# tests/planner/test_onnx_export.py

def test_export_produces_valid_onnx():
    """Verify export creates valid ONNX file."""
    model = create_test_mlp_model()
    config = create_test_config()

    with temp_dir() as output_dir:
        export_to_onnx(model, config, output_dir / "model.onnx")
        assert (output_dir / "model.onnx").exists()

        # Validate with ONNX checker
        import onnx
        onnx_model = onnx.load(str(output_dir / "model.onnx"))
        onnx.checker.check_model(onnx_model)

def test_export_supports_dynamic_batch():
    """Verify exported model supports variable batch sizes."""
    model = create_test_mlp_model()
    config = create_test_config()

    with temp_dir() as output_dir:
        export_to_onnx(model, config, output_dir / "model.onnx")

        session = ort.InferenceSession(str(output_dir / "model.onnx"))

        # Test different batch sizes
        for batch_size in [1, 4, 16, 32]:
            x = np.random.randn(batch_size, config["d_in"]).astype(np.float32)
            outputs = session.run(None, {"input": x})
            assert outputs[0].shape[0] == batch_size

def test_numeric_equivalence():
    """Verify ONNX output matches PyTorch."""
    model = create_test_mlp_model()
    config = create_test_config()

    with temp_dir() as output_dir:
        export_to_onnx(model, config, output_dir / "model.onnx")

        report = validate_onnx_model(
            output_dir / "model.onnx",
            model,
            config,
            n_test_cases=50,
            tolerance=1e-5,
        )

        assert report["numeric_equivalence"]["all_within_tolerance"]
        assert report["numeric_equivalence"]["max_abs_diff"] < 1e-5
```

### 6.2 Integration Tests

```python
# tests/planner/test_onnx_inference.py

def test_onnx_model_loads_bundle():
    """Verify ONNXPlannerModel loads complete bundle."""
    bundle_path = create_test_bundle()
    model = ONNXPlannerModel(bundle_path)

    assert model.d_in == 3779
    assert "swarm_ids" in model.action_space

def test_onnx_model_predict():
    """Verify ONNXPlannerModel produces valid outputs."""
    bundle_path = create_test_bundle()
    model = ONNXPlannerModel(bundle_path)

    features = np.random.randn(model.d_in).astype(np.float32)
    outputs = model.predict(features)

    assert "swarm" in outputs
    assert "candidates" in outputs
    assert "minutes" in outputs
    assert "iterations" in outputs
    assert outputs["swarm"].shape[-1] == 2

def test_onnx_model_calibration():
    """Verify calibration is applied correctly."""
    bundle_path = create_test_bundle(
        calibration={"method": "temperature_scaling", "temperature": {"swarm": 2.0}}
    )
    model = ONNXPlannerModel(bundle_path)

    features = np.random.randn(model.d_in).astype(np.float32)
    outputs = model.predict(features)

    # Calibrated outputs should be scaled
    # (exact values depend on input, just verify no errors)
    assert not np.isnan(outputs["swarm"]).any()
```

---

## 7. Acceptance Criteria

### 7.1 Functional Requirements

- [ ] Export produces valid ONNX model (passes onnx.checker)
- [ ] ONNX model supports dynamic batch sizes
- [ ] Numeric equivalence within 1e-5 tolerance
- [ ] Bundle contains all required artifacts
- [ ] ONNXPlannerModel loads and runs inference
- [ ] Calibration applied correctly

### 7.2 Performance Requirements

- [ ] ONNX inference faster than or equal to PyTorch
- [ ] Export completes in < 30 seconds
- [ ] Model file size < 10MB for MLP

### 7.3 Compatibility Requirements

- [ ] Works with onnxruntime >= 1.16.0
- [ ] ONNX opset version 14 compatibility
- [ ] CPU-only inference support

---

## 8. Dependencies

### 8.1 Upstream Dependencies

| Dependency       | Location                 | Status   |
| ---------------- | ------------------------ | -------- |
| Track 2 (Models) | `cyntra/planner/models/` | REQUIRED |
| onnx             | `requirements.txt`       | EXTERNAL |
| onnxruntime      | `requirements.txt`       | EXTERNAL |

### 8.2 Downstream Dependents

| Dependent             | Description                   |
| --------------------- | ----------------------------- |
| Track 5 (Integration) | Uses ONNX model for inference |

---

## 9. Open Questions

1. **Model quantization:** Should we support INT8 quantization for smaller models?
   - Recommendation: Not in v1, CPU inference is fast enough

2. **Model signing:** Should bundles be cryptographically signed?
   - Recommendation: Not in v1, use metadata hashes for integrity

3. **Multiple models:** Should a bundle support multiple model variants?
   - Recommendation: Not in v1, use separate bundles

---

## 10. Revision History

| Version | Date    | Author        | Changes               |
| ------- | ------- | ------------- | --------------------- |
| 1.0     | 2025-12 | Planner Agent | Initial specification |
