# Track 2: Baseline + MLP Models Specification

**Status:** Implementation Ready
**Priority:** P1-HIGH
**Owner:** training-agent
**Depends On:** Track 1 (Tokenization)
**Blocks:** Track 5 (Kernel Integration), Track 6 (ONNX Packaging)
**Spec Reference:** `docs/models/swarm_planner_training_spec.md` §7
**Last Updated:** 2025-12

---

## 1. Overview

### 1.1 Purpose

This track implements the policy models that predict swarm topology and budget actions from encoded planner inputs. We follow a **baselines-first** approach: simple models must be implemented and evaluated before more complex architectures.

### 1.2 Goals

1. Implement deterministic heuristic baseline that reproduces current kernel behavior
2. Implement feature-based MLP policy with multi-head classification
3. Establish training loop with proper loss functions and optimization
4. Define evaluation metrics aligned with spec §8
5. Enable ablation studies for architecture comparison

### 1.3 Non-Goals (v1)

- Transformer or recurrent models (these are optional in v1 per spec §7.2)
- Online learning or reinforcement learning
- Distributed training
- Hyperparameter search automation

---

## 2. Model Architecture

### 2.1 Model Hierarchy

```
                    BasePolicy (abstract)
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    HeuristicBaseline  MLPPolicy    TransformerPolicy
         │               │               │
         ▼               ▼               ▼
    (deterministic)  (trainable)    (optional v1)
```

### 2.2 HeuristicBaseline Architecture

The heuristic baseline reproduces the current kernel decision logic from:
- `cyntra-kernel/src/cyntra/kernel/scheduler.py:should_speculate()`
- `cyntra-kernel/src/cyntra/control/exploration_controller.py:decide()`

```
Input: planner_input.v1
         │
         ▼
    ┌───────────────────────────────────────────────┐
    │           Rule-Based Decision Tree            │
    │                                               │
    │  if dk_risk in (high, critical):              │
    │      swarm = speculate_vote                   │
    │      max_candidates = 3                       │
    │  elif dk_size in (L, XL):                     │
    │      swarm = speculate_vote                   │
    │      max_candidates = 2                       │
    │  else:                                        │
    │      swarm = serial_handoff                   │
    │      max_candidates = 1                       │
    │                                               │
    │  max_minutes = map_from_size(dk_size)         │
    │  max_iterations = NA (for code jobs)          │
    └───────────────────────────────────────────────┘
         │
         ▼
Output: planner_action.v1
```

**Key Properties:**
- Deterministic: same input always produces same output
- No training required
- Serves as evaluation baseline for all trained models

### 2.3 MLPPolicy Architecture

```
Input Tensor (d_in = 3779)
         │
         ▼
    ┌───────────────────────┐
    │   Linear(3779, 512)   │
    │   LayerNorm           │
    │   ReLU                │
    │   Dropout(0.1)        │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │   Linear(512, 256)    │
    │   LayerNorm           │
    │   ReLU                │
    │   Dropout(0.1)        │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │   Linear(256, 128)    │
    │   LayerNorm           │
    │   ReLU                │
    │   Dropout(0.1)        │
    └───────────┬───────────┘
                │
    ┌───────────┴───────────────────────────────────┐
    │                                               │
    ▼               ▼               ▼               ▼
┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Swarm   │   │Candidates│   │ Minutes  │   │Iterations│
│ Head    │   │  Head    │   │   Head   │   │   Head   │
│ (2 cls) │   │ (4 cls)  │   │ (6 cls)  │   │ (5 cls)  │
└────┬────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │             │              │              │
     ▼             ▼              ▼              ▼
  logits[2]    logits[4]     logits[6]      logits[5]
```

**Head Details:**

| Head | Output Dim | Classes |
|------|------------|---------|
| swarm_head | 2 | serial_handoff, speculate_vote |
| candidates_head | 4 | 1, 2, 3, NA |
| minutes_head | 6 | 15, 30, 45, 60, 120, NA |
| iterations_head | 5 | 1, 2, 3, 5, NA |

