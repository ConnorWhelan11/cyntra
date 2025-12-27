"""
Prompt genome selection helpers.

This selects a prompt genome ID for a given (domain, toolchain) pair by consulting
`prompts/frontier.json` when present.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


def _as_objectives(frontier: Any) -> dict[str, str]:
    if not isinstance(frontier, dict):
        return {}
    raw = frontier.get("objectives")
    if not isinstance(raw, dict):
        return {}
    objectives: dict[str, str] = {}
    for key, direction in raw.items():
        if not isinstance(key, str):
            continue
        direction_s = str(direction).strip().lower()
        if direction_s not in ("max", "min"):
            continue
        objectives[key] = direction_s
    return objectives


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _iter_frontier_genome_ids(frontier: Any) -> list[str]:
    if isinstance(frontier, dict):
        items = frontier.get("items") or []
        if isinstance(items, list):
            ids: list[str] = []
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("genome_id"), str):
                    ids.append(item["genome_id"])
                elif isinstance(item, str):
                    ids.append(item)
            return ids
    if isinstance(frontier, list):
        return [
            str(item) for item in frontier if isinstance(item, (str, int)) and str(item).strip()
        ]
    return []


def select_prompt_genome_id(
    *,
    repo_root: Path,
    domain: str,
    toolchain: str,
) -> str | None:
    prompts_root = repo_root / "prompts"
    frontier_path = prompts_root / "frontier.json"
    if not frontier_path.exists():
        return None

    try:
        frontier = json.loads(frontier_path.read_text())
    except Exception as exc:  # noqa: BLE001 - best-effort
        logger.warning("Failed to read prompts frontier", path=str(frontier_path), error=str(exc))
        return None

    items = frontier.get("items") if isinstance(frontier, dict) else None
    objectives = _as_objectives(frontier)

    # If objectives are available and items include metrics, pick the best scalarized tradeoff.
    if objectives and isinstance(items, list) and any(isinstance(i, dict) for i in items):
        candidates: list[tuple[str, dict[str, Any]]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            genome_id = item.get("genome_id")
            if not isinstance(genome_id, str) or not genome_id.strip():
                continue
            candidate = genome_id.strip()
            genome_path = prompts_root / domain / toolchain / f"{candidate}.yaml"
            if not genome_path.exists():
                continue
            candidates.append((candidate, item))

        if candidates:
            stats: dict[str, tuple[float, float]] = {}
            for key in objectives:
                values = []
                for _, item in candidates:
                    v = _as_float(item.get(key))
                    if v is not None:
                        values.append(v)
                if values:
                    stats[key] = (min(values), max(values))

            def score(item: dict[str, Any]) -> float:
                if not stats:
                    return 0.0
                total = 0.0
                denom = 0
                for key, direction in objectives.items():
                    if key not in stats:
                        continue
                    v = _as_float(item.get(key))
                    if v is None:
                        total += 0.0
                        denom += 1
                        continue
                    lo, hi = stats[key]
                    norm = 0.0 if hi == lo else (v - lo) / (hi - lo)
                    if direction == "min":
                        norm = 1.0 - norm
                    total += float(norm)
                    denom += 1
                return total / denom if denom else 0.0

            best = max(candidates, key=lambda pair: (score(pair[1]), pair[0]))
            return best[0]

    # Fallback: first genome ID in the frontier that exists for this domain/toolchain.
    for genome_id in _iter_frontier_genome_ids(frontier):
        candidate = genome_id.strip()
        if not candidate:
            continue
        genome_path = prompts_root / domain / toolchain / f"{candidate}.yaml"
        if genome_path.exists():
            return candidate

    return None
