from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Iterable

# Try to import gameplay config loader
try:
    from cyntra.fab.gameplay_config import GameplayConfig
    HAS_GAMEPLAY_CONFIG = True
except ImportError:
    HAS_GAMEPLAY_CONFIG = False
    GameplayConfig = None  # type: ignore


class FabRole(str, Enum):
    SPAWN_PLAYER = "spawn_player"
    COLLIDER = "collider"
    TRIGGER = "trigger"
    INTERACT = "interact"
    # Extended roles for full gameplay support
    NAVMESH = "navmesh"
    NPC_SPAWN = "npc_spawn"
    ITEM_SPAWN = "item_spawn"
    AUDIO_ZONE = "audio_zone"
    WAYPOINT = "waypoint"


_NAME_ALIASES: dict[FabRole, tuple[str, ...]] = {
    FabRole.SPAWN_PLAYER: ("SPAWN_PLAYER", "OL_SPAWN_PLAYER", "OL_SPAWN_PLAYER_"),
    FabRole.COLLIDER: ("COLLIDER_", "OL_COLLIDER_"),
    FabRole.TRIGGER: ("TRIGGER_", "OL_TRIGGER_"),
    FabRole.INTERACT: ("INTERACT_", "OL_INTERACT_"),
    # Extended roles
    FabRole.NAVMESH: ("NAV_", "OL_NAV_"),
    FabRole.NPC_SPAWN: ("NPC_SPAWN_", "OL_NPC_SPAWN_"),
    FabRole.ITEM_SPAWN: ("ITEM_SPAWN_", "OL_ITEM_SPAWN_"),
    FabRole.AUDIO_ZONE: ("AUDIO_ZONE_", "OL_AUDIO_ZONE_"),
    FabRole.WAYPOINT: ("WAYPOINT_", "OL_WAYPOINT_"),
}


def extract_id_from_marker(name: str, prefix: str) -> str:
    """Extract the entity/trigger ID from a marker name.

    Examples:
        extract_id_from_marker("NPC_SPAWN_librarian", "NPC_SPAWN_") -> "librarian"
        extract_id_from_marker("OL_TRIGGER_entrance_01", "TRIGGER_") -> "entrance"
        extract_id_from_marker("ITEM_SPAWN_ancient_tome_01", "ITEM_SPAWN_") -> "ancient_tome"
    """
    normalized = name.strip().upper()

    # Remove OL_ prefix if present
    if normalized.startswith("OL_"):
        normalized = normalized[3:]
        name = name[3:]

    # Remove the role prefix
    if normalized.startswith(prefix.upper()):
        remainder = name[len(prefix):]
    else:
        return ""

    # Remove trailing numeric suffixes (e.g., _01, _001)
    remainder = re.sub(r"_\d+$", "", remainder)

    return remainder.lower()


def infer_role_from_name(name: str) -> FabRole | None:
    """Infer Fab role purely from a node/object name (case-insensitive)."""
    normalized = name.strip().upper()

    # Player spawn (exact match or prefix)
    if normalized == "SPAWN_PLAYER" or normalized.startswith("SPAWN_PLAYER_"):
        return FabRole.SPAWN_PLAYER
    if normalized == "OL_SPAWN_PLAYER" or normalized.startswith("OL_SPAWN_PLAYER_"):
        return FabRole.SPAWN_PLAYER

    # Core gameplay markers
    if normalized.startswith("COLLIDER_") or normalized.startswith("OL_COLLIDER_"):
        return FabRole.COLLIDER
    if normalized.startswith("TRIGGER_") or normalized.startswith("OL_TRIGGER_"):
        return FabRole.TRIGGER
    if normalized.startswith("INTERACT_") or normalized.startswith("OL_INTERACT_"):
        return FabRole.INTERACT

    # Navigation
    if normalized.startswith("NAV_") or normalized.startswith("OL_NAV_"):
        return FabRole.NAVMESH

    # Entity spawns
    if normalized.startswith("NPC_SPAWN_") or normalized.startswith("OL_NPC_SPAWN_"):
        return FabRole.NPC_SPAWN
    if normalized.startswith("ITEM_SPAWN_") or normalized.startswith("OL_ITEM_SPAWN_"):
        return FabRole.ITEM_SPAWN

    # Environment
    if normalized.startswith("AUDIO_ZONE_") or normalized.startswith("OL_AUDIO_ZONE_"):
        return FabRole.AUDIO_ZONE
    if normalized.startswith("WAYPOINT_") or normalized.startswith("OL_WAYPOINT_"):
        return FabRole.WAYPOINT

    return None


