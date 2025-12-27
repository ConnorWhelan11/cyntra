from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any, Literal

NA: Literal["NA"] = "NA"
BudgetBin = int | Literal["NA"]


DEFAULT_MAX_CANDIDATES_BINS: tuple[BudgetBin, ...] = (1, 2, 3, NA)
DEFAULT_MAX_MINUTES_BINS: tuple[BudgetBin, ...] = (15, 30, 45, 60, 120, NA)
DEFAULT_MAX_ITERATIONS_BINS: tuple[BudgetBin, ...] = (1, 2, 3, 5, NA)


@dataclass(frozen=True)
class ActionSpace:
    swarm_ids: tuple[str, ...]
    max_candidates_bins: tuple[BudgetBin, ...] = DEFAULT_MAX_CANDIDATES_BINS
    max_minutes_bins: tuple[BudgetBin, ...] = DEFAULT_MAX_MINUTES_BINS
    max_iterations_bins: tuple[BudgetBin, ...] = DEFAULT_MAX_ITERATIONS_BINS

    def to_dict(self) -> dict[str, Any]:
        return {
            "swarm_ids": list(self.swarm_ids),
            "max_minutes_bins": list(self.max_minutes_bins),
            "max_candidates_bins": list(self.max_candidates_bins),
            "max_iterations_bins": list(self.max_iterations_bins),
            "validity_rules": validity_rules_v1(),
        }


def validity_rules_v1() -> list[dict[str, Any]]:
    return [
        {
            "description": "If swarm_id=serial_handoff, then max_candidates_bin=1.",
            "if": {"swarm_id": "serial_handoff"},
            "then": {"max_candidates_bin": 1},
        },
        {
            "description": 'If job_type="code", then max_iterations_bin="NA".',
            "if": {"job_type": "code"},
            "then": {"max_iterations_bin": NA},
        },
        {
            "description": 'If job_type="fab-world", then max_candidates_bin!="NA".',
            "if": {"job_type": "fab-world"},
            "then": {"max_candidates_bin_not": NA},
        },
    ]


def _as_tuple(items: Iterable[str]) -> tuple[str, ...]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        if not item:
            continue
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return tuple(out)


def action_space_for_swarms(swarm_ids: Sequence[str]) -> ActionSpace:
    return ActionSpace(swarm_ids=_as_tuple(swarm_ids))


def is_valid_action(
    *,
    job_type: str,
    swarm_id: str,
    max_candidates_bin: BudgetBin,
    max_minutes_bin: BudgetBin,
    max_iterations_bin: BudgetBin,
) -> bool:
    # Swarm-specific validity.
    if swarm_id == "serial_handoff" and max_candidates_bin != 1:
        return False

    # Job-type validity.
    if job_type == "code" and max_iterations_bin != NA:
        return False
    if job_type == "fab-world" and max_candidates_bin == NA:
        return False

    # Ensure bins are enforceable in principle (NA is always allowed unless disallowed above).
    if max_candidates_bin != NA and max_candidates_bin < 1:
        return False
    if max_minutes_bin != NA and max_minutes_bin < 1:
        return False
    return not (max_iterations_bin != NA and max_iterations_bin < 1)


ActionTuple = tuple[str, BudgetBin, BudgetBin, BudgetBin]


def _bin_sort_key(value: BudgetBin) -> tuple[int, int]:
    if value == NA:
        return (1, 0)
    return (0, int(value))


def valid_actions(job_type: str, action_space: ActionSpace) -> list[ActionTuple]:
    actions: list[ActionTuple] = []
    for swarm_id in action_space.swarm_ids:
        for max_candidates_bin in action_space.max_candidates_bins:
            for max_minutes_bin in action_space.max_minutes_bins:
                for max_iterations_bin in action_space.max_iterations_bins:
                    if not is_valid_action(
                        job_type=job_type,
                        swarm_id=swarm_id,
                        max_candidates_bin=max_candidates_bin,
                        max_minutes_bin=max_minutes_bin,
                        max_iterations_bin=max_iterations_bin,
                    ):
                        continue
                    actions.append(
                        (swarm_id, max_candidates_bin, max_minutes_bin, max_iterations_bin)
                    )
    actions.sort(
        key=lambda a: (
            a[0],
            _bin_sort_key(a[1]),
            _bin_sort_key(a[2]),
            _bin_sort_key(a[3]),
        )
    )
    return actions
