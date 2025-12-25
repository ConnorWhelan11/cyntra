from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from cyntra.planner.action_space import (
    NA,
    ActionSpace,
    BudgetBin,
    action_space_for_swarms,
)
from cyntra.planner.constants import (
    DK_PRIORITIES,
    DK_RISKS,
    DK_SIZES,
    SCHEMA_PLANNER_INPUT_V1,
)
from cyntra.planner.keywords import extract_keywords
from cyntra.planner.run_summaries import (
    iter_archive_run_summaries,
    iter_world_run_summaries,
)
from cyntra.planner.similar_runs import SimilarRunsQuery, select_similar_runs
from cyntra.planner.time_utils import ms_to_rfc3339
from cyntra.planner.tokenizer import tokenize_planner_input
from cyntra.state.models import Issue

logger = structlog.get_logger()


def _read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists():
        return []
    out: list[dict[str, Any]] = []
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("Failed to read jsonl", path=str(path), error=str(exc))
        return []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            out.append(item)
    return out


def load_issues(beads_dir: Path) -> dict[str, Issue]:
    issues_path = beads_dir / "issues.jsonl"
    issues: dict[str, Issue] = {}
    for row in _read_jsonl(issues_path):
        try:
            issue = Issue.from_dict(row)
        except Exception:
            continue
        if issue.id:
            issues[issue.id] = issue
    return issues


def infer_default_universe_id(repo_root: Path) -> str | None:
    """
    Best-effort local inference of the active universe.

    Preference order:
    1) `.cyntra/universes/<id>/` (single directory) if present.
    2) `universes/<id>/` (single directory) if present.
    """
    cyntra_universes = repo_root / ".cyntra" / "universes"
    if cyntra_universes.exists():
        ids = sorted([p.name for p in cyntra_universes.iterdir() if p.is_dir()])
        if len(ids) == 1:
            return ids[0]

    universes_dir = repo_root / "universes"
    if universes_dir.exists():
        ids = sorted(
            [
                p.name
                for p in universes_dir.iterdir()
                if p.is_dir() and (p / "universe.yaml").exists()
            ]
        )
        if len(ids) == 1:
            return ids[0]

    return None


def load_universe_defaults(repo_root: Path, universe_id: str) -> dict[str, Any]:
    from cyntra.universe import load_universe

    try:
        cfg = load_universe(universe_id, repo_root=repo_root, validate_worlds=False)
    except Exception:
        return {"swarm_id": None, "objective_id": None}

    raw_defaults = cfg.raw.get("defaults") if isinstance(cfg.raw, dict) else None
    if not isinstance(raw_defaults, dict):
        return {"swarm_id": None, "objective_id": None}

    swarm_id = raw_defaults.get("swarm_id")
    objective_id = raw_defaults.get("objective_id")
    return {
        "swarm_id": str(swarm_id) if isinstance(swarm_id, str) and swarm_id else None,
        "objective_id": str(objective_id)
        if isinstance(objective_id, str) and objective_id
        else None,
    }


def load_universe_swarm_ids(repo_root: Path, universe_id: str) -> list[str]:
    from cyntra.universe import load_universe

    try:
        cfg = load_universe(universe_id, repo_root=repo_root, validate_worlds=False)
    except Exception:
        return ["serial_handoff", "speculate_vote"]

    swarms = cfg.swarms
    if not isinstance(swarms, dict):
        return ["serial_handoff", "speculate_vote"]
    swarms_map = swarms.get("swarms")
    if not isinstance(swarms_map, dict):
        return ["serial_handoff", "speculate_vote"]

    swarm_ids = [str(k) for k in swarms_map if isinstance(k, str) and k]
    return sorted(swarm_ids)


def collect_run_summaries(
    *,
    repo_root: Path,
    include_world: bool,
) -> list[dict[str, Any]]:
    archives_dir = repo_root / ".cyntra" / "archives"
    runs_dir = repo_root / ".cyntra" / "runs"

    summaries: list[dict[str, Any]] = []
    summaries.extend(list(iter_archive_run_summaries(archives_dir)))
    if include_world:
        summaries.extend(list(iter_world_run_summaries(runs_dir, repo_root=repo_root)))

    summaries = [s for s in summaries if isinstance(s.get("started_ms"), int)]
    summaries.sort(key=lambda s: (int(s["started_ms"]), str(s.get("run_id") or "")))
    return summaries


def _clamp_enum(value: str, allowed: tuple[str, ...], default: str) -> str:
    return value if value in allowed else default