### 2.4 Shared Trunk + Multi-Head Design

```python
class MLPPolicy(nn.Module):
    def __init__(
        self,
        d_in: int,
        d_hidden: int = 512,
        n_layers: int = 3,
        dropout: float = 0.1,
        action_space: ActionSpace,
    ):
        super().__init__()

        # Shared trunk
        layers = []
        dims = [d_in] + [d_hidden // (2**i) for i in range(n_layers)]
        for i in range(n_layers):
            layers.extend([
                nn.Linear(dims[i], dims[i+1]),
                nn.LayerNorm(dims[i+1]),
                nn.ReLU(),
                nn.Dropout(dropout),
            ])
        self.trunk = nn.Sequential(*layers)

        d_trunk_out = dims[-1]  # 128 by default

        # Per-action-component heads
        self.swarm_head = nn.Linear(d_trunk_out, len(action_space.swarm_ids))
        self.candidates_head = nn.Linear(d_trunk_out, len(action_space.max_candidates_bins))
        self.minutes_head = nn.Linear(d_trunk_out, len(action_space.max_minutes_bins))
        self.iterations_head = nn.Linear(d_trunk_out, len(action_space.max_iterations_bins))

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        """
        Forward pass returning logits for each action component.

        Args:
            x: Input tensor of shape (batch, d_in)

        Returns:
            Dict with keys: swarm, candidates, minutes, iterations
            Each value is logits tensor of shape (batch, n_classes)
        """
        h = self.trunk(x)
        return {
            "swarm": self.swarm_head(h),
            "candidates": self.candidates_head(h),
            "minutes": self.minutes_head(h),
            "iterations": self.iterations_head(h),
        }
```

---

## 3. Training Configuration

### 3.1 Loss Function

**Multi-head cross-entropy with validity masking:**

```python
class PlannerLoss(nn.Module):
    def __init__(
        self,
        head_weights: dict[str, float] | None = None,
        label_smoothing: float = 0.0,
    ):
        super().__init__()
        self.head_weights = head_weights or {
            "swarm": 1.0,
            "candidates": 1.0,
            "minutes": 1.0,
            "iterations": 1.0,
        }
        self.ce = nn.CrossEntropyLoss(label_smoothing=label_smoothing, reduction="none")

    def forward(
        self,
        logits: dict[str, torch.Tensor],
        labels: dict[str, torch.Tensor],
        masks: dict[str, torch.Tensor] | None = None,
    ) -> torch.Tensor:
        """
        Compute weighted multi-head cross-entropy loss.

        Args:
            logits: Dict of logits per head, shape (batch, n_classes)
            labels: Dict of class indices per head, shape (batch,)
            masks: Optional validity masks per head, shape (batch, n_classes)

        Returns:
            Scalar loss tensor
        """
        total_loss = 0.0

        for head_name, head_logits in logits.items():
            head_labels = labels[head_name]

            # Apply validity mask if provided
            if masks is not None and head_name in masks:
                mask = masks[head_name]
                # Set invalid logits to -inf
                head_logits = head_logits.masked_fill(~mask, float("-inf"))

            head_loss = self.ce(head_logits, head_labels).mean()
            total_loss += self.head_weights[head_name] * head_loss

        return total_loss
```

### 3.2 Optimizer Configuration

```yaml
optimizer:
  type: AdamW
  lr: 1e-4
  weight_decay: 0.01
  betas: [0.9, 0.999]

scheduler:
  type: CosineAnnealingLR
  T_max: 100  # epochs
  eta_min: 1e-6

training:
  batch_size: 64
  epochs: 100
  early_stopping_patience: 10
  gradient_clip_norm: 1.0

regularization:
  dropout: 0.1
  label_smoothing: 0.1
```

### 3.3 Data Loading

