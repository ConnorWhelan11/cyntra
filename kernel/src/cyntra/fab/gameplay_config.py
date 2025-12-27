"""
Gameplay Configuration Loading and Validation.

Loads and validates gameplay.yaml files according to the Fab Gameplay schema.
This defines runtime behavior for worlds: NPCs, items, triggers, objectives, etc.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class EntityConfig:
    """Parsed entity (NPC or item) configuration."""

    id: str
    display_name: str | None = None
    entity_type: str | None = None  # npc, key_item, consumable, etc.
    behavior: str | None = None
    patrol_path: str | None = None
    dialogue: str | None = None
    schedule: list[dict[str, Any]] = field(default_factory=list)
    on_pickup: list[Any] = field(default_factory=list)
    unlocks: list[str] = field(default_factory=list)
    effect: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class InteractionConfig:
    """Parsed interaction configuration."""

    id: str
    action: str  # examine, use, open, talk, etc.
    requires: dict[str, str] | None = None
    locked_message: str | None = None
    result: list[Any] = field(default_factory=list)
    one_shot: bool = False
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class TriggerConfig:
    """Parsed trigger configuration."""

    id: str
    requires: dict[str, str] | None = None
    on_enter: list[Any] = field(default_factory=list)
    on_exit: list[Any] = field(default_factory=list)
    on_stay: list[Any] = field(default_factory=list)
    one_shot: bool = False
    cooldown_seconds: float = 0.0
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class AudioZoneConfig:
    """Parsed audio zone configuration."""

    id: str
    ambient: str | None = None
    music: str | None = None
    volume: float = 1.0
    fade_time: float = 1.0
    reverb_preset: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ObjectiveConfig:
    """Parsed objective/quest configuration."""

    id: str
    description: str
    objective_type: str = "main"  # main, side, discovery, hidden, final
    requires: list[str] = field(default_factory=list)
    complete_when: dict[str, Any] = field(default_factory=dict)
    hint: str | None = None
    rewards: dict[str, Any] = field(default_factory=dict)
    on_complete: list[Any] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlayerConfig:
    """Parsed player configuration."""

    controller: str = "first_person"
    capabilities: list[str] = field(default_factory=lambda: ["walk", "interact"])
    settings: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class RulesConfig:
    """Parsed game rules configuration."""

    combat: dict[str, Any] = field(default_factory=dict)
    inventory: dict[str, Any] = field(default_factory=dict)
    saving: dict[str, Any] = field(default_factory=dict)
    time: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


class GameplayConfig:
    """Parsed and validated gameplay configuration."""

    def __init__(self, config_path: Path):
        """Load and validate gameplay.yaml."""
        self.config_path = config_path
        self.world_dir = config_path.parent

        # Load YAML
        with open(config_path) as f:
            self.raw_config = yaml.safe_load(f)

        # Validate against schema
        self._validate_schema()

        # Parse required fields
        self.schema_version = self.raw_config["schema_version"]
        self.world_id = self.raw_config["world_id"]

        # Parse player config
        self.player = self._parse_player()

        # Parse entities
        self.entities = self._parse_entities()

        # Parse interactions
        self.interactions = self._parse_interactions()

        # Parse triggers
        self.triggers = self._parse_triggers()

        # Parse audio zones
        self.audio_zones = self._parse_audio_zones()

        # Parse objectives
        self.objectives = self._parse_objectives()

        # Parse rules
        self.rules = self._parse_rules()

        # Validate objective dependencies
        self._validate_objective_dependencies()

    def _validate_schema(self):
        """Validate configuration against JSON schema."""
        schema_path = Path(__file__).parent / "gameplay_schema.json"
        with open(schema_path) as f:
            schema = json.load(f)

        try:
            import jsonschema

            jsonschema.validate(instance=self.raw_config, schema=schema)
        except ImportError:
            self._basic_validation()

    def _basic_validation(self):
        """Basic validation when jsonschema not available."""
        required = ["schema_version", "world_id"]
        for field_name in required:
            if field_name not in self.raw_config:
                raise ValueError(f"Missing required field: {field_name}")

    def _parse_player(self) -> PlayerConfig:
        """Parse player configuration."""
        raw = self.raw_config.get("player", {})
        return PlayerConfig(
            controller=raw.get("controller", "first_person"),
            capabilities=raw.get("capabilities", ["walk", "interact"]),
            settings=raw.get("settings", {}),
            raw=raw,
        )

    def _parse_entities(self) -> dict[str, EntityConfig]:
        """Parse entity configurations."""
        entities = {}
        for entity_id, raw in self.raw_config.get("entities", {}).items():
            entities[entity_id] = EntityConfig(
                id=entity_id,
                display_name=raw.get("display_name"),
                entity_type=raw.get("type"),
                behavior=raw.get("behavior"),
                patrol_path=raw.get("patrol_path"),
                dialogue=raw.get("dialogue"),
                schedule=raw.get("schedule", []),
                on_pickup=raw.get("on_pickup", []),
                unlocks=raw.get("unlocks", []),
                effect=raw.get("effect", {}),
                raw=raw,
            )
        return entities

    def _parse_interactions(self) -> dict[str, InteractionConfig]:
        """Parse interaction configurations."""
        interactions = {}
        for interaction_id, raw in self.raw_config.get("interactions", {}).items():
            interactions[interaction_id] = InteractionConfig(
                id=interaction_id,
                action=raw.get("action", "use"),
                requires=raw.get("requires"),
                locked_message=raw.get("locked_message"),
                result=raw.get("result", []),
                one_shot=raw.get("one_shot", False),
                raw=raw,
            )
        return interactions

    def _parse_triggers(self) -> dict[str, TriggerConfig]:
        """Parse trigger configurations."""
        triggers = {}
        for trigger_id, raw in self.raw_config.get("triggers", {}).items():
            triggers[trigger_id] = TriggerConfig(
                id=trigger_id,
                requires=raw.get("requires"),
                on_enter=raw.get("on_enter", []),
                on_exit=raw.get("on_exit", []),
                on_stay=raw.get("on_stay", []),
                one_shot=raw.get("one_shot", False),
                cooldown_seconds=raw.get("cooldown_seconds", 0.0),
                raw=raw,
            )
        return triggers

    def _parse_audio_zones(self) -> dict[str, AudioZoneConfig]:
        """Parse audio zone configurations."""
        audio_zones = {}
        for zone_id, raw in self.raw_config.get("audio_zones", {}).items():
            audio_zones[zone_id] = AudioZoneConfig(
                id=zone_id,
                ambient=raw.get("ambient"),
                music=raw.get("music"),
                volume=raw.get("volume", 1.0),
                fade_time=raw.get("fade_time", 1.0),
                reverb_preset=raw.get("reverb_preset"),
                raw=raw,
            )
        return audio_zones

    def _parse_objectives(self) -> list[ObjectiveConfig]:
        """Parse objective configurations."""
        objectives = []
        for raw in self.raw_config.get("objectives", []):
            objectives.append(
                ObjectiveConfig(
                    id=raw["id"],
                    description=raw["description"],
                    objective_type=raw.get("type", "main"),
                    requires=raw.get("requires", []),
                    complete_when=raw.get("complete_when", {}),
                    hint=raw.get("hint"),
                    rewards=raw.get("rewards", {}),
                    on_complete=raw.get("on_complete", []),
                    raw=raw,
                )
            )
        return objectives

    def _parse_rules(self) -> RulesConfig:
        """Parse game rules configuration."""
        raw = self.raw_config.get("rules", {})
        return RulesConfig(
            combat=raw.get("combat", {}),
            inventory=raw.get("inventory", {}),
            saving=raw.get("saving", {}),
            time=raw.get("time", {}),
            raw=raw,
        )

    def _validate_objective_dependencies(self):
        """Validate objective dependency DAG."""
        objective_ids = {obj.id for obj in self.objectives}

        for obj in self.objectives:
            for dep_id in obj.requires:
                if dep_id not in objective_ids:
                    raise ValueError(
                        f"Objective '{obj.id}' requires non-existent objective '{dep_id}'"
                    )

        # Check for circular dependencies
        self._check_objective_cycles()

    def _check_objective_cycles(self):
        """Check for circular dependencies in objective graph."""
        graph: dict[str, list[str]] = {}
        for obj in self.objectives:
            graph[obj.id] = obj.requires

        visited: set[str] = set()
        rec_stack: set[str] = set()

        def has_cycle(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)

            for neighbor in graph.get(node, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True

            rec_stack.remove(node)
            return False

        for obj_id in graph:
            if obj_id not in visited and has_cycle(obj_id):
                raise ValueError(f"Circular dependency detected in objectives involving '{obj_id}'")

    def get_objective_order(self) -> list[str]:
        """Get topologically sorted objective unlock order."""
        dependencies: dict[str, list[str]] = {}
        in_degree: dict[str, int] = {}

        for obj in self.objectives:
            dependencies[obj.id] = []
            in_degree[obj.id] = 0

        for obj in self.objectives:
            in_degree[obj.id] = len(obj.requires)
            for dep in obj.requires:
                if dep not in dependencies:
                    dependencies[dep] = []
                dependencies[dep].append(obj.id)

        # Kahn's algorithm
        queue = [oid for oid, deg in in_degree.items() if deg == 0]
        result = []

        while queue:
            current = queue.pop(0)
            result.append(current)

            for dependent in dependencies.get(current, []):
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(result) != len(self.objectives):
            raise ValueError("Cannot resolve objective order (cycle detected)")

        return result

    def get_entity(self, entity_id: str) -> EntityConfig | None:
        """Get entity configuration by ID."""
        return self.entities.get(entity_id)

    def get_interaction(self, interaction_id: str) -> InteractionConfig | None:
        """Get interaction configuration by ID."""
        return self.interactions.get(interaction_id)

    def get_trigger(self, trigger_id: str) -> TriggerConfig | None:
        """Get trigger configuration by ID."""
        return self.triggers.get(trigger_id)

    def get_audio_zone(self, zone_id: str) -> AudioZoneConfig | None:
        """Get audio zone configuration by ID."""
        return self.audio_zones.get(zone_id)

    def get_objective(self, objective_id: str) -> ObjectiveConfig | None:
        """Get objective configuration by ID."""
        for obj in self.objectives:
            if obj.id == objective_id:
                return obj
        return None

    def get_npc_entities(self) -> dict[str, EntityConfig]:
        """Get all NPC entities."""
        return {
            eid: e
            for eid, e in self.entities.items()
            if e.entity_type == "npc" or e.behavior is not None
        }

    def get_item_entities(self) -> dict[str, EntityConfig]:
        """Get all item entities."""
        return {
            eid: e
            for eid, e in self.entities.items()
            if e.entity_type in ("key_item", "consumable", "equipment", "document", "currency")
        }

    def get_dialogue_files(self) -> list[Path]:
        """Get paths to all referenced dialogue files."""
        dialogue_files = []
        for entity in self.entities.values():
            if entity.dialogue:
                dialogue_path = self.world_dir / "dialogue" / entity.dialogue
                if dialogue_path.exists():
                    dialogue_files.append(dialogue_path)
        return dialogue_files

    def export_to_json(self) -> dict[str, Any]:
        """Export configuration to JSON-serializable dict for Godot."""
        return {
            "schema_version": self.schema_version,
            "world_id": self.world_id,
            "player": {
                "controller": self.player.controller,
                "capabilities": self.player.capabilities,
                "settings": self.player.settings,
            },
            "entities": {
                eid: {
                    "id": e.id,
                    "display_name": e.display_name,
                    "type": e.entity_type,
                    "behavior": e.behavior,
                    "patrol_path": e.patrol_path,
                    "dialogue": e.dialogue,
                    "schedule": e.schedule,
                    "on_pickup": e.on_pickup,
                    "unlocks": e.unlocks,
                    "effect": e.effect,
                }
                for eid, e in self.entities.items()
            },
            "interactions": {
                iid: {
                    "id": i.id,
                    "action": i.action,
                    "requires": i.requires,
                    "locked_message": i.locked_message,
                    "result": i.result,
                    "one_shot": i.one_shot,
                }
                for iid, i in self.interactions.items()
            },
            "triggers": {
                tid: {
                    "id": t.id,
                    "requires": t.requires,
                    "on_enter": t.on_enter,
                    "on_exit": t.on_exit,
                    "on_stay": t.on_stay,
                    "one_shot": t.one_shot,
                    "cooldown_seconds": t.cooldown_seconds,
                }
                for tid, t in self.triggers.items()
            },
            "audio_zones": {
                zid: {
                    "id": z.id,
                    "ambient": z.ambient,
                    "music": z.music,
                    "volume": z.volume,
                    "fade_time": z.fade_time,
                    "reverb_preset": z.reverb_preset,
                }
                for zid, z in self.audio_zones.items()
            },
            "objectives": [
                {
                    "id": o.id,
                    "description": o.description,
                    "type": o.objective_type,
                    "requires": o.requires,
                    "complete_when": o.complete_when,
                    "hint": o.hint,
                    "rewards": o.rewards,
                    "on_complete": o.on_complete,
                }
                for o in self.objectives
            ],
            "rules": {
                "combat": self.rules.combat,
                "inventory": self.rules.inventory,
                "saving": self.rules.saving,
                "time": self.rules.time,
            },
        }


def load_gameplay_config(gameplay_path: Path) -> GameplayConfig:
    """
    Load gameplay configuration from directory or gameplay.yaml file.

    Args:
        gameplay_path: Path to world directory or gameplay.yaml file

    Returns:
        Validated GameplayConfig instance
    """
    config_file = gameplay_path / "gameplay.yaml" if gameplay_path.is_dir() else gameplay_path

    if not config_file.exists():
        raise FileNotFoundError(f"Gameplay config not found: {config_file}")

    return GameplayConfig(config_file)


def gameplay_exists(world_path: Path) -> bool:
    """Check if a gameplay.yaml exists for a world."""
    if world_path.is_dir():
        return (world_path / "gameplay.yaml").exists()
    return world_path.exists() and world_path.name == "gameplay.yaml"


__all__ = [
    "GameplayConfig",
    "EntityConfig",
    "InteractionConfig",
    "TriggerConfig",
    "AudioZoneConfig",
    "ObjectiveConfig",
    "PlayerConfig",
    "RulesConfig",
    "load_gameplay_config",
    "gameplay_exists",
]
