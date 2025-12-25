from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from cyntra.planner.time_utils import parse_rfc3339_to_ms
from cyntra.planner.tokenizer import tokenize_planner_input

logger = structlog.get_logger()


def _canonical_json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _read_json(path: Path) -> dict[str, Any] | list[Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to read JSON", path=str(path), error=str(exc))
        return None


def resolve_bench_run_dir(path: Path) -> Path | None:
    """
    Resolve a best-of-K bench run directory.

    Accepts either:
    - a specific `run_*/` directory containing `bench_report.json`, or
    - the base bench directory containing `run_*/` subdirs (returns latest by name).
    """
    path = path.resolve()
    if (path / "bench_report.json").exists():
        return path

    if not path.exists() or not path.is_dir():
        return None

    run_dirs = sorted([p for p in path.iterdir() if p.is_dir() and p.name.startswith("run_")])
    if not run_dirs:
        return None

    latest = run_dirs[-1]
    if (latest / "bench_report.json").exists():
        return latest
    return None


def dataset_hash(rows: list[dict[str, Any]]) -> str:
    hasher = hashlib.sha256()
    for row in rows:
        hasher.update((_canonical_json(row) + "\n").encode("utf-8"))
    return hasher.hexdigest()


@dataclass(frozen=True)
class SplitCounts:
    train: int
    val: int
    test: int


def _split_counts(n: int) -> SplitCounts:
    train = int(n * 0.8)
    val = int(n * 0.1)
    test = max(0, n - train - val)
    return SplitCounts(train=train, val=val, test=test)


def build_outcome_dataset_rows(bench_run_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    bench_run_dir = bench_run_dir.resolve()
    results_path = bench_run_dir / "results" / "best_of_k.json"
    records = _read_json(results_path)
    if not isinstance(records, list):
        raise ValueError(f"Invalid best-of-k results at {results_path}")

    report = _read_json(bench_run_dir / "bench_report.json")
    bench_report: dict[str, Any] = report if isinstance(report, dict) else {}

    rows: list[dict[str, Any]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        if record.get("skipped") is True:
            continue

        winner = record.get("winner")
        if not isinstance(winner, dict):
            continue
        workcell_id = winner.get("workcell_id")
        if not isinstance(workcell_id, str) or not workcell_id:
            continue

        archive_dir = bench_run_dir / "archives" / workcell_id
        manifest = _read_json(archive_dir / "manifest.json")
        if not isinstance(manifest, dict):
            continue
        planner = manifest.get("planner")
        if not isinstance(planner, dict):
            continue
        planner_input = planner.get("planner_input")
        label_action = planner.get("planner_action")
        executed_plan = planner.get("executed_plan")
        if not isinstance(planner_input, dict) or not isinstance(label_action, dict):
            continue

        created_at = planner_input.get("created_at")
        started_ms = None
        if isinstance(created_at, str):
            started_ms = parse_rfc3339_to_ms(created_at)
        if started_ms is None:
            started_ms = int(archive_dir.stat().st_mtime * 1000)

        tokens = tokenize_planner_input(planner_input)

        rows.append(
            {
                "bench_config_hash": record.get("bench_config_hash"),
                "issue_id": record.get("issue_id"),
                "title": record.get("title"),
                "job_type": record.get("job_type"),
                "run_id": workcell_id,
                "started_ms": started_ms,
                "planner_input": planner_input,
                "tokens": tokens,
                "label_action": label_action,
                "executed_plan": executed_plan,
                "bench": {
                    "bench_run_dir": str(bench_run_dir),
                    "winner": winner,
                    "candidates": record.get("candidates", []),
                },
            }
        )

    rows.sort(key=lambda r: (int(r.get("started_ms") or 0), str(r.get("run_id") or "")))

    counts = _split_counts(len(rows))
    splits: list[str] = ["train"] * counts.train + ["val"] * counts.val + ["test"] * counts.test
    splits = splits[: len(rows)]
    for row, split in zip(rows, splits, strict=False):
        row["split"] = split

    meta = {
        "schema_version": "cyntra.planner_outcome_dataset.v1",
        "bench_run_dir": str(bench_run_dir),
        "bench_config_hash": bench_report.get("bench_config_hash"),
        "example_count": len(rows),
        "split_counts": {"train": counts.train, "val": counts.val, "test": counts.test},
    }

    meta["dataset_hash"] = dataset_hash(rows)
    return rows, meta


def write_outcome_dataset(out_dir: Path, rows: list[dict[str, Any]], *, meta: dict[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = out_dir / "dataset.jsonl"
    with open(dataset_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=True) + "\n")