```python
class PlannerDataset(torch.utils.data.Dataset):
    def __init__(
        self,
        examples: list[dict],
        encoder: PlannerInputEncoder,
        action_encoder: ActionEncoder,
        split: str = "train",
    ):
        self.examples = [e for e in examples if e.get("split") == split]
        self.encoder = encoder
        self.action_encoder = action_encoder

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        example = self.examples[idx]

        # Encode input
        features = self.encoder.encode(example["planner_input"])
        features_tensor = torch.from_numpy(features)

        # Encode label
        label = self.action_encoder.encode_label(example["label_action"])

        return {
            "features": features_tensor,
            "labels": {
                "swarm": torch.tensor(label.swarm_idx),
                "candidates": torch.tensor(label.max_candidates_idx),
                "minutes": torch.tensor(label.max_minutes_idx),
                "iterations": torch.tensor(label.max_iterations_idx),
            },
            "job_type": example["planner_input"].get("job_type", "code"),
        }
```

---

## 4. Evaluation Metrics

### 4.1 Diagnostic Metrics (Always Computed)

| Metric | Description | Formula |
|--------|-------------|---------|
| `per_head_accuracy` | Accuracy per action component | `correct_head / total` |
| `exact_match_accuracy` | All 4 components correct | `all_correct / total` |
| `swarm_accuracy` | Swarm head accuracy | `correct_swarm / total` |
| `candidates_accuracy` | Candidates head accuracy | `correct_cand / total` |
| `minutes_accuracy` | Minutes head accuracy | `correct_min / total` |
| `iterations_accuracy` | Iterations head accuracy | `correct_iter / total` |

### 4.2 Collapse Metrics

| Metric | Description | Formula |
|--------|-------------|---------|
| `action_entropy` | Entropy of predicted action distribution | `-Σ p(a) log p(a)` |
| `top1_frequency` | Frequency of most common prediction | `max(counts) / total` |
| `unique_actions` | Number of unique actions predicted | `len(set(predictions))` |

### 4.3 Calibration Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `ECE` | Expected Calibration Error | < 0.05 |
| `MCE` | Maximum Calibration Error | < 0.15 |
| `abstain_rate` | Fraction of low-confidence predictions | Monitor |

### 4.4 Evaluation Implementation

```python
@dataclass
class EvalMetrics:
    per_head_accuracy: dict[str, float]
    exact_match_accuracy: float
    action_entropy: float
    top1_frequency: float
    unique_actions: int
    ece: float
    mce: float

def evaluate_model(
    model: nn.Module,
    dataloader: DataLoader,
    action_encoder: ActionEncoder,
) -> EvalMetrics:
    model.eval()

    all_preds = {h: [] for h in ["swarm", "candidates", "minutes", "iterations"]}
    all_labels = {h: [] for h in ["swarm", "candidates", "minutes", "iterations"]}
    all_probs = {h: [] for h in ["swarm", "candidates", "minutes", "iterations"]}

    with torch.no_grad():
        for batch in dataloader:
            logits = model(batch["features"])
            for head_name in all_preds:
                probs = F.softmax(logits[head_name], dim=-1)
                preds = probs.argmax(dim=-1)
                all_preds[head_name].extend(preds.cpu().tolist())
                all_labels[head_name].extend(batch["labels"][head_name].tolist())
                all_probs[head_name].extend(probs.cpu().numpy())

    # Compute per-head accuracy
    per_head_acc = {}
    for head_name in all_preds:
        correct = sum(p == l for p, l in zip(all_preds[head_name], all_labels[head_name]))
        per_head_acc[head_name] = correct / len(all_preds[head_name])

    # Compute exact match
    n_examples = len(all_preds["swarm"])
    exact_matches = sum(
        all(all_preds[h][i] == all_labels[h][i] for h in all_preds)
        for i in range(n_examples)
    )
    exact_match_acc = exact_matches / n_examples

    # Compute collapse metrics
    action_tuples = [
        (all_preds["swarm"][i], all_preds["candidates"][i],
         all_preds["minutes"][i], all_preds["iterations"][i])
        for i in range(n_examples)
    ]
    unique_actions = len(set(action_tuples))

    from collections import Counter
    action_counts = Counter(action_tuples)
    top1_freq = max(action_counts.values()) / n_examples

    # Action entropy
    action_probs = np.array(list(action_counts.values())) / n_examples
    action_entropy = -np.sum(action_probs * np.log(action_probs + 1e-10))

    # Calibration (simplified ECE)
    ece = compute_ece(all_probs, all_labels, n_bins=10)
    mce = compute_mce(all_probs, all_labels, n_bins=10)

    return EvalMetrics(
        per_head_accuracy=per_head_acc,
        exact_match_accuracy=exact_match_acc,
        action_entropy=action_entropy,
        top1_frequency=top1_freq,
        unique_actions=unique_actions,
        ece=ece,
        mce=mce,
    )
```

