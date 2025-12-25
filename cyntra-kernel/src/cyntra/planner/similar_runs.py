from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _as_str_set(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {str(v) for v in value if isinstance(v, str) and v}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def _recency_bucket(age_days: float) -> int:
    if age_days < 1:
        return 0
    if age_days < 7:
        return 1
    if age_days < 30:
        return 2
    return 3


def _recency_score(age_days: float) -> float:
    bucket = _recency_bucket(age_days)
    return 1.0 / (1.0 + float(bucket))


def _failure_signals(run_summary: dict[str, Any]) -> set[str]:
    outcome = run_summary.get("outcome") if isinstance(run_summary.get("outcome"), dict) else {}
    fail_codes = outcome.get("fail_codes")
    signals: set[str] = set()
    if isinstance(fail_codes, list):
        signals |= {str(c) for c in fail_codes if isinstance(c, str) and c}

    gates = outcome.get("gates")
    if isinstance(gates, list):
        for gate in gates:
            if not isinstance(gate, dict):
                continue
            name = gate.get("name")
            if isinstance(name, str) and name:
                signals.add(f"gate:{name}")
    return signals


@dataclass(frozen=True)
class SimilarRunsQuery:
    job_type: str
    started_ms: int
    tags: list[str]
    world_id: str | None = None
    objective_id: str | None = None


def select_similar_runs(
    query: SimilarRunsQuery,
    candidates: list[dict[str, Any]],
    *,
    n: int = 8,
) -> list[dict[str, Any]]:
    """
    Deterministically select up to N similar run summaries.

    Selection is score-based (tag overlap, failure-signal overlap, recency), with stable tie-breaks.
    Returned runs are ordered by `started_ms` descending (most recent first).
    """
    if n <= 0:
        return []

    query_tags = set(query.tags)
    query_fail = set()

    filtered: list[dict[str, Any]] = []
    for run in candidates:
        started_ms = run.get("started_ms")
        if not isinstance(started_ms, int):
            continue
        # Leakage control (caller should already filter, but keep it safe).
        if started_ms >= query.started_ms:
            continue

        job_type = run.get("job_type")
        if job_type != query.job_type:
            continue

        # World-specific constraints.
        if query.job_type == "fab-world":
            if query.world_id and run.get("world_id") != query.world_id:
                continue
            if query.objective_id and run.get("objective_id") != query.objective_id:
                continue

        filtered.append(run)

    scored: list[tuple[float, int, str, dict[str, Any]]] = []
    for run in filtered:
        started_ms = int(run.get("started_ms"))
        run_id = str(run.get("run_id") or "")
        tags = _as_str_set(run.get("tags"))
        tag_score = _jaccard(query_tags, tags)
        fail_score = _jaccard(query_fail, _failure_signals(run))

        age_days = float(query.started_ms - started_ms) / (1000.0 * 60.0 * 60.0 * 24.0)
        recency = _recency_score(age_days)

        score = (0.6 * tag_score) + (0.3 * fail_score) + (0.1 * recency)
        scored.append((score, started_ms, run_id, run))

    # Select top-N deterministically.
    scored.sort(key=lambda x: (-x[0], -x[1], x[2]))
    top = [r for _, _, _, r in scored[:n]]

    # Output order: most recent first for token sequence layout.
    top.sort(key=lambda r: (-int(r.get("started_ms")), str(r.get("run_id") or "")))
    return top