@dataclass
class FabGameContractReport:
    # Core markers
    spawns: list[str] = field(default_factory=list)
    colliders: list[str] = field(default_factory=list)
    triggers: list[str] = field(default_factory=list)
    interactables: list[str] = field(default_factory=list)
    # Extended markers
    navmeshes: list[str] = field(default_factory=list)
    npc_spawns: list[str] = field(default_factory=list)
    item_spawns: list[str] = field(default_factory=list)
    audio_zones: list[str] = field(default_factory=list)
    waypoints: list[str] = field(default_factory=list)
    # Validation results
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def playable(self) -> bool:
        """Returns True if core contract is satisfied (spawn + colliders)."""
        return not self.errors

    @property
    def npc_ready(self) -> bool:
        """Returns True if NPC support is available (navmesh + npc spawns)."""
        return len(self.navmeshes) > 0 and len(self.npc_spawns) > 0

    def to_dict(self) -> dict[str, object]:
        return {
            "spawns": self.spawns,
            "colliders": self.colliders,
            "triggers": self.triggers,
            "interactables": self.interactables,
            "navmeshes": self.navmeshes,
            "npc_spawns": self.npc_spawns,
            "item_spawns": self.item_spawns,
            "audio_zones": self.audio_zones,
            "waypoints": self.waypoints,
            "errors": self.errors,
            "warnings": self.warnings,
            "playable": self.playable,
            "npc_ready": self.npc_ready,
        }


def validate_fab_game_contract(
    exported_object_names: Iterable[str],
    *,
    require_colliders: bool = True,
    require_navmesh: bool = False,
    require_npc_spawns: bool = False,
) -> FabGameContractReport:
    """Validate the Blender→Godot contract against exported object names.

    Args:
        exported_object_names: Iterable of object names from the exported GLB
        require_colliders: If True, require at least one COLLIDER_ marker
        require_navmesh: If True, require at least one NAV_ marker
        require_npc_spawns: If True, require at least one NPC_SPAWN_ marker
    """
    report = FabGameContractReport()

    for name in exported_object_names:
        role = infer_role_from_name(name)
        if role is None:
            continue

        # Core markers
        if role == FabRole.SPAWN_PLAYER:
            report.spawns.append(name)
        elif role == FabRole.COLLIDER:
            report.colliders.append(name)
        elif role == FabRole.TRIGGER:
            report.triggers.append(name)
        elif role == FabRole.INTERACT:
            report.interactables.append(name)
        # Extended markers
        elif role == FabRole.NAVMESH:
            report.navmeshes.append(name)
        elif role == FabRole.NPC_SPAWN:
            report.npc_spawns.append(name)
        elif role == FabRole.ITEM_SPAWN:
            report.item_spawns.append(name)
        elif role == FabRole.AUDIO_ZONE:
            report.audio_zones.append(name)
        elif role == FabRole.WAYPOINT:
            report.waypoints.append(name)

    # Core contract validation
    if len(report.spawns) == 0:
        report.errors.append(
            "Missing player spawn marker (expected SPAWN_PLAYER or OL_SPAWN_PLAYER)."
        )
    elif len(report.spawns) > 1:
        report.errors.append(
            "Multiple player spawns found; expected exactly 1 "
            f"(found {len(report.spawns)})."
        )

    if require_colliders and len(report.colliders) == 0:
        report.errors.append(
            "Missing collider marker meshes (expected COLLIDER_* or OL_COLLIDER_*)."
        )

    # Extended validation
    if require_navmesh and len(report.navmeshes) == 0:
        report.errors.append(
            "Missing navigation mesh (expected NAV_* or OL_NAV_*)."
        )

    if require_npc_spawns and len(report.npc_spawns) == 0:
        report.errors.append(
            "Missing NPC spawn markers (expected NPC_SPAWN_* or OL_NPC_SPAWN_*)."
        )

    # Warnings for incomplete NPC support
    if len(report.npc_spawns) > 0 and len(report.navmeshes) == 0:
        report.warnings.append(
            "NPC spawn markers found but no navigation mesh - NPCs won't pathfind."
        )

    if len(report.waypoints) > 0 and len(report.npc_spawns) == 0:
        report.warnings.append(
            "Waypoints found but no NPC spawn markers - patrol paths unused."
        )

    return report