def _issue_meta(issue: Issue | None, *, issue_id: str, tags: list[str]) -> dict[str, Any]:
    dk_priority = _clamp_enum(issue.dk_priority if issue else "P2", DK_PRIORITIES, "P2")
    dk_risk = _clamp_enum(issue.dk_risk if issue else "medium", DK_RISKS, "medium")
    dk_size = _clamp_enum(issue.dk_size if issue else "M", DK_SIZES, "M")
    dk_tool_hint = issue.dk_tool_hint if issue else None
    dk_attempts = int(issue.dk_attempts) if issue else 0

    meta: dict[str, Any] = {
        "issue_id": issue_id,
        "dk_priority": dk_priority,
        "dk_risk": dk_risk,
        "dk_size": dk_size,
        "dk_tool_hint": dk_tool_hint,
        "dk_attempts": dk_attempts,
        "tags": tags,
    }
    if issue is not None:
        meta["title"] = issue.title
        meta["description"] = issue.description
        meta["keywords"] = extract_keywords(f"{issue.title}\n{issue.description or ''}", max_keywords=16)
    return meta


def _map_to_bin(value: int | None, bins: tuple[BudgetBin, ...]) -> BudgetBin:
    if value is None:
        return NA
    numeric = [b for b in bins if b != NA]
    # Defensive: bins are fixed and numeric.
    candidates = [int(b) for b in numeric if isinstance(b, int)]
    if not candidates:
        return NA
    if value in candidates:
        return value
    # Nearest by absolute error, then lower bin for deterministic tie-break.
    candidates.sort()
    best = min(candidates, key=lambda b: (abs(b - value), b))
    return best


def _label_from_run_summary(run_summary: dict[str, Any], *, action_space: ActionSpace) -> dict[str, Any]:
    action = run_summary.get("action_executed")
    action = action if isinstance(action, dict) else {}

    swarm_id = action.get("swarm_id")
    swarm_id = str(swarm_id) if isinstance(swarm_id, str) and swarm_id else "serial_handoff"
    if swarm_id not in action_space.swarm_ids:
        swarm_id = action_space.swarm_ids[0] if action_space.swarm_ids else "serial_handoff"

    max_candidates = action.get("max_candidates")
    max_minutes = action.get("max_minutes")
    max_iterations = action.get("max_iterations")

    label = {
        "schema_version": "cyntra.planner_action.v1",
        "created_at": ms_to_rfc3339(int(run_summary["started_ms"])),
        "swarm_id": swarm_id,
        "budgets": {
            "max_candidates_bin": _map_to_bin(
                int(max_candidates) if isinstance(max_candidates, int) else None,
                action_space.max_candidates_bins,
            ),
            "max_minutes_bin": _map_to_bin(
                int(max_minutes) if isinstance(max_minutes, int) else None,
                action_space.max_minutes_bins,
            ),
            "max_iterations_bin": _map_to_bin(
                int(max_iterations) if isinstance(max_iterations, int) else None,
                action_space.max_iterations_bins,
            ),
        },
        "model": {"checkpoint_id": "executed_plan"},
        "confidence": 1.0,
        "abstain_to_default": False,
        "reason": None,
    }
    return label


def _canonical_json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def hash_planner_input(planner_input: dict[str, Any]) -> str:
    """
    Deterministic hash of a normalized planner input.

    Excludes `created_at` to keep the hash stable across re-materialization.
    """
    normalized = dict(planner_input)
    normalized.pop("created_at", None)
    payload = _canonical_json(normalized).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_planner_input(
    *,
    run_summary: dict[str, Any],
    history_candidates: list[dict[str, Any]],
    action_space: ActionSpace,
    universe_id: str,
    universe_defaults: dict[str, Any],
    issue: Issue | None,
    n_similar: int,
) -> dict[str, Any]:
    started_ms = int(run_summary["started_ms"])
    job_type = str(run_summary.get("job_type") or "code")

    issue_id = str(run_summary.get("issue_id") or run_summary.get("run_id") or "unknown")
    tags = issue.tags if issue else []
    if not tags:
        tags_value = run_summary.get("tags")
        if isinstance(tags_value, list):
            tags = [str(t) for t in tags_value if isinstance(t, str) and t]
        else:
            tags = []

    query = SimilarRunsQuery(
        job_type=job_type,
        started_ms=started_ms,
        tags=tags,
        world_id=str(run_summary.get("world_id")) if run_summary.get("world_id") else None,
        objective_id=str(run_summary.get("objective_id")) if run_summary.get("objective_id") else None,
    )
    similar = select_similar_runs(query, history_candidates, n=n_similar)

    planner_input: dict[str, Any] = {
        "schema_version": SCHEMA_PLANNER_INPUT_V1,
        "created_at": ms_to_rfc3339(started_ms),
        "universe_id": universe_id,
        "job_type": job_type,
        "universe_defaults": universe_defaults,
        "issue": _issue_meta(issue, issue_id=issue_id, tags=tags),
        "history": {"last_n_similar_runs": similar},
        "action_space": action_space.to_dict(),
        "system_state": None,
    }

    return planner_input


