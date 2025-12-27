# Fab → Godot Marker Contract v1.1

This document specifies the naming conventions for Blender objects that control Godot scene setup at import time.

## Overview

Markers are named objects in Blender (empties or meshes) that the Fab pipeline converts into Godot gameplay nodes. The `FabLevelLoader.gd` and `post_import.gd` scripts process these markers at runtime or import time.

## Quick Reference

| Marker Prefix  | Type  | Godot Conversion                | Required               |
| -------------- | ----- | ------------------------------- | ---------------------- |
| `SPAWN_PLAYER` | Empty | Player spawn location           | Yes (exactly 1)        |
| `COLLIDER_*`   | Mesh  | StaticBody3D + CollisionShape3D | Yes (at least 1)       |
| `TRIGGER_*`    | Mesh  | Area3D + FabTriggerArea         | No                     |
| `INTERACT_*`   | Any   | Node with fab_interact metadata | No                     |
| `NAV_*`        | Mesh  | NavigationRegion3D              | No (required for NPCs) |
| `NPC_SPAWN_*`  | Empty | NPC spawn point with type       | No                     |
| `ITEM_SPAWN_*` | Empty | Item spawn point with ID        | No                     |
| `AUDIO_ZONE_*` | Mesh  | Area3D + AudioStreamPlayer3D    | No                     |
| `WAYPOINT_*`   | Empty | Patrol path points              | No                     |

## Required Markers

### SPAWN_PLAYER

**Purpose:** Defines where the player spawns when the level loads.

**Names:** `SPAWN_PLAYER`, `OL_SPAWN_PLAYER`

**Requirements:**

- Exactly 1 per level
- Must be an Empty object
- Position ~1.6m above floor (eye height)
- Rotation determines initial facing direction

**Godot Result:** Player scene is instantiated at this transform.

**Example:**

```
Empty: SPAWN_PLAYER
  Location: (0, 0, 1.6)
  Rotation: (0, 0, 0)
```

### COLLIDER\_\*

**Purpose:** Defines invisible collision geometry for the physics engine.

**Names:** `COLLIDER_<name>`, `OL_COLLIDER_<name>`

**Requirements:**

- At least 1 per level (for basic playability)
- Must be Mesh objects with geometry
- Use simplified geometry (boxes, low-poly shells)
- Name suffix describes the collider (e.g., `COLLIDER_GROUND`, `COLLIDER_WALLS`)

**Godot Result:** `StaticBody3D` with trimesh `CollisionShape3D`.

**Best Practices:**

- Keep colliders simple (fewer triangles = better performance)
- Avoid tiny slivers or non-manifold geometry
- Use convex shapes where possible

## Optional Markers

### TRIGGER\_\*

**Purpose:** Defines trigger volumes that detect player entry/exit.

**Names:** `TRIGGER_<name>`, `OL_TRIGGER_<name>`

**Requirements:**

- Mesh object defining the trigger volume
- Name suffix identifies the trigger (e.g., `TRIGGER_entrance`, `TRIGGER_secret_room`)

**Godot Result:** `Area3D` with `FabTriggerArea` script attached. Emits signals:

- `fab_trigger_entered(trigger_name, body)`
- `fab_trigger_exited(trigger_name, body)`

**Example:**

```gdscript
# In your game script
var trigger = get_node("Trigger_entrance")
trigger.fab_trigger_entered.connect(_on_entrance_triggered)

func _on_entrance_triggered(name: String, body: Node) -> void:
    print("Player entered: ", name)
```

### NAV\_\*

**Purpose:** Defines navigation meshes for NPC pathfinding.

**Names:** `NAV_<zone>`, `OL_NAV_<zone>`

**Requirements:**

- Mesh object covering walkable surfaces
- Should be flat or gently sloped
- Can have multiple zones (e.g., `NAV_GROUND`, `NAV_MEZZANINE`)

**Godot Result:** `NavigationRegion3D` with baked navigation mesh.

**Best Practices:**

- Generate using the `navmesh.py` Blender stage
- Include stairs/ramps for vertical navigation
- Keep geometry simple for faster pathfinding

### NPC*SPAWN*\*

**Purpose:** Defines spawn points for NPCs with type information.

**Names:** `NPC_SPAWN_<type>`, `OL_NPC_SPAWN_<type>`

**Requirements:**

- Empty object at ground level
- Rotation indicates initial facing direction
- Type is extracted from name (e.g., `NPC_SPAWN_librarian` → type "librarian")

**Godot Result:** Marker with metadata, or spawned NPC if `FabNPCSpawner` is active.

**Metadata Set:**

- `fab_npc_type`: The NPC type (e.g., "librarian")
- `fab_role`: "npc_spawn"

**Standard Types:**

- `librarian` - Library staff NPC
- `scholar` - Academic/research NPC
- `student` - Student NPC
- `guard` - Security NPC
- `merchant` - Shop/vendor NPC
- `default` - Generic NPC fallback

### ITEM*SPAWN*\*