---

## 5. Training Loop

### 5.1 Main Training Script

```python
# train/planner/train.py

import json
import logging
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from cyntra.planner.tokenizer import PlannerInputEncoder, ActionEncoder
from cyntra.planner.action_space import action_space_for_swarms
from cyntra.planner.models.mlp import MLPPolicy
from cyntra.planner.models.loss import PlannerLoss
from cyntra.planner.eval import evaluate_model

logger = logging.getLogger(__name__)


def load_dataset(dataset_dir: Path) -> tuple[list[dict], dict]:
    """Load dataset and metadata."""
    dataset_path = dataset_dir / "dataset.jsonl"
    meta_path = dataset_dir / "meta.json"

    examples = []
    with open(dataset_path) as f:
        for line in f:
            examples.append(json.loads(line))

    meta = json.loads(meta_path.read_text())
    return examples, meta


def train_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    optimizer: torch.optim.Optimizer,
    loss_fn: nn.Module,
    device: torch.device,
) -> float:
    """Train for one epoch, return average loss."""
    model.train()
    total_loss = 0.0
    n_batches = 0

    for batch in dataloader:
        features = batch["features"].to(device)
        labels = {k: v.to(device) for k, v in batch["labels"].items()}

        optimizer.zero_grad()
        logits = model(features)
        loss = loss_fn(logits, labels)
        loss.backward()

        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        total_loss += loss.item()
        n_batches += 1

    return total_loss / n_batches


def train(
    dataset_dir: Path,
    output_dir: Path,
    config: dict,
) -> dict:
    """
    Full training pipeline.

    Args:
        dataset_dir: Path to dataset directory with dataset.jsonl and meta.json
        output_dir: Path for checkpoints and logs
        config: Training configuration dict

    Returns:
        Dict with final metrics and checkpoint path
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    examples, meta = load_dataset(dataset_dir)
    logger.info(f"Loaded {len(examples)} examples")

    # Initialize encoders
    swarm_ids = meta.get("swarm_ids", ["serial_handoff", "speculate_vote"])
    action_space = action_space_for_swarms(swarm_ids)
    input_encoder = PlannerInputEncoder()
    action_encoder = ActionEncoder(action_space)

    # Create datasets
    train_dataset = PlannerDataset(examples, input_encoder, action_encoder, split="train")
    val_dataset = PlannerDataset(examples, input_encoder, action_encoder, split="val")
    test_dataset = PlannerDataset(examples, input_encoder, action_encoder, split="test")

    logger.info(f"Train: {len(train_dataset)}, Val: {len(val_dataset)}, Test: {len(test_dataset)}")

    train_loader = DataLoader(
        train_dataset,
        batch_size=config.get("batch_size", 64),
        shuffle=True,
        num_workers=0,
    )
    val_loader = DataLoader(val_dataset, batch_size=config.get("batch_size", 64))
    test_loader = DataLoader(test_dataset, batch_size=config.get("batch_size", 64))

    # Initialize model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = MLPPolicy(
        d_in=input_encoder.config.d_in,
        d_hidden=config.get("d_hidden", 512),
        n_layers=config.get("n_layers", 3),
        dropout=config.get("dropout", 0.1),
        action_space=action_space,
    ).to(device)

    # Loss and optimizer
    loss_fn = PlannerLoss(label_smoothing=config.get("label_smoothing", 0.1))
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.get("lr", 1e-4),
        weight_decay=config.get("weight_decay", 0.01),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=config.get("epochs", 100),
        eta_min=config.get("lr_min", 1e-6),
    )

    # Training loop
    best_val_acc = 0.0
    patience = config.get("early_stopping_patience", 10)
    patience_counter = 0

    for epoch in range(config.get("epochs", 100)):
        train_loss = train_epoch(model, train_loader, optimizer, loss_fn, device)
        scheduler.step()

        # Evaluate
        val_metrics = evaluate_model(model, val_loader, action_encoder)

        logger.info(
            f"Epoch {epoch}: loss={train_loss:.4f}, "
            f"val_exact_match={val_metrics.exact_match_accuracy:.4f}, "
            f"val_ece={val_metrics.ece:.4f}"
        )

        # Early stopping
        if val_metrics.exact_match_accuracy > best_val_acc:
            best_val_acc = val_metrics.exact_match_accuracy
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), output_dir / "best_model.pt")
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logger.info(f"Early stopping at epoch {epoch}")
                break

    # Load best model and evaluate on test set
    model.load_state_dict(torch.load(output_dir / "best_model.pt"))
    test_metrics = evaluate_model(model, test_loader, action_encoder)

    logger.info(f"Test metrics: {test_metrics}")

    # Save final results
    results = {
        "test_metrics": {
            "exact_match_accuracy": test_metrics.exact_match_accuracy,
            "per_head_accuracy": test_metrics.per_head_accuracy,
            "ece": test_metrics.ece,
            "action_entropy": test_metrics.action_entropy,
            "unique_actions": test_metrics.unique_actions,
        },
        "best_val_accuracy": best_val_acc,
        "checkpoint_path": str(output_dir / "best_model.pt"),
    }

    (output_dir / "results.json").write_text(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-4)
    args = parser.parse_args()

    config = {
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "lr": args.lr,
    }

    train(args.dataset_dir, args.output_dir, config)
```