# =============================================================================
# GAMEPLAY VALIDATION
# =============================================================================


@dataclass
class GameplayValidationReport:
    """Report from validating gameplay.yaml against GLB markers."""

    # Matched entities
    matched_npcs: list[str] = field(default_factory=list)
    matched_items: list[str] = field(default_factory=list)
    matched_triggers: list[str] = field(default_factory=list)
    matched_interactions: list[str] = field(default_factory=list)
    matched_audio_zones: list[str] = field(default_factory=list)
    matched_patrol_paths: list[str] = field(default_factory=list)

    # Unmatched (in gameplay.yaml but not in GLB)
    missing_markers: list[str] = field(default_factory=list)

    # Orphaned (in GLB but not in gameplay.yaml) - warnings, not errors
    orphaned_markers: list[str] = field(default_factory=list)

    # Validation results
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        """Returns True if no errors found."""
        return not self.errors

    def to_dict(self) -> dict[str, object]:
        return {
            "matched_npcs": self.matched_npcs,
            "matched_items": self.matched_items,
            "matched_triggers": self.matched_triggers,
            "matched_interactions": self.matched_interactions,
            "matched_audio_zones": self.matched_audio_zones,
            "matched_patrol_paths": self.matched_patrol_paths,
            "missing_markers": self.missing_markers,
            "orphaned_markers": self.orphaned_markers,
            "errors": self.errors,
            "warnings": self.warnings,
            "valid": self.valid,
        }


