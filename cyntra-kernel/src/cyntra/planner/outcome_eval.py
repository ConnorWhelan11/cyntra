from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cyntra.planner.action_space import ActionTuple
from cyntra.planner.inference import OnnxPlanner


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
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


def _as_action_tuple(value: Any) -> ActionTuple | None:
    if isinstance(value, (list, tuple)) and len(value) == 4:
        swarm_id = value[0]
        if not isinstance(swarm_id, str) or not swarm_id:
            return None
        return (swarm_id, value[1], value[2], value[3])  # type: ignore[return-value]
    return None


def _duration_ms(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _cost_usd(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _objective(candidate: dict[str, Any]) -> tuple[int, int, float, str]:
    verified = bool(candidate.get("verified", False))
    duration = _duration_ms(candidate.get("duration_ms"))
    cost = _cost_usd(candidate.get("cost_usd"))
    action = _as_action_tuple(candidate.get("action"))
    action_key = json.dumps(action, sort_keys=True) if action is not None else ""

    return (
        0 if verified else 1,
        duration if duration is not None else 2**31 - 1,
        cost if cost is not None else 1e9,
        action_key,
    )


def _fail_penalty_ms(candidates: list[dict[str, Any]]) -> int:
    durations = [_duration_ms(c.get("duration_ms")) for c in candidates]
    max_duration = max((d for d in durations if d is not None), default=None)
    if max_duration is None:
        return 2**31 - 1
    return int(max_duration) + 1


@dataclass(frozen=True)
class OutcomeEvalMetrics:
    examples: int
    pass_rate: float
    mean_time_to_pass_ms: float | None
    duration_per_pass_ms: float | None
    cost_per_pass_usd: float | None
    oracle_match_rate: float | None
    mean_regret_ms: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "examples": self.examples,
            "pass_rate": self.pass_rate,
            "mean_time_to_pass_ms": self.mean_time_to_pass_ms,
            "duration_per_pass_ms": self.duration_per_pass_ms,
            "cost_per_pass_usd": self.cost_per_pass_usd,
            "oracle_match_rate": self.oracle_match_rate,
            "mean_regret_ms": self.mean_regret_ms,
        }


def _score_policy(
    rows: list[dict[str, Any]],
    *,
    planner: OnnxPlanner | None,
) -> dict[str, Any]:
    used = 0
    oracle_matches = 0
    oracle_comparable = 0

    passed = 0
    total_duration = 0
    total_cost = 0.0
    passing_durations: list[int] = []

    regrets: list[int] = []

    for row in rows:
        bench = row.get("bench")
        if not isinstance(bench, dict):
            continue
        candidates = bench.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            continue
        candidates = [c for c in candidates if isinstance(c, dict)]
        if not candidates:
            continue

        used += 1
        oracle = min(candidates, key=_objective)
        oracle_action = _as_action_tuple(oracle.get("action"))

        # Baseline selection: first candidate (bench sampler places baseline first when present).
        chosen = candidates[0]
        chosen_action = _as_action_tuple(chosen.get("action"))

        if planner is not None:
            planner_input = row.get("planner_input")
            if isinstance(planner_input, dict):
                action_tuples: list[ActionTuple] = []
                index_by_action: dict[ActionTuple, int] = {}
                for idx, candidate in enumerate(candidates):
                    action = _as_action_tuple(candidate.get("action"))
                    if action is None:
                        continue
                    index_by_action[action] = idx
                    action_tuples.append(action)
                if action_tuples:
                    best_action = planner.select_best_action(planner_input, action_tuples)
                    if best_action in index_by_action:
                        chosen = candidates[index_by_action[best_action]]
                        chosen_action = best_action

        if oracle_action is not None and chosen_action is not None:
            oracle_comparable += 1
            if oracle_action == chosen_action:
                oracle_matches += 1

        verified = bool(chosen.get("verified", False))
        duration_ms = _duration_ms(chosen.get("duration_ms"))
        cost_usd = _cost_usd(chosen.get("cost_usd"))
        if duration_ms is not None:
            total_duration += duration_ms
        if cost_usd is not None:
            total_cost += cost_usd
        if verified:
            passed += 1
            if duration_ms is not None:
                passing_durations.append(duration_ms)

        # Regret: only defined when the oracle passes.
        oracle_verified = bool(oracle.get("verified", False))
        oracle_duration = _duration_ms(oracle.get("duration_ms"))
        if oracle_verified and oracle_duration is not None:
            penalty = _fail_penalty_ms(candidates)
            selected_duration = duration_ms if verified and duration_ms is not None else penalty
            regrets.append(int(selected_duration - oracle_duration))

    examples = used
    pass_rate = float(passed) / float(examples) if examples else 0.0
    mean_time_to_pass_ms = (
        float(sum(passing_durations)) / float(len(passing_durations)) if passing_durations else None
    )
    duration_per_pass_ms = float(total_duration) / float(passed) if passed else None
    cost_per_pass_usd = float(total_cost) / float(passed) if passed else None
    oracle_match_rate = float(oracle_matches) / float(oracle_comparable) if oracle_comparable else None
    mean_regret_ms = float(sum(regrets)) / float(len(regrets)) if regrets else None

    return OutcomeEvalMetrics(
        examples=examples,
        pass_rate=pass_rate,
        mean_time_to_pass_ms=mean_time_to_pass_ms,
        duration_per_pass_ms=duration_per_pass_ms,
        cost_per_pass_usd=cost_per_pass_usd,
        oracle_match_rate=oracle_match_rate,
        mean_regret_ms=mean_regret_ms,
    ).to_dict()


def evaluate_outcome_dataset(
    *,
    dataset_path: Path,
    bundle_dir: Path | None,
) -> dict[str, Any]:
    rows = _read_jsonl(dataset_path)
    rows = [r for r in rows if isinstance(r.get("bench"), dict)]

    planner = OnnxPlanner(bundle_dir) if bundle_dir is not None else None

    report: dict[str, Any] = {
        "schema_version": "cyntra.planner_outcome_eval.v1",
        "dataset": str(dataset_path),
        "examples": len(rows),
        "baseline": _score_policy(rows, planner=None),
    }
    if planner is not None:
        report["onnx_bundle"] = str(bundle_dir)
        report["model"] = _score_policy(rows, planner=planner)
    return report