---

## 6. Implementation Tasks

### 6.1 Task Breakdown

| Task ID | Description | Est. Hours | Dependencies |
|---------|-------------|------------|--------------|
| T2.1 | Implement `BasePolicy` abstract class | 1 | Track 1 |
| T2.2 | Implement `HeuristicBaseline` class | 4 | T2.1 |
| T2.3 | Extract heuristics from scheduler.py | 2 | T2.2 |
| T2.4 | Extract heuristics from exploration_controller.py | 2 | T2.2 |
| T2.5 | Implement `MLPPolicy` class | 3 | T2.1, Track 1 |
| T2.6 | Implement `PlannerLoss` class | 2 | T2.5 |
| T2.7 | Implement `PlannerDataset` class | 2 | Track 1 |
| T2.8 | Implement evaluation metrics | 3 | T2.5 |
| T2.9 | Implement calibration (ECE/MCE) | 2 | T2.8 |
| T2.10 | Implement training loop | 4 | T2.5-T2.9 |
| T2.11 | Add CLI for training script | 2 | T2.10 |
| T2.12 | Unit tests for models | 4 | T2.2, T2.5 |
| T2.13 | Integration test: train on sample data | 3 | T2.10 |
| T2.14 | Ablation infrastructure | 3 | T2.10 |

**Total estimated hours:** 37

### 6.2 File Deliverables

| File | Description | Status |
|------|-------------|--------|
| `cyntra-kernel/src/cyntra/planner/models/__init__.py` | Package init | NEW |
| `cyntra-kernel/src/cyntra/planner/models/base.py` | BasePolicy abstract class | NEW |
| `cyntra-kernel/src/cyntra/planner/models/baseline.py` | HeuristicBaseline | NEW |
| `cyntra-kernel/src/cyntra/planner/models/mlp.py` | MLPPolicy | NEW |
| `cyntra-kernel/src/cyntra/planner/models/loss.py` | PlannerLoss | NEW |
| `cyntra-kernel/src/cyntra/planner/eval.py` | Evaluation metrics | NEW |
| `train/planner/train.py` | Training script | NEW |
| `train/planner/config/default.yaml` | Default training config | NEW |
| `cyntra-kernel/tests/planner/test_models.py` | Model unit tests | NEW |
| `cyntra-kernel/tests/planner/test_training.py` | Training integration tests | NEW |