def validate_gameplay_against_markers(
    gameplay_config: dict[str, Any] | Path,
    marker_names: Iterable[str],
    *,
    strict: bool = False,
) -> GameplayValidationReport:
    """Validate gameplay.yaml definitions against GLB marker names.

    Checks that:
    - All NPC entity IDs have corresponding NPC_SPAWN_* markers
    - All item entity IDs have corresponding ITEM_SPAWN_* markers
    - All trigger IDs have corresponding TRIGGER_* markers
    - All interaction IDs have corresponding INTERACT_* markers
    - All audio_zone IDs have corresponding AUDIO_ZONE_* markers
    - All patrol_path references have corresponding WAYPOINT_* markers

    Args:
        gameplay_config: Either a dict (parsed gameplay.yaml) or Path to gameplay.yaml
        marker_names: Iterable of object names from the exported GLB
        strict: If True, orphaned markers (in GLB but not in gameplay) are errors
    """
    report = GameplayValidationReport()

    # Load gameplay config if path provided
    if isinstance(gameplay_config, Path):
        if HAS_GAMEPLAY_CONFIG and GameplayConfig is not None:
            try:
                config = GameplayConfig.from_yaml(gameplay_config)
                gameplay_dict = config.raw_config
            except Exception as e:
                report.errors.append(f"Failed to load gameplay.yaml: {e}")
                return report
        else:
            import yaml  # type: ignore

            with open(gameplay_config) as f:
                gameplay_dict = yaml.safe_load(f)
    else:
        gameplay_dict = gameplay_config

    # Build sets of IDs from markers
    marker_list = list(marker_names)
    npc_marker_ids: set[str] = set()
    item_marker_ids: set[str] = set()
    trigger_marker_ids: set[str] = set()
    interact_marker_ids: set[str] = set()
    audio_zone_marker_ids: set[str] = set()
    waypoint_paths: set[str] = set()

    for name in marker_list:
        role = infer_role_from_name(name)
        if role == FabRole.NPC_SPAWN:
            npc_marker_ids.add(extract_id_from_marker(name, "NPC_SPAWN_"))
        elif role == FabRole.ITEM_SPAWN:
            item_marker_ids.add(extract_id_from_marker(name, "ITEM_SPAWN_"))
        elif role == FabRole.TRIGGER:
            trigger_marker_ids.add(extract_id_from_marker(name, "TRIGGER_"))
        elif role == FabRole.INTERACT:
            interact_marker_ids.add(extract_id_from_marker(name, "INTERACT_"))
        elif role == FabRole.AUDIO_ZONE:
            audio_zone_marker_ids.add(extract_id_from_marker(name, "AUDIO_ZONE_"))
        elif role == FabRole.WAYPOINT:
            # Extract path name (e.g., "main_hall" from "WAYPOINT_main_hall_01")
            wp_id = extract_id_from_marker(name, "WAYPOINT_")
            # Remove trailing number for path grouping
            path_name = re.sub(r"_?\d+$", "", wp_id)
            if path_name:
                waypoint_paths.add(path_name)

    # Get gameplay definitions
    entities: dict[str, Any] = gameplay_dict.get("entities", {})
    triggers: dict[str, Any] = gameplay_dict.get("triggers", {})
    interactions: dict[str, Any] = gameplay_dict.get("interactions", {})
    audio_zones: dict[str, Any] = gameplay_dict.get("audio_zones", {})

    # Validate NPC entities
    used_npc_ids: set[str] = set()
    for entity_id, entity in entities.items():
        entity_type = entity.get("type", "") if isinstance(entity, dict) else ""
        behavior = entity.get("behavior", "") if isinstance(entity, dict) else ""

        # Items don't need NPC markers
        if entity_type in ("key_item", "consumable", "equipment", "document"):
            # Check for ITEM_SPAWN marker
            if entity_id in item_marker_ids:
                report.matched_items.append(entity_id)
            else:
                report.missing_markers.append(f"ITEM_SPAWN_{entity_id}")
                report.errors.append(
                    f"Item entity '{entity_id}' has no ITEM_SPAWN_{entity_id} marker in GLB"
                )
            continue

        # NPC entities need NPC_SPAWN markers
        if behavior or entity_type not in ("key_item", "consumable", "equipment", "document"):
            if entity_id in npc_marker_ids:
                report.matched_npcs.append(entity_id)
                used_npc_ids.add(entity_id)
            else:
                report.missing_markers.append(f"NPC_SPAWN_{entity_id}")
                report.errors.append(
                    f"NPC entity '{entity_id}' has no NPC_SPAWN_{entity_id} marker in GLB"
                )

            # Check patrol path if specified
            patrol_path = entity.get("patrol_path", "") if isinstance(entity, dict) else ""
            if patrol_path:
                if patrol_path in waypoint_paths:
                    if patrol_path not in report.matched_patrol_paths:
                        report.matched_patrol_paths.append(patrol_path)
                else:
                    report.warnings.append(
                        f"NPC '{entity_id}' references patrol_path '{patrol_path}' "
                        f"but no WAYPOINT_{patrol_path}_* markers found"
                    )

    # Validate triggers
    used_trigger_ids: set[str] = set()
    for trigger_id in triggers:
        if trigger_id in trigger_marker_ids:
            report.matched_triggers.append(trigger_id)
            used_trigger_ids.add(trigger_id)
        else:
            report.missing_markers.append(f"TRIGGER_{trigger_id}")
            report.errors.append(
                f"Trigger '{trigger_id}' has no TRIGGER_{trigger_id} marker in GLB"
            )

    # Validate interactions
    used_interact_ids: set[str] = set()
    for interact_id in interactions:
        if interact_id in interact_marker_ids:
            report.matched_interactions.append(interact_id)
            used_interact_ids.add(interact_id)
        else:
            report.missing_markers.append(f"INTERACT_{interact_id}")
            report.errors.append(
                f"Interaction '{interact_id}' has no INTERACT_{interact_id} marker in GLB"
            )

    # Validate audio zones
    used_audio_zone_ids: set[str] = set()
    for zone_id in audio_zones:
        if zone_id in audio_zone_marker_ids:
            report.matched_audio_zones.append(zone_id)
            used_audio_zone_ids.add(zone_id)
        else:
            report.missing_markers.append(f"AUDIO_ZONE_{zone_id}")
            report.errors.append(
                f"Audio zone '{zone_id}' has no AUDIO_ZONE_{zone_id} marker in GLB"
            )

    # Check for orphaned markers (in GLB but not defined in gameplay.yaml)
    orphaned_npcs = npc_marker_ids - used_npc_ids
    orphaned_triggers = trigger_marker_ids - used_trigger_ids
    orphaned_interactions = interact_marker_ids - used_interact_ids
    orphaned_audio_zones = audio_zone_marker_ids - used_audio_zone_ids

    for npc_id in orphaned_npcs:
        if npc_id:  # Skip empty IDs
            marker_name = f"NPC_SPAWN_{npc_id}"
            report.orphaned_markers.append(marker_name)
            msg = f"NPC marker '{marker_name}' has no entity definition in gameplay.yaml"
            if strict:
                report.errors.append(msg)
            else:
                report.warnings.append(msg)

    for trigger_id in orphaned_triggers:
        if trigger_id:
            marker_name = f"TRIGGER_{trigger_id}"
            report.orphaned_markers.append(marker_name)
            msg = f"Trigger marker '{marker_name}' has no definition in gameplay.yaml"
            if strict:
                report.errors.append(msg)
            else:
                report.warnings.append(msg)

    for interact_id in orphaned_interactions:
        if interact_id:
            marker_name = f"INTERACT_{interact_id}"
            report.orphaned_markers.append(marker_name)
            msg = f"Interaction marker '{marker_name}' has no definition in gameplay.yaml"
            if strict:
                report.errors.append(msg)
            else:
                report.warnings.append(msg)

    for zone_id in orphaned_audio_zones:
        if zone_id:
            marker_name = f"AUDIO_ZONE_{zone_id}"
            report.orphaned_markers.append(marker_name)
            msg = f"Audio zone marker '{marker_name}' has no definition in gameplay.yaml"
            if strict:
                report.errors.append(msg)
            else:
                report.warnings.append(msg)

    return report


def validate_full_fab_contract(
    gameplay_config: dict[str, Any] | Path,
    marker_names: Iterable[str],
    *,
    require_colliders: bool = True,
    require_navmesh: bool = False,
    strict: bool = False,
) -> tuple[FabGameContractReport, GameplayValidationReport]:
    """Validate both the game contract (markers) and gameplay definitions.

    Returns tuple of (game_contract_report, gameplay_validation_report).
    """
    marker_list = list(marker_names)

    game_report = validate_fab_game_contract(
        marker_list,
        require_colliders=require_colliders,
        require_navmesh=require_navmesh,
    )

    gameplay_report = validate_gameplay_against_markers(
        gameplay_config,
        marker_list,
        strict=strict,
    )

    return game_report, gameplay_report


__all__ = [
    "FabRole",
    "FabGameContractReport",
    "GameplayValidationReport",
    "extract_id_from_marker",
    "infer_role_from_name",
    "validate_fab_game_contract",
    "validate_gameplay_against_markers",
    "validate_full_fab_contract",
]
