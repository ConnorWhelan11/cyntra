from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cyntra.planner.training.data import (
    EncodedExample,
    build_vocab,
    dataset_action_space,
    encode_dataset,
    load_dataset,
)
from cyntra.planner.training.model import (
    HeadSizes,
    PlannerMLP,
    PlannerRecurrent,
    PlannerTransformer,
    torch,
)


@dataclass(frozen=True)
class TrainConfig:
    seq_len: int = 512
    d_model: int = 128
    hidden_dim: int = 256
    n_layers: int = 2
    n_heads: int = 4
    dropout: float = 0.1
    tbptt_len: int = 64
    epochs: int = 10
    batch_size: int = 32
    lr: float = 3e-4
    weight_decay: float = 0.01
    seed: int = 42


def _set_seeds(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _batches(items: list[EncodedExample], batch_size: int) -> list[list[EncodedExample]]:
    out: list[list[EncodedExample]] = []
    for i in range(0, len(items), batch_size):
        out.append(items[i : i + batch_size])
    return out


def _as_tensor(batch: list[EncodedExample], *, seq_len: int) -> tuple[Any, Any, Any]:
    input_ids = torch.tensor([ex.input_ids for ex in batch], dtype=torch.long)
    attention_mask = torch.tensor([ex.attention_mask for ex in batch], dtype=torch.long)
    labels = {
        "swarm": torch.tensor([ex.label_swarm for ex in batch], dtype=torch.long),
        "max_candidates": torch.tensor([ex.label_max_candidates for ex in batch], dtype=torch.long),
        "max_minutes": torch.tensor([ex.label_max_minutes for ex in batch], dtype=torch.long),
        "max_iterations": torch.tensor([ex.label_max_iterations for ex in batch], dtype=torch.long),
    }
    # Defensive shape checks.
    if input_ids.shape[1] != seq_len:
        raise ValueError("Encoded seq_len mismatch")
    return input_ids, attention_mask, labels


def _accuracy(logits: Any, labels: Any) -> float:
    preds = torch.argmax(logits, dim=-1)
    correct = (preds == labels).sum().item()
    total = labels.numel()
    return float(correct) / float(total) if total else 0.0


def _exact_match(
    swarm_logits: Any,
    candidates_logits: Any,
    minutes_logits: Any,
    iterations_logits: Any,
    labels: dict[str, Any],
) -> float:
    swarm = torch.argmax(swarm_logits, dim=-1)
    candidates = torch.argmax(candidates_logits, dim=-1)
    minutes = torch.argmax(minutes_logits, dim=-1)
    iterations = torch.argmax(iterations_logits, dim=-1)

    ok = (
        (swarm == labels["swarm"])
        & (candidates == labels["max_candidates"])
        & (minutes == labels["max_minutes"])
        & (iterations == labels["max_iterations"])
    )
    return float(ok.sum().item()) / float(ok.numel()) if ok.numel() else 0.0


@torch.no_grad()
def evaluate(model: Any, items: list[EncodedExample], *, config: TrainConfig) -> dict[str, Any]:
    model.eval()
    if not items:
        return {
            "count": 0,
            "loss": None,
            "acc_swarm": None,
            "acc_max_candidates": None,
            "acc_max_minutes": None,
            "acc_max_iterations": None,
            "exact_match": None,
        }

    total_loss = 0.0
    total_batches = 0
    acc_swarm = 0.0
    acc_candidates = 0.0
    acc_minutes = 0.0
    acc_iterations = 0.0
    exact = 0.0

    for batch in _batches(items, config.batch_size):
        input_ids, attention_mask, labels = _as_tensor(batch, seq_len=config.seq_len)
        logits = model(input_ids, attention_mask)
        swarm_logits, candidates_logits, minutes_logits, iterations_logits = logits

        loss = (
            torch.nn.functional.cross_entropy(swarm_logits, labels["swarm"])
            + torch.nn.functional.cross_entropy(candidates_logits, labels["max_candidates"])
            + torch.nn.functional.cross_entropy(minutes_logits, labels["max_minutes"])
            + torch.nn.functional.cross_entropy(iterations_logits, labels["max_iterations"])
        )
        total_loss += float(loss.item())
        total_batches += 1

        acc_swarm += _accuracy(swarm_logits, labels["swarm"])
        acc_candidates += _accuracy(candidates_logits, labels["max_candidates"])
        acc_minutes += _accuracy(minutes_logits, labels["max_minutes"])
        acc_iterations += _accuracy(iterations_logits, labels["max_iterations"])
        exact += _exact_match(
            swarm_logits,
            candidates_logits,
            minutes_logits,
            iterations_logits,
            labels,
        )

    denom = float(total_batches) if total_batches else 1.0
    return {
        "count": len(items),
        "loss": total_loss / denom,
        "acc_swarm": acc_swarm / denom,
        "acc_max_candidates": acc_candidates / denom,
        "acc_max_minutes": acc_minutes / denom,
        "acc_max_iterations": acc_iterations / denom,
        "exact_match": exact / denom,
    }


def train_mlp(
    *,
    dataset_path: Path,
    out_dir: Path,
    config: TrainConfig,
) -> dict[str, Any]:
    rows = load_dataset(dataset_path)
    head_vocab = dataset_action_space(rows)
    vocab = build_vocab(rows)
    examples = encode_dataset(rows, vocab=vocab, head_vocab=head_vocab, seq_len=config.seq_len)

    train_items = [ex for ex in examples if ex.split == "train"]
    val_items = [ex for ex in examples if ex.split == "val"]
    test_items = [ex for ex in examples if ex.split == "test"]

    _set_seeds(config.seed)

    head_sizes = HeadSizes(
        swarm=len(head_vocab.swarm_ids),
        max_candidates=len(head_vocab.max_candidates_bins),
        max_minutes=len(head_vocab.max_minutes_bins),
        max_iterations=len(head_vocab.max_iterations_bins),
    )

    model = PlannerMLP(
        vocab_size=len(vocab.tokens),
        seq_len=config.seq_len,
        d_model=config.d_model,
        hidden_dim=config.hidden_dim,
        dropout=config.dropout,
        head_sizes=head_sizes,
    )
    model.train()

    opt = torch.optim.AdamW(
        model.parameters(),
        lr=float(config.lr),
        weight_decay=float(config.weight_decay),
    )

    best_val = math.inf
    best_state: dict[str, Any] | None = None

    for epoch in range(config.epochs):
        random.shuffle(train_items)
        total = 0.0
        n = 0
        for batch in _batches(train_items, config.batch_size):
            input_ids, attention_mask, labels = _as_tensor(batch, seq_len=config.seq_len)
            opt.zero_grad(set_to_none=True)

            swarm_logits, candidates_logits, minutes_logits, iterations_logits = model(
                input_ids, attention_mask
            )
            loss = (
                torch.nn.functional.cross_entropy(swarm_logits, labels["swarm"])
                + torch.nn.functional.cross_entropy(candidates_logits, labels["max_candidates"])
                + torch.nn.functional.cross_entropy(minutes_logits, labels["max_minutes"])
                + torch.nn.functional.cross_entropy(iterations_logits, labels["max_iterations"])
            )
            loss.backward()
            opt.step()

            total += float(loss.item())
            n += 1

        val_metrics = evaluate(model, val_items, config=config)
        val_loss = float(val_metrics["loss"] or 0.0)
        if val_items and val_loss < best_val:
            best_val = val_loss
            best_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}

        # Light progress output (caller prints metrics).
        _ = epoch, total / float(n or 1)

    if best_state is not None:
        model.load_state_dict(best_state)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "vocab.json").write_text(
        json.dumps(vocab.to_dict(), indent=2, sort_keys=True) + "\n"
    )
    (out_dir / "action_space.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.action_space.v1",
                "swarm_ids": list(head_vocab.swarm_ids),
                "max_candidates_bins": list(head_vocab.max_candidates_bins),
                "max_minutes_bins": list(head_vocab.max_minutes_bins),
                "max_iterations_bins": list(head_vocab.max_iterations_bins),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    torch.save(
        {
            "schema_version": "cyntra.planner_checkpoint.v1",
            "model": model.state_dict(),
            "config": config.__dict__,
        },
        out_dir / "checkpoint.pt",
    )

    _export_onnx(model, out_dir / "planner.onnx", seq_len=config.seq_len)
    (out_dir / "calibration.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.planner_calibration.v1",
                "temperatures": {
                    "swarm_id": 1.0,
                    "max_candidates_bin": 1.0,
                    "max_minutes_bin": 1.0,
                    "max_iterations_bin": 1.0,
                },
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )

    metrics = {
        "schema_version": "cyntra.planner_train_report.v1",
        "dataset": str(dataset_path),
        "counts": {"train": len(train_items), "val": len(val_items), "test": len(test_items)},
        "train": evaluate(model, train_items, config=config),
        "val": evaluate(model, val_items, config=config),
        "test": evaluate(model, test_items, config=config),
        "vocab_size": len(vocab.tokens),
        "head_sizes": head_sizes.__dict__,
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n")

    return metrics


def train_transformer(
    *,
    dataset_path: Path,
    out_dir: Path,
    config: TrainConfig,
) -> dict[str, Any]:
    rows = load_dataset(dataset_path)
    vocab = build_vocab(rows)
    head_vocab = dataset_action_space(rows)
    encoded = encode_dataset(rows, vocab=vocab, head_vocab=head_vocab, seq_len=config.seq_len)

    train_items = [e for e in encoded if e.split == "train"]
    val_items = [e for e in encoded if e.split == "val"]
    test_items = [e for e in encoded if e.split == "test"]

    _set_seeds(config.seed)

    head_sizes = HeadSizes(
        swarm=len(head_vocab.swarm_ids),
        max_candidates=len(head_vocab.max_candidates_bins),
        max_minutes=len(head_vocab.max_minutes_bins),
        max_iterations=len(head_vocab.max_iterations_bins),
    )

    model = PlannerTransformer(
        vocab_size=len(vocab.tokens),
        seq_len=config.seq_len,
        d_model=config.d_model,
        n_heads=config.n_heads,
        n_layers=config.n_layers,
        ff_dim=config.hidden_dim,
        dropout=config.dropout,
        head_sizes=head_sizes,
    )
    model.train()

    opt = torch.optim.AdamW(
        model.parameters(),
        lr=float(config.lr),
        weight_decay=float(config.weight_decay),
    )

    best_val = math.inf
    best_state: dict[str, Any] | None = None

    for epoch in range(config.epochs):
        random.shuffle(train_items)
        total = 0.0
        n = 0
        for batch in _batches(train_items, config.batch_size):
            input_ids, attention_mask, labels = _as_tensor(batch, seq_len=config.seq_len)
            opt.zero_grad(set_to_none=True)

            swarm_logits, candidates_logits, minutes_logits, iterations_logits = model(
                input_ids, attention_mask
            )
            loss = (
                torch.nn.functional.cross_entropy(swarm_logits, labels["swarm"])
                + torch.nn.functional.cross_entropy(candidates_logits, labels["max_candidates"])
                + torch.nn.functional.cross_entropy(minutes_logits, labels["max_minutes"])
                + torch.nn.functional.cross_entropy(iterations_logits, labels["max_iterations"])
            )
            loss.backward()
            opt.step()

            total += float(loss.item())
            n += 1

        val_metrics = evaluate(model, val_items, config=config)
        val_loss = float(val_metrics["loss"] or 0.0)
        if val_items and val_loss < best_val:
            best_val = val_loss
            best_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}

        _ = epoch, total / float(n or 1)

    if best_state is not None:
        model.load_state_dict(best_state)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "vocab.json").write_text(
        json.dumps(vocab.to_dict(), indent=2, sort_keys=True) + "\n"
    )
    (out_dir / "action_space.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.action_space.v1",
                "swarm_ids": list(head_vocab.swarm_ids),
                "max_candidates_bins": list(head_vocab.max_candidates_bins),
                "max_minutes_bins": list(head_vocab.max_minutes_bins),
                "max_iterations_bins": list(head_vocab.max_iterations_bins),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    torch.save(
        {
            "schema_version": "cyntra.planner_checkpoint.v1",
            "model": model.state_dict(),
            "config": config.__dict__,
        },
        out_dir / "checkpoint.pt",
    )

    # Export ONNX when possible (keeps kernel inference torch-free).
    onnx_exported = False
    onnx_error: str | None = None
    try:
        _export_onnx(model, out_dir / "planner.onnx", seq_len=config.seq_len)
        onnx_exported = True
    except Exception as exc:
        onnx_error = str(exc)

    (out_dir / "calibration.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.planner_calibration.v1",
                "temperatures": {
                    "swarm_id": 1.0,
                    "max_candidates_bin": 1.0,
                    "max_minutes_bin": 1.0,
                    "max_iterations_bin": 1.0,
                },
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )

    metrics = {
        "schema_version": "cyntra.planner_train_report.v1",
        "dataset": str(dataset_path),
        "counts": {"train": len(train_items), "val": len(val_items), "test": len(test_items)},
        "train": evaluate(model, train_items, config=config),
        "val": evaluate(model, val_items, config=config),
        "test": evaluate(model, test_items, config=config),
        "vocab_size": len(vocab.tokens),
        "head_sizes": head_sizes.__dict__,
        "arch": "transformer",
        "n_layers": config.n_layers,
        "n_heads": config.n_heads,
        "onnx_exported": onnx_exported,
        "onnx_error": onnx_error,
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n")

    return metrics


def train_recurrent(
    *,
    dataset_path: Path,
    out_dir: Path,
    config: TrainConfig,
) -> dict[str, Any]:
    rows = load_dataset(dataset_path)
    vocab = build_vocab(rows)
    head_vocab = dataset_action_space(rows)
    encoded = encode_dataset(rows, vocab=vocab, head_vocab=head_vocab, seq_len=config.seq_len)

    train_items = [e for e in encoded if e.split == "train"]
    val_items = [e for e in encoded if e.split == "val"]
    test_items = [e for e in encoded if e.split == "test"]

    _set_seeds(config.seed)

    head_sizes = HeadSizes(
        swarm=len(head_vocab.swarm_ids),
        max_candidates=len(head_vocab.max_candidates_bins),
        max_minutes=len(head_vocab.max_minutes_bins),
        max_iterations=len(head_vocab.max_iterations_bins),
    )

    model = PlannerRecurrent(
        vocab_size=len(vocab.tokens),
        seq_len=config.seq_len,
        d_model=config.d_model,
        n_layers=config.n_layers,
        dropout=config.dropout,
        head_sizes=head_sizes,
    )
    model.train()

    opt = torch.optim.AdamW(
        model.parameters(),
        lr=float(config.lr),
        weight_decay=float(config.weight_decay),
    )

    best_val = math.inf
    best_state: dict[str, Any] | None = None

    for epoch in range(config.epochs):
        random.shuffle(train_items)
        total = 0.0
        n = 0
        for batch in _batches(train_items, config.batch_size):
            input_ids, attention_mask, labels = _as_tensor(batch, seq_len=config.seq_len)
            opt.zero_grad(set_to_none=True)

            swarm_logits, candidates_logits, minutes_logits, iterations_logits = (
                model.forward_tbptt(
                    input_ids,
                    attention_mask,
                    tbptt_len=config.tbptt_len,
                )
            )
            loss = (
                torch.nn.functional.cross_entropy(swarm_logits, labels["swarm"])
                + torch.nn.functional.cross_entropy(candidates_logits, labels["max_candidates"])
                + torch.nn.functional.cross_entropy(minutes_logits, labels["max_minutes"])
                + torch.nn.functional.cross_entropy(iterations_logits, labels["max_iterations"])
            )
            loss.backward()
            opt.step()

            total += float(loss.item())
            n += 1

        val_metrics = evaluate(model, val_items, config=config)
        val_loss = float(val_metrics["loss"] or 0.0)
        if val_items and val_loss < best_val:
            best_val = val_loss
            best_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}

        _ = epoch, total / float(n or 1)

    if best_state is not None:
        model.load_state_dict(best_state)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "vocab.json").write_text(
        json.dumps(vocab.to_dict(), indent=2, sort_keys=True) + "\n"
    )
    (out_dir / "action_space.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.action_space.v1",
                "swarm_ids": list(head_vocab.swarm_ids),
                "max_candidates_bins": list(head_vocab.max_candidates_bins),
                "max_minutes_bins": list(head_vocab.max_minutes_bins),
                "max_iterations_bins": list(head_vocab.max_iterations_bins),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    torch.save(
        {
            "schema_version": "cyntra.planner_checkpoint.v1",
            "model": model.state_dict(),
            "config": config.__dict__,
        },
        out_dir / "checkpoint.pt",
    )

    onnx_exported = False
    onnx_error: str | None = None
    try:
        _export_onnx(model, out_dir / "planner.onnx", seq_len=config.seq_len)
        onnx_exported = True
    except Exception as exc:
        onnx_error = str(exc)

    (out_dir / "calibration.json").write_text(
        json.dumps(
            {
                "schema_version": "cyntra.planner_calibration.v1",
                "temperatures": {
                    "swarm_id": 1.0,
                    "max_candidates_bin": 1.0,
                    "max_minutes_bin": 1.0,
                    "max_iterations_bin": 1.0,
                },
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )

    metrics = {
        "schema_version": "cyntra.planner_train_report.v1",
        "dataset": str(dataset_path),
        "counts": {"train": len(train_items), "val": len(val_items), "test": len(test_items)},
        "train": evaluate(model, train_items, config=config),
        "val": evaluate(model, val_items, config=config),
        "test": evaluate(model, test_items, config=config),
        "vocab_size": len(vocab.tokens),
        "head_sizes": head_sizes.__dict__,
        "arch": "recurrent",
        "n_layers": config.n_layers,
        "tbptt_len": config.tbptt_len,
        "onnx_exported": onnx_exported,
        "onnx_error": onnx_error,
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n")

    return metrics


def _export_onnx(model: Any, out_path: Path, *, seq_len: int) -> None:
    model.eval()
    dummy_ids = torch.zeros((1, seq_len), dtype=torch.long)
    dummy_mask = torch.ones((1, seq_len), dtype=torch.long)

    torch.onnx.export(
        model,
        (dummy_ids, dummy_mask),
        str(out_path),
        input_names=["input_ids", "attention_mask"],
        output_names=[
            "logits_swarm_id",
            "logits_max_candidates_bin",
            "logits_max_minutes_bin",
            "logits_max_iterations_bin",
        ],
        dynamic_axes={
            "input_ids": {0: "batch"},
            "attention_mask": {0: "batch"},
            "logits_swarm_id": {0: "batch"},
            "logits_max_candidates_bin": {0: "batch"},
            "logits_max_minutes_bin": {0: "batch"},
            "logits_max_iterations_bin": {0: "batch"},
        },
        opset_version=17,
    )