@dataclass(frozen=True)
class DatasetSplitCounts:
    train: int
    val: int
    test: int


def _split_counts(n: int) -> DatasetSplitCounts:
    train = int(n * 0.8)
    val = int(n * 0.1)
    test = max(0, n - train - val)
    return DatasetSplitCounts(train=train, val=val, test=test)


def build_dataset_examples(
    *,
    repo_root: Path,
    run_summaries: list[dict[str, Any]],
    issues: dict[str, Issue],
    universe_id: str,
    include_world: bool,
    n_similar: int = 8,
) -> list[dict[str, Any]]:
    swarm_ids = load_universe_swarm_ids(repo_root, universe_id) if universe_id else ["serial_handoff", "speculate_vote"]
    action_space = action_space_for_swarms(swarm_ids)
    universe_defaults = load_universe_defaults(repo_root, universe_id) if universe_id else {"swarm_id": None, "objective_id": None}

    examples: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []

    for summary in run_summaries:
        job_type = str(summary.get("job_type") or "code")
        if job_type == "fab-world" and not include_world:
            history.append(summary)
            continue

        issue_id = str(summary.get("issue_id") or "")
        issue = issues.get(issue_id) if issue_id else None

        planner_input = build_planner_input(
            run_summary=summary,
            history_candidates=history,
            action_space=action_space,
            universe_id=universe_id or "unknown",
            universe_defaults=universe_defaults,
            issue=issue,
            n_similar=n_similar,
        )
        tokens = tokenize_planner_input(planner_input, max_similar_runs=n_similar)
        input_hash = hash_planner_input(planner_input)

        label = _label_from_run_summary(summary, action_space=action_space)
        label["input_hash"] = input_hash

        examples.append(
            {
                "run_id": str(summary.get("run_id") or ""),
                "started_ms": int(summary["started_ms"]),
                "planner_input": planner_input,
                "tokens": tokens,
                "label_action": label,
            }
        )

        history.append(summary)

    examples.sort(key=lambda e: (int(e["started_ms"]), str(e.get("run_id") or "")))
    return examples


def dataset_hash(examples: list[dict[str, Any]]) -> str:
    hasher = hashlib.sha256()
    for ex in examples:
        hasher.update((_canonical_json(ex) + "\n").encode("utf-8"))
    return hasher.hexdigest()


def write_dataset(out_dir: Path, examples: list[dict[str, Any]], *, meta: dict[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = out_dir / "dataset.jsonl"
    with open(dataset_path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False, sort_keys=True) + "\n")

    meta_path = out_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def build_and_write_dataset(
    *,
    repo_root: Path,
    out_dir: Path,
    include_world: bool = True,
    n_similar: int = 8,
    universe_id: str | None = None,
) -> dict[str, Any]:
    universe_id = universe_id or infer_default_universe_id(repo_root) or "unknown"

    issues = load_issues(repo_root / ".beads")
    summaries = collect_run_summaries(repo_root=repo_root, include_world=include_world)

    examples = build_dataset_examples(
        repo_root=repo_root,
        run_summaries=summaries,
        issues=issues,
        universe_id=universe_id,
        include_world=include_world,
        n_similar=n_similar,
    )

    counts = _split_counts(len(examples))

    # Time-based splits (already ordered by started_ms asc).
    splits: list[str] = ["train"] * counts.train + ["val"] * counts.val + ["test"] * counts.test
    splits = splits[: len(examples)]
    for ex, split in zip(examples, splits, strict=False):
        ex["split"] = split
    h = dataset_hash(examples)

    meta = {
        "schema_version": "cyntra.planner_dataset.v1",
        "dataset_hash": h,
        "example_count": len(examples),
        "split_counts": {"train": counts.train, "val": counts.val, "test": counts.test},
        "include_world": include_world,
        "n_similar_runs": n_similar,
        "universe_id": universe_id,
    }

    write_dataset(out_dir, examples, meta=meta)
    return meta