---

## 7. Testing Requirements

### 7.1 Model Unit Tests

```python
# tests/planner/test_models.py

def test_heuristic_baseline_deterministic():
    """Verify baseline produces deterministic outputs."""
    baseline = HeuristicBaseline(action_space)
    input1 = create_sample_input()
    action1 = baseline.predict(input1)
    action2 = baseline.predict(input1)
    assert action1 == action2

def test_heuristic_baseline_high_risk_speculates():
    """High-risk issues should trigger speculation."""
    baseline = HeuristicBaseline(action_space)
    input_data = create_sample_input(dk_risk="high")
    action = baseline.predict(input_data)
    assert action["swarm_id"] == "speculate_vote"
    assert action["budgets"]["max_candidates_bin"] >= 2

def test_mlp_policy_output_shape():
    """Verify MLP outputs correct shapes."""
    model = MLPPolicy(d_in=3779, action_space=action_space)
    x = torch.randn(8, 3779)
    logits = model(x)
    assert logits["swarm"].shape == (8, 2)
    assert logits["candidates"].shape == (8, 4)
    assert logits["minutes"].shape == (8, 6)
    assert logits["iterations"].shape == (8, 5)

def test_mlp_policy_no_nan():
    """Verify MLP doesn't produce NaN outputs."""
    model = MLPPolicy(d_in=3779, action_space=action_space)
    x = torch.randn(32, 3779)
    logits = model(x)
    for head_logits in logits.values():
        assert not torch.isnan(head_logits).any()

def test_loss_backward():
    """Verify loss supports gradient computation."""
    model = MLPPolicy(d_in=3779, action_space=action_space)
    loss_fn = PlannerLoss()
    x = torch.randn(8, 3779)
    logits = model(x)
    labels = {
        "swarm": torch.randint(0, 2, (8,)),
        "candidates": torch.randint(0, 4, (8,)),
        "minutes": torch.randint(0, 6, (8,)),
        "iterations": torch.randint(0, 5, (8,)),
    }
    loss = loss_fn(logits, labels)
    loss.backward()
    # Verify gradients exist
    assert model.trunk[0].weight.grad is not None
```

### 7.2 Training Integration Tests

```python
# tests/planner/test_training.py

def test_train_one_epoch():
    """Verify single epoch training works."""
    # Create minimal dataset
    examples = create_synthetic_examples(n=100)
    dataset = PlannerDataset(examples, encoder, action_encoder, split="train")
    loader = DataLoader(dataset, batch_size=16)

    model = MLPPolicy(d_in=encoder.config.d_in, action_space=action_space)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    loss_fn = PlannerLoss()

    initial_loss = train_epoch(model, loader, optimizer, loss_fn, torch.device("cpu"))
    assert initial_loss > 0
    assert not math.isnan(initial_loss)

def test_evaluation_metrics():
    """Verify evaluation produces valid metrics."""
    model = MLPPolicy(d_in=encoder.config.d_in, action_space=action_space)
    examples = create_synthetic_examples(n=50)
    dataset = PlannerDataset(examples, encoder, action_encoder, split="train")
    loader = DataLoader(dataset, batch_size=16)

    metrics = evaluate_model(model, loader, action_encoder)
    assert 0 <= metrics.exact_match_accuracy <= 1
    assert 0 <= metrics.ece <= 1
    assert metrics.unique_actions >= 1
```

---

## 8. Acceptance Criteria

### 8.1 Functional Requirements

