from __future__ import annotations

import random

from cyntra.planner.action_space import ActionTuple


def select_candidate_actions(
    actions: list[ActionTuple],
    *,
    k: int,
    seed: int,
    baseline: ActionTuple | None = None,
) -> list[ActionTuple]:
    """
    Deterministically select K candidate actions from `VALID_ACTIONS`.

    Heuristic:
    - Always include `baseline` when provided (if valid).
    - Prefer at least one opposite-swarm candidate when available.
    - Fill remainder via seeded shuffle.
    """
    if k <= 0:
        return []
    if not actions:
        return []

    pool = list(actions)
    chosen: list[ActionTuple] = []
    seen: set[ActionTuple] = set()

    def _add(a: ActionTuple) -> None:
        if a in seen:
            return
        seen.add(a)
        chosen.append(a)

    if baseline is not None and baseline in pool:
        _add(baseline)

    # Ensure a topology alternative when possible.
    if len(chosen) < k and chosen:
        target_swarm = "speculate_vote" if chosen[0][0] != "speculate_vote" else "serial_handoff"
        alt = next((a for a in pool if a[0] == target_swarm), None)
        if alt is not None:
            _add(alt)

    rng = random.Random(seed)
    remaining = [a for a in pool if a not in seen]
    rng.shuffle(remaining)
    for a in remaining:
        if len(chosen) >= k:
            break
        _add(a)

    return chosen[:k]

