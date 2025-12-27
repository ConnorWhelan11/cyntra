#!/usr/bin/env python3
"""
Pareto Frontier Updater Skill

Maintain non-dominated set across quality/cost/determinism objectives.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[5]
kernel_src = repo_root / "kernel" / "src"
if kernel_src.exists():
    sys.path.insert(0, str(kernel_src))


def execute(
    frontier_path: str | Path,
    new_genomes: list[dict[str, Any]],
    objectives: list[str] | None = None,
) -> dict[str, Any]:
    """
    Update Pareto frontier with new genomes.

    Args:
        frontier_path: Path to current frontier.json
        new_genomes: New genome evaluation results
        objectives: Objectives to optimize

    Returns:
        {
            "frontier_path": str,
            "added": [...],
            "removed": [...],
            "frontier_size": int
        }
    """
    frontier_path = Path(frontier_path)

    def _utc_now() -> str:
        return datetime.now(UTC).isoformat().replace("+00:00", "Z")

    def _guess_direction(metric: str) -> str:
        m = metric.strip().lower()
        if not m:
            return "max"
        if m in {"cost", "latency", "duration", "duration_ms", "runtime", "runtime_ms"}:
            return "min"
        if m.endswith("_ms") or m.endswith("_seconds") or m.endswith("_secs"):
            return "min"
        if "cost" in m or "latency" in m:
            return "min"
        return "max"

    def _parse_objectives(raw: object) -> dict[str, str]:
        if isinstance(raw, dict):
            directions: dict[str, str] = {}
            for key, direction in raw.items():
                if not isinstance(key, str) or not key.strip():
                    continue
                direction_s = str(direction).strip().lower()
                if direction_s not in {"max", "min"}:
                    direction_s = _guess_direction(key)
                directions[key.strip()] = direction_s
            return directions

        directions = {}
        if isinstance(raw, list):
            for item in raw:
                if not isinstance(item, str) or not item.strip():
                    continue
                text = item.strip()
                if ":" in text:
                    key, direction = text.split(":", 1)
                    key = key.strip()
                    direction = direction.strip().lower()
                    if key and direction in {"max", "min"}:
                        directions[key] = direction
                        continue
                    if key:
                        directions[key] = _guess_direction(key)
                        continue
                directions[text] = _guess_direction(text)
        return directions

    if objectives is None:
        objectives = ["quality", "cost", "determinism"]

    # Load existing frontier or create new
    existing_objectives: object = objectives
    if frontier_path.exists():
        try:
            frontier_data = json.loads(frontier_path.read_text())
            existing_objectives = frontier_data.get("objectives") or objectives
            if isinstance(frontier_data.get("items"), list):
                current_frontier = frontier_data.get("items", [])
            else:
                current_frontier = frontier_data.get("genomes", [])
        except (json.JSONDecodeError, OSError):
            current_frontier = []
    else:
        current_frontier = []

    try:
        from cyntra.evolve.pareto import pareto_frontier

        objective_directions = _parse_objectives(existing_objectives)

        existing_items = [item for item in (current_frontier or []) if isinstance(item, dict)]
        incoming_items = [item for item in (new_genomes or []) if isinstance(item, dict)]
        all_items = [*existing_items, *incoming_items]

        updated_frontier = pareto_frontier(all_items, objective_directions)
        updated_frontier.sort(
            key=lambda item: str(item.get("genome_id") or item.get("run_id") or "")
        )

        old_ids = {
            str(item.get("genome_id") or item.get("run_id"))
            for item in existing_items
            if isinstance(item.get("genome_id") or item.get("run_id"), str)
        }
        new_ids = {
            str(item.get("genome_id") or item.get("run_id"))
            for item in updated_frontier
            if isinstance(item.get("genome_id") or item.get("run_id"), str)
        }
        added = sorted(new_ids - old_ids)
        removed = sorted(old_ids - new_ids)

        # Save updated frontier
        frontier_data = {
            "schema_version": "cyntra.frontier.v1",
            "generated_at": _utc_now(),
            "objectives": objective_directions,
            "items": updated_frontier,
        }

        frontier_path.parent.mkdir(parents=True, exist_ok=True)
        frontier_path.write_text(
            json.dumps(frontier_data, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

        return {
            "success": True,
            "frontier_path": str(frontier_path),
            "added": added,
            "removed": removed,
            "frontier_size": len(updated_frontier),
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Frontier update failed: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Update Pareto frontier")
    parser.add_argument("frontier_path", help="Path to frontier.json")
    parser.add_argument("new_genomes", help="New genomes as JSON string or file")
    parser.add_argument("--objectives", nargs="+", help="Objectives to optimize")

    args = parser.parse_args()

    # Parse new genomes
    try:
        new_genomes = json.loads(args.new_genomes)
    except json.JSONDecodeError:
        genomes_path = Path(args.new_genomes)
        if genomes_path.exists():
            new_genomes = json.loads(genomes_path.read_text())
        else:
            print(f"Error: Invalid JSON and file not found: {args.new_genomes}", file=sys.stderr)
            sys.exit(1)

    result = execute(
        frontier_path=args.frontier_path,
        new_genomes=new_genomes,
        objectives=args.objectives,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
