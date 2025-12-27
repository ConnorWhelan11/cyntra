from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


class UniverseLoadError(RuntimeError):
    pass


def _schemas_dir() -> Path:
    # kernel/src/cyntra/universe/config.py -> kernel/
    return Path(__file__).resolve().parents[3] / "schemas" / "cyntra"


def _load_schema(name: str) -> dict[str, Any]:
    path = _schemas_dir() / name
    if not path.exists():
        raise UniverseLoadError(f"Schema not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_with_schema(data: dict[str, Any], schema_name: str) -> None:
    schema = _load_schema(schema_name)
    try:
        import jsonschema
    except ImportError:
        return
    jsonschema.validate(instance=data, schema=schema)


def _load_yaml_dict(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        raise UniverseLoadError(f"Failed to load YAML: {path}") from exc
    if not isinstance(raw, dict):
        raise UniverseLoadError(f"Expected a mapping at top-level: {path}")
    return dict(raw)


def _resolve_under_repo(repo_root: Path, path: Path) -> Path:
    repo_root = repo_root.resolve()
    resolved = path.resolve()
    try:
        resolved.relative_to(repo_root)
    except ValueError as exc:
        raise UniverseLoadError(f"Path escapes repo root: {path}") from exc
    return resolved


@dataclass(frozen=True)
class WorldRef:
    world_id: str
    world_kind: str
    path: str
    enabled: bool = True
    tags: tuple[str, ...] = ()

    def resolved_path(self, repo_root: Path) -> Path:
        world_path = Path(self.path)
        if not world_path.is_absolute():
            world_path = repo_root / world_path
        return _resolve_under_repo(repo_root, world_path)


@dataclass(frozen=True)
class UniverseConfig:
    repo_root: Path
    universe_dir: Path
    raw: dict[str, Any]
    agents: dict[str, Any] | None = None
    swarms: dict[str, Any] | None = None
    objectives: dict[str, Any] | None = None

    @property
    def universe_id(self) -> str:
        value = self.raw.get("universe_id")
        if not isinstance(value, str) or not value:
            raise UniverseLoadError("Universe config missing `universe_id`")
        return value

    @property
    def name(self) -> str | None:
        value = self.raw.get("name")
        return value if isinstance(value, str) and value else None

    @property
    def description(self) -> str | None:
        value = self.raw.get("description")
        return value if isinstance(value, str) and value else None

    @property
    def defaults(self) -> dict[str, Any]:
        value = self.raw.get("defaults") or {}
        return dict(value) if isinstance(value, dict) else {}

    @property
    def policies(self) -> dict[str, Any]:
        value = self.raw.get("policies") or {}
        return dict(value) if isinstance(value, dict) else {}

    @property
    def worlds(self) -> list[WorldRef]:
        raw_worlds = self.raw.get("worlds") or []
        if not isinstance(raw_worlds, list):
            raise UniverseLoadError("Universe config `worlds` must be a list")
        results: list[WorldRef] = []
        for item in raw_worlds:
            if not isinstance(item, dict):
                raise UniverseLoadError("Universe config `worlds` items must be mappings")
            world_id = item.get("world_id")
            world_kind = item.get("world_kind")
            path = item.get("path")
            if not isinstance(world_id, str) or not world_id:
                raise UniverseLoadError("Universe config world missing `world_id`")
            if not isinstance(world_kind, str) or not world_kind:
                raise UniverseLoadError(f"Universe config world {world_id} missing `world_kind`")
            if not isinstance(path, str) or not path:
                raise UniverseLoadError(f"Universe config world {world_id} missing `path`")
            enabled = bool(item.get("enabled", True))
            tags_value = item.get("tags") or []
            tags: tuple[str, ...] = ()
            if isinstance(tags_value, list):
                tags = tuple(str(t) for t in tags_value if isinstance(t, str))
            results.append(
                WorldRef(
                    world_id=world_id,
                    world_kind=world_kind,
                    path=path,
                    enabled=enabled,
                    tags=tags,
                )
            )
        return results

    def get_world(self, world_id: str) -> WorldRef | None:
        for world in self.worlds:
            if world.world_id == world_id:
                return world
        return None

    def enabled_worlds(self) -> list[WorldRef]:
        return [w for w in self.worlds if w.enabled]


def list_universe_ids(repo_root: Path | None = None) -> list[str]:
    repo_root = (repo_root or Path.cwd()).resolve()
    universes_dir = repo_root / "universes"
    if not universes_dir.exists():
        return []
    results: list[str] = []
    for child in sorted(universes_dir.iterdir()):
        if not child.is_dir():
            continue
        if (child / "universe.yaml").is_file():
            results.append(child.name)
    return results


def load_universe(
    universe_id: str,
    *,
    repo_root: Path | None = None,
    validate_worlds: bool = True,
) -> UniverseConfig:
    repo_root = (repo_root or Path.cwd()).resolve()
    universe_dir = repo_root / "universes" / universe_id
    universe_path = universe_dir / "universe.yaml"
    if not universe_path.exists():
        raise UniverseLoadError(f"Universe not found: {universe_path}")

    raw = _load_yaml_dict(universe_path)

    # Config schema validation (optional if jsonschema installed).
    _validate_with_schema(raw, "universe.schema.json")

    # Resolve world paths early to catch traversal / missing file errors.
    config = UniverseConfig(repo_root=repo_root, universe_dir=universe_dir, raw=raw)
    if raw.get("schema_version") != "1.0":
        raise UniverseLoadError('Universe config `schema_version` must be "1.0"')
    if config.universe_id != universe_id:
        raise UniverseLoadError(
            f"Universe config `universe_id` mismatch: expected {universe_id}, got {config.universe_id}"
        )
    for world in config.worlds:
        resolved = world.resolved_path(repo_root)
        if not resolved.exists():
            raise UniverseLoadError(f"World path not found for {world.world_id}: {resolved}")

        if validate_worlds and world.world_kind == "fab_world":
            from cyntra.fab.world_config import load_world_config

            load_world_config(resolved)

    # Optional catalogs.
    agents_path = universe_dir / "agents.yaml"
    swarms_path = universe_dir / "swarms.yaml"
    objectives_path = universe_dir / "objectives.yaml"

    agents = None
    if agents_path.exists():
        agents = _load_yaml_dict(agents_path)
        _validate_with_schema(agents, "agents.schema.json")

    swarms = None
    if swarms_path.exists():
        swarms = _load_yaml_dict(swarms_path)
        _validate_with_schema(swarms, "swarms.schema.json")

    objectives = None
    if objectives_path.exists():
        objectives = _load_yaml_dict(objectives_path)
        _validate_with_schema(objectives, "objectives.schema.json")

    return UniverseConfig(
        repo_root=repo_root,
        universe_dir=universe_dir,
        raw=raw,
        agents=agents,
        swarms=swarms,
        objectives=objectives,
    )
