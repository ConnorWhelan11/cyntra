from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RunContext:
    universe_id: str
    world_id: str | None = None
    objective_id: str | None = None
    swarm_id: str | None = None
    issue_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "1.0",
            "universe_id": self.universe_id,
            "world_id": self.world_id,
            "objective_id": self.objective_id,
            "swarm_id": self.swarm_id,
            "issue_id": self.issue_id,
        }


def _schemas_dir() -> Path:
    # kernel/src/cyntra/universe/run_context.py -> kernel/
    return Path(__file__).resolve().parents[3] / "schemas" / "cyntra"


def _load_schema(name: str) -> dict[str, Any]:
    path = _schemas_dir() / name
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_context(data: dict[str, Any]) -> None:
    try:
        import jsonschema
    except ImportError:
        return
    schema = _load_schema("run_context.schema.json")
    jsonschema.validate(instance=data, schema=schema)


def write_run_context(run_dir: Path, context: RunContext) -> Path:
    run_dir = run_dir.resolve()
    run_dir.mkdir(parents=True, exist_ok=True)

    payload = context.to_dict()
    _validate_context(payload)

    path = run_dir / "context.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    return path


def read_run_context(run_dir: Path) -> RunContext | None:
    path = Path(run_dir) / "context.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return None
    return RunContext(
        universe_id=str(data.get("universe_id") or ""),
        world_id=data.get("world_id"),
        objective_id=data.get("objective_id"),
        swarm_id=data.get("swarm_id"),
        issue_id=data.get("issue_id"),
    )
