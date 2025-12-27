from __future__ import annotations

import json
import math
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cyntra.planner.action_space import NA, BudgetBin

ActionTuple = tuple[str, BudgetBin, BudgetBin, BudgetBin]


def _as_bin(value: Any) -> BudgetBin:
    if value == NA:
        return NA
    if isinstance(value, int):
        return int(value)
    if isinstance(value, str) and value.strip().upper() == "NA":
        return NA
    return NA


def action_tuple(action: dict[str, Any]) -> ActionTuple | None:
    swarm_id = action.get("swarm_id")
    if not isinstance(swarm_id, str) or not swarm_id:
        return None
    budgets = action.get("budgets")
    budgets = budgets if isinstance(budgets, dict) else {}
    return (
        swarm_id,
        _as_bin(budgets.get("max_candidates_bin")),
        _as_bin(budgets.get("max_minutes_bin")),
        _as_bin(budgets.get("max_iterations_bin")),
    )


def load_dataset_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            rows.append(item)
    return rows


@dataclass(frozen=True)
class Metrics:
    count: int
    acc_swarm: float
    acc_max_candidates: float
    acc_max_minutes: float
    acc_max_iterations: float
    exact_match: float
    swarm_entropy: float
    swarm_top1_freq: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "count": self.count,
            "acc_swarm": self.acc_swarm,
            "acc_max_candidates": self.acc_max_candidates,
            "acc_max_minutes": self.acc_max_minutes,
            "acc_max_iterations": self.acc_max_iterations,
            "exact_match": self.exact_match,
            "swarm_entropy": self.swarm_entropy,
            "swarm_top1_freq": self.swarm_top1_freq,
        }


def _entropy(counts: dict[str, int]) -> float:
    total = sum(counts.values())
    if total <= 0:
        return 0.0
    h = 0.0
    for c in counts.values():
        p = float(c) / float(total)
        if p > 0:
            h -= p * math.log(p + 1e-12)
    return h


def evaluate_predictions(
    pairs: Iterable[tuple[ActionTuple, ActionTuple]],
) -> Metrics:
    total = 0
    ok_swarm = 0
    ok_candidates = 0
    ok_minutes = 0
    ok_iterations = 0
    ok_exact = 0
    swarm_counts: dict[str, int] = {}

    for pred, gold in pairs:
        total += 1
        swarm_counts[pred[0]] = swarm_counts.get(pred[0], 0) + 1
        if pred[0] == gold[0]:
            ok_swarm += 1
        if pred[1] == gold[1]:
            ok_candidates += 1
        if pred[2] == gold[2]:
            ok_minutes += 1
        if pred[3] == gold[3]:
            ok_iterations += 1
        if pred == gold:
            ok_exact += 1

    denom = float(total) if total else 1.0
    top1 = max(swarm_counts.values()) / denom if swarm_counts else 0.0

    return Metrics(
        count=total,
        acc_swarm=float(ok_swarm) / denom,
        acc_max_candidates=float(ok_candidates) / denom,
        acc_max_minutes=float(ok_minutes) / denom,
        acc_max_iterations=float(ok_iterations) / denom,
        exact_match=float(ok_exact) / denom,
        swarm_entropy=_entropy(swarm_counts),
        swarm_top1_freq=float(top1),
    )