**Purpose:** Defines spawn points for interactable items.

**Names:** `ITEM_SPAWN_<id>`, `OL_ITEM_SPAWN_<id>`

**Requirements:**

- Empty object at item position
- ID extracted from name (e.g., `ITEM_SPAWN_book_01` → id "book")

**Godot Result:** Marker with metadata, or spawned item if `FabItemSpawner` is active.

**Metadata Set:**

- `fab_item_id`: The item type (e.g., "book")
- `fab_item_variant`: Additional variant info (e.g., "01")
- `fab_role`: "item_spawn"

### AUDIO*ZONE*\*

**Purpose:** Defines areas with ambient audio.

**Names:** `AUDIO_ZONE_<name>`, `OL_AUDIO_ZONE_<name>`

**Requirements:**

- Mesh object defining the audio zone volume
- Name identifies the zone (e.g., `AUDIO_ZONE_reading_room`)

**Godot Result:** `Area3D` with `AudioStreamPlayer3D` child.

**Metadata Set:**

- `fab_audio_zone`: Zone name
- `fab_role`: "audio_zone"

### WAYPOINT\_\*

**Purpose:** Defines patrol path points for NPC navigation.

**Names:** `WAYPOINT_<n>`, `OL_WAYPOINT_<n>`

**Requirements:**

- Empty objects at patrol positions
- Number suffix determines order (e.g., `WAYPOINT_01`, `WAYPOINT_02`)

**Godot Result:** `Path3D` created from sorted waypoints.

**Metadata Set:**

- `fab_waypoint_index`: Numeric index
- `fab_role`: "waypoint"

### INTERACT\_\*

**Purpose:** Marks objects as interactable without defining specific behavior.

**Names:** `INTERACT_<name>`, `OL_INTERACT_<name>`

**Requirements:**

- Any node type

**Godot Result:** Node with `fab_interact = true` metadata.

## Physics Layer Convention

Append `_LAYER<n>` to collision marker names to set specific physics layers:

```
COLLIDER_LAYER2_furniture  → collision_layer = 2 (bit 1)
COLLIDER_LAYER3_props      → collision_layer = 4 (bit 2)
TRIGGER_LAYER4_zone        → area collision_layer = 8 (bit 3)
```

## Blender Export Requirements

1. **Apply Transforms:** All marker objects should have transforms applied
2. **World Space:** Use world-space coordinates
3. **Include in Export:** Ensure markers are in the exported collection/selection
4. **Empties for Spawns:** Use Empty objects for spawn points
5. **Meshes for Volumes:** Use Mesh objects for collision/trigger/nav volumes

## Pipeline Stages

The markers are processed at different points:

1. **Blender `navmesh.py` Stage:** Generates NAV\_ meshes from floor geometry
2. **Blender `export.py` Stage:** Adds NPC*SPAWN*, WAYPOINT\_ markers
3. **Godot `post_import.gd`:** Converts markers at import time (editor)
4. **Godot `FabLevelLoader.gd`:** Converts markers at runtime (if not pre-processed)

## Validation

The `godot_integration_v001.yaml` gate validates:

- Exactly 1 SPAWN_PLAYER marker exists
- At least 1 COLLIDER\_ marker exists (if `require_colliders: true`)
- NAV\_ markers exist (if `require_navmesh: true`)
- NPC*SPAWN* markers exist (if `require_npc_spawns: true`)

Warnings are issued for:

- NPC spawns without navigation meshes
- Waypoints without NPC spawns

## Examples

### Minimal Level Setup

```
SPAWN_PLAYER           # Player spawn at origin
COLLIDER_GROUND        # Ground collision mesh
COLLIDER_WALLS         # Wall collision mesh
```

### Full Gameplay Setup

```
SPAWN_PLAYER           # Player spawn
COLLIDER_GROUND        # Ground collision
COLLIDER_WALLS         # Wall collision
TRIGGER_entrance       # Entry trigger
NAV_WALKABLE           # Navigation mesh
NPC_SPAWN_librarian    # NPC at desk
NPC_SPAWN_scholar_01   # NPC in alcove
WAYPOINT_01            # Patrol point 1
WAYPOINT_02            # Patrol point 2
WAYPOINT_03            # Patrol point 3
AUDIO_ZONE_reading     # Ambient audio zone
```

## Cogito Integration

When `use_cogito: true` is set on `FabLevelLoader`:

- `cogito_player_scene` is spawned instead of basic player
- NPC*SPAWN* markers spawn CogitoNPC instances
- ITEM*SPAWN* markers spawn Cogito interactables
- Patrol paths are assigned to NPCs with `set_patrol_path()`
- Audio zones integrate with Cogito's audio system

## Version History

- **v1.1** (2024-12): Added NAV*, NPC_SPAWN*, ITEM*SPAWN*, AUDIO*ZONE*, WAYPOINT\_ markers
- **v1.0** (2024-11): Initial contract with SPAWN*PLAYER, COLLIDER*, TRIGGER*, INTERACT*