- [ ] `HeuristicBaseline` reproduces current kernel behavior for all test cases
- [ ] `MLPPolicy` trains without NaN/Inf gradients
- [ ] Training loop converges (loss decreases over epochs)
- [ ] Evaluation metrics computed correctly
- [ ] Models save/load correctly with `torch.save`/`torch.load`

### 8.2 Performance Requirements

- [ ] Training throughput: > 100 examples/second on CPU
- [ ] Inference latency: < 10ms per example on CPU
- [ ] Memory: < 1GB for training with batch_size=64

### 8.3 Quality Requirements

- [ ] `MLPPolicy` achieves > 60% exact match accuracy on validation set
- [ ] `MLPPolicy` beats `HeuristicBaseline` on at least one primary metric
- [ ] ECE < 0.1 after temperature scaling
- [ ] No action collapse (unique_actions > 50% of possible actions)

---

## 9. Ablation Study Design

### 9.1 Required Ablations (per Spec §8.3)

| Ablation | Variable | Values to Test |
|----------|----------|----------------|
| History size | `n_similar_runs` | 0, 1, 4, 8, 16 |
| Model depth | `n_layers` | 1, 2, 3, 4 |
| Hidden size | `d_hidden` | 128, 256, 512, 1024 |
| Dropout | `dropout` | 0.0, 0.1, 0.2, 0.3 |
| Label smoothing | `label_smoothing` | 0.0, 0.05, 0.1, 0.2 |

### 9.2 Ablation Script

```python
# train/planner/ablation.py

ABLATION_CONFIGS = [
    # History size ablation
    {"name": "hist_0", "n_similar_runs": 0},
    {"name": "hist_1", "n_similar_runs": 1},
    {"name": "hist_4", "n_similar_runs": 4},
    {"name": "hist_8", "n_similar_runs": 8},
    {"name": "hist_16", "n_similar_runs": 16},

    # Model depth ablation
    {"name": "depth_1", "n_layers": 1},
    {"name": "depth_2", "n_layers": 2},
    {"name": "depth_3", "n_layers": 3},
    {"name": "depth_4", "n_layers": 4},

    # Hidden size ablation
    {"name": "hidden_128", "d_hidden": 128},
    {"name": "hidden_256", "d_hidden": 256},
    {"name": "hidden_512", "d_hidden": 512},
    {"name": "hidden_1024", "d_hidden": 1024},
]

def run_ablation(base_config: dict, ablation_configs: list[dict], output_dir: Path):
    """Run all ablations and collect results."""
    results = []
    for ablation in ablation_configs:
        config = {**base_config, **ablation}
        ablation_output = output_dir / ablation["name"]
        result = train(dataset_dir, ablation_output, config)
        result["ablation_name"] = ablation["name"]
        results.append(result)

    # Save summary
    summary_path = output_dir / "ablation_summary.json"
    summary_path.write_text(json.dumps(results, indent=2))
    return results
```

---

## 10. Dependencies

### 10.1 Upstream Dependencies

| Dependency | Location | Status |
|------------|----------|--------|
| Track 1 (Tokenization) | `cyntra/planner/tokenizer.py` | REQUIRED |
| `action_space.py` | `cyntra/planner/` | COMPLETE |
| `dataset.py` | `cyntra/planner/` | COMPLETE |
| PyTorch | `requirements.txt` | EXTERNAL |

### 10.2 Downstream Dependents

| Dependent | Description |
|-----------|-------------|
| Track 5 (Integration) | Uses trained models for inference |
| Track 6 (ONNX) | Exports models to ONNX format |

---

## 11. Open Questions

1. **Class imbalance:** Should we use class weighting or focal loss for imbalanced action distributions?
   - Recommendation: Start with class weighting based on training set distribution

2. **Joint vs multi-head:** Should we use joint-action classifier as an alternative to multi-head?
   - Recommendation: Implement both and compare in ablations

3. **Calibration method:** Temperature scaling or Platt scaling?
   - Recommendation: Temperature scaling (simpler, sufficient for v1)

---

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12 | Planner Agent | Initial specification |
