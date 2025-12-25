# Fab Pipeline Hardening Plan: Blender → Godot Integration

## Overview

Prepare the glia-fab pipeline for end-to-end testing by closing gaps in:
1. Navigation mesh generation for NPC pathfinding
2. Extended marker conventions for game entities
3. Cogito template integration for full gameplay testing
4. Performance gate for runtime validation
5. Post-import automation in Godot
6. Documentation of the marker contract

---

## Phase 1: Navigation Mesh Generation

### Goal
Enable NPC pathfinding by generating NAV_ markers from walkable geometry in Blender.

### Implementation

#### 1.1 Create Navigation Stage
**File:** `fab/worlds/outora_library/blender/stages/navmesh.py`

```python
def execute(*, run_dir, stage_dir, inputs, params, manifest):
    """
    Generate NAV_ meshes using Blender's navmesh baking.

    Strategy:
    1. Load baked blend from previous stage
    2. Select all floor geometry (ground_floor, mezzanine collections)
    3. Apply Blender's navmesh modifier to generate accurate walkable mesh
    4. Export as NAV_FLOOR, NAV_MEZZANINE mesh objects
    """
    # Load baked scene
    baked_blend = inputs["bake"] / "world" / "outora_library_baked.blend"
    bpy.ops.wm.open_mainfile(filepath=str(baked_blend))

    # Collect floor geometry
    floor_objects = []
    for col_name in ["OL_GroundFloor", "OL_MezzanineFloor"]:
        col = bpy.data.collections.get(col_name)
        if col:
            floor_objects.extend([o for o in col.objects if o.type == 'MESH'])

    # Create navmesh using Blender's bake
    bpy.ops.object.select_all(action='DESELECT')
    for obj in floor_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = floor_objects[0]

    # Bake navigation mesh
    bpy.ops.mesh.navmesh_make()

    # Rename result and organize
    navmesh = bpy.context.active_object
    navmesh.name = "NAV_WALKABLE"
    # ... organize into OL_Navigation collection
```

**Walkable surfaces:**
- `OL_GroundFloor` collection → NAV_GROUND
- `OL_MezzanineFloor` collection → NAV_MEZZANINE
- Stair geometry → NAV_STAIRS (vertical connections)

#### 1.2 Update world.yaml
**File:** `fab/worlds/outora_library/world.yaml`

Add stage after `bake`, before `materials`:
```yaml
stages:
  - id: bake
    # ...existing...

  - id: navmesh
    type: blender
    script: blender/stages/navmesh.py
    requires: [bake]
    outputs: ["stages/navmesh/"]

  - id: materials
    requires: [navmesh]  # Update dependency
```

#### 1.3 Navmesh Generation Approach
**Using Blender's Built-in Navmesh Bake:**
- Apply Blender's `bpy.ops.mesh.navmesh_make()` to floor geometry
- More accurate navigation that respects actual walkable surfaces
- Handles stairs and ramps correctly with vertical connections
- Slower than simplified planes but better pathfinding quality

### Files to Create/Modify
- `fab/worlds/outora_library/blender/stages/navmesh.py` (new)
- `fab/worlds/outora_library/world.yaml` (add stage)
- `fab/outora-library/blender/sverchok_layout_v2.py` (verify floor outputs)

---

## Phase 2: Extended Marker Conventions

### Goal
Standardize markers for NPCs, items, audio zones, and other game entities.

### 2.1 New Marker Types

| Marker Prefix | Purpose | Godot Conversion |
|---------------|---------|------------------|
| `NAV_` | Navigation mesh | NavigationRegion3D |
| `NPC_SPAWN_<type>` | NPC spawn point | Marker3D + metadata |
| `ITEM_SPAWN_<id>` | Item spawn | Marker3D + resource ref |
| `AUDIO_ZONE_<name>` | Ambient audio area | Area3D + AudioStreamPlayer3D |
| `LIGHT_PROBE_<n>` | Lightmap probe position | LightmapProbe |
| `WAYPOINT_<n>` | Patrol path point | Path3D/PathFollow3D |

### 2.2 Update Game Contract
**File:** `fab/outora-library/src/outora_library/game_contract.py`

```python
class FabRole(str, Enum):
    SPAWN_PLAYER = "spawn_player"
    COLLIDER = "collider"
    TRIGGER = "trigger"
    INTERACT = "interact"
    # New roles
    NAVMESH = "navmesh"
    NPC_SPAWN = "npc_spawn"
    ITEM_SPAWN = "item_spawn"
    AUDIO_ZONE = "audio_zone"
    WAYPOINT = "waypoint"

_NAME_ALIASES: dict[FabRole, tuple[str, ...]] = {
    # ...existing...
    FabRole.NAVMESH: ("NAV_", "OL_NAV_"),
    FabRole.NPC_SPAWN: ("NPC_SPAWN_", "OL_NPC_SPAWN_"),
    FabRole.ITEM_SPAWN: ("ITEM_SPAWN_", "OL_ITEM_SPAWN_"),
    FabRole.AUDIO_ZONE: ("AUDIO_ZONE_", "OL_AUDIO_ZONE_"),
    FabRole.WAYPOINT: ("WAYPOINT_", "OL_WAYPOINT_"),
}
```

### 2.3 Add Markers in Export Stage
**File:** `fab/worlds/outora_library/blender/stages/export.py`

Extend to emit NPC spawn points at strategic locations:
- Library entrance (NPC_SPAWN_librarian)
- Reading alcoves (NPC_SPAWN_scholar)
- Near study pods (NPC_SPAWN_student)

### Files to Modify
- `fab/outora-library/src/outora_library/game_contract.py`
- `fab/worlds/outora_library/blender/stages/export.py`
- `fab/gates/godot_integration_v001.yaml` (add new marker validation)

---

## Phase 3: Cogito Integration (Toggle in Existing Template)

### Goal
Enable full gameplay testing with Cogito's player controller, NPC system, and interactions via a toggle flag.

### 3.1 Integration Strategy
Add `use_cogito: bool` export flag to FabLevelLoader that swaps between:
- **Simple mode (default):** Lightweight FabPlayerController for asset validation
- **Cogito mode:** Full CogitoPlayer with interactions, inventory, and NPC support

### 3.2 Update FabLevelLoader with Cogito Toggle
**File:** `fab/vault/godot/templates/fab_game_template/project/scripts/FabLevelLoader.gd`

```gdscript
extends Node3D

@export var level_path: String = "res://assets/level.glb"
@export var use_cogito: bool = false  # NEW: Toggle Cogito mode
@export var player_scene: PackedScene = preload("res://scenes/Player.tscn")
@export var cogito_player_scene: PackedScene  # Set to CogitoPlayer.tscn when available
@export var show_collider_meshes: bool = false
@export var show_trigger_meshes: bool = false

func _ready() -> void:
    # ... existing level loading ...
    _apply_fab_conventions(level_instance)

func _apply_fab_conventions(root: Node) -> void:
    var spawn := _find_first_spawn(root)

    # Choose player based on mode
    if use_cogito and cogito_player_scene:
        _spawn_cogito_player(spawn)
        _setup_cogito_systems(root)
    else:
        _spawn_player(spawn)

    # Common conventions (both modes)
    _convert_colliders(root)
    _convert_triggers(root)
    _setup_navigation(root)  # NAV_ → NavigationRegion3D

    # Cogito-only conventions
    if use_cogito:
        _spawn_npcs(root)         # NPC_SPAWN_ → CogitoNPC
        _spawn_items(root)        # ITEM_SPAWN_ → Interactables
        _setup_audio_zones(root)  # AUDIO_ZONE_ → ambient audio
        _setup_patrol_paths(root) # WAYPOINT_ → Path3D

func _spawn_cogito_player(spawn_node: Node3D) -> void:
    var player := cogito_player_scene.instantiate()
    add_child(player)
    if spawn_node:
        player.global_transform = spawn_node.global_transform
    # Setup Cogito-specific things (HUD, inventory, etc.)

func _setup_cogito_systems(root: Node) -> void:
    # Initialize Cogito singletons if needed
    # Connect interaction system
    pass
```

### 3.3 Add Cogito Addon to Template
**File:** `fab/vault/godot/templates/fab_game_template/project/project.godot`

Add Cogito as optional autoload:
```ini
[autoload]
# Only enabled when use_cogito=true
CogitoSceneManager="*res://addons/cogito/Singletons/cogito_scene_manager.gd"
```

Copy Cogito addon to template:
```bash
cp -r fab/vault/godot/templates/cogito/project/addons/cogito \
      fab/vault/godot/templates/fab_game_template/project/addons/
```

### 3.4 NPC Spawner Component
**File:** `fab/vault/godot/templates/fab_game_template/project/scripts/FabNPCSpawner.gd`

```gdscript
class_name FabNPCSpawner
extends Node

const NPC_TYPES := {
    "librarian": preload("res://scenes/npcs/librarian.tscn"),
    "scholar": preload("res://scenes/npcs/scholar.tscn"),
    "student": preload("res://scenes/npcs/student.tscn"),
    "default": preload("res://scenes/npcs/generic_npc.tscn"),
}

static func spawn_at_markers(root: Node) -> Array[Node]:
    var spawned: Array[Node] = []
    var markers := _find_npc_spawn_markers(root)

    for marker in markers:
        var npc_type := _extract_type(marker.name)
        var scene: PackedScene = NPC_TYPES.get(npc_type, NPC_TYPES["default"])
        var npc := scene.instantiate()
        npc.global_transform = marker.global_transform

        # Assign patrol path if WAYPOINT_ markers nearby
        var waypoints := _find_nearby_waypoints(root, marker.global_position, 20.0)
        if not waypoints.is_empty() and npc.has_method("set_patrol_path"):
            npc.set_patrol_path(waypoints)

        root.add_child(npc)
        spawned.append(npc)

    return spawned

static func _extract_type(name: String) -> String:
    # NPC_SPAWN_librarian → librarian
    var parts := name.replace("OL_", "").replace("NPC_SPAWN_", "").split("_")
    return parts[0].to_lower() if parts.size() > 0 else "default"
```

### 3.5 Template NPC Scene
**File:** `fab/vault/godot/templates/fab_game_template/project/scenes/npcs/generic_npc.tscn`

Create a CogitoNPC-based template with:
- Basic patrol/idle state machine
- Interaction component for dialogue
- NavigationAgent3D for pathfinding
- Beehave behavior tree (optional)

### Files to Modify/Create
- `fab/vault/godot/templates/fab_game_template/project/scripts/FabLevelLoader.gd` (add toggle)
- `fab/vault/godot/templates/fab_game_template/project/scripts/FabNPCSpawner.gd` (new)
- `fab/vault/godot/templates/fab_game_template/project/scripts/FabItemSpawner.gd` (new)
- `fab/vault/godot/templates/fab_game_template/project/scenes/npcs/generic_npc.tscn` (new)
- `fab/vault/godot/templates/fab_game_template/project/addons/cogito/` (copy from cogito template)

---

## Phase 4: Performance Gate

### Goal
Automated runtime performance validation in headless Godot.

### 4.1 Gate Configuration
**File:** `fab/gates/godot_performance_v001.yaml`

```yaml
gate_config_id: godot_performance_v001
category: engine_performance
schema_version: "1.0"

performance:
  target_fps: 30          # Minimum acceptable FPS
  max_frame_time_ms: 33.3 # 30 FPS ceiling
  memory_budget_mb: 512
  startup_time_max_ms: 10000
  test_duration_seconds: 10

godot:
  test_scene: res://scenes/perf_test.tscn
  export_preset: Web

thresholds:
  fps_floor: 25           # Hard fail below this
  frame_spike_max_ms: 100 # Single frame spike limit
  memory_spike_max_mb: 768

hard_fail_codes:
  - PERF_FPS_BELOW_FLOOR
  - PERF_STARTUP_TIMEOUT
  - PERF_MEMORY_EXCEEDED
  - PERF_FRAME_SPIKE

repair_playbook:
  PERF_FPS_BELOW_FLOOR:
    priority: 1
    instructions: |
      FPS below minimum threshold. Consider:
      - Reducing draw calls via mesh merging
      - Lowering material complexity
      - Enabling occlusion culling
      - Adding LOD levels
  PERF_MEMORY_EXCEEDED:
    priority: 2
    instructions: |
      Memory budget exceeded. Consider:
      - Texture compression (VRAM streaming)
      - Mesh simplification
      - Reducing material instances
```

### 4.2 Performance Test Script (Godot)
**File:** `fab/vault/godot/templates/fab_game_template/project/scripts/FabPerfTest.gd`

```gdscript
extends Node

var _frame_times := []
var _start_time := 0.0
var _duration_s := 10.0
var _output_path := ""

func _ready() -> void:
    _parse_args()
    _start_time = Time.get_ticks_msec() / 1000.0

func _process(delta: float) -> void:
    _frame_times.append(delta * 1000.0)  # ms

    if Time.get_ticks_msec() / 1000.0 - _start_time > _duration_s:
        _write_results()
        get_tree().quit()

func _write_results() -> void:
    var results := {
        "duration_s": _duration_s,
        "frames_rendered": _frame_times.size(),
        "avg_fps": _frame_times.size() / _duration_s,
        "avg_frame_time_ms": _average(_frame_times),
        "min_frame_time_ms": _frame_times.min(),
        "max_frame_time_ms": _frame_times.max(),
        "memory_peak_mb": OS.get_static_memory_peak_usage() / 1048576.0,
        "startup_time_ms": _start_time * 1000.0,
    }
    var file := FileAccess.open(_output_path, FileAccess.WRITE)
    file.store_string(JSON.stringify(results, "\t"))
```

### 4.3 Performance Gate Runner
**File:** `cyntra-kernel/src/cyntra/fab/performance_gate.py`

```python
def run_performance_gate(
    asset_path: Path,
    config: PerformanceGateConfig,
    godot_bin: Path,
    output_dir: Path,
) -> PerformanceGateResult:
    """
    1. Setup Godot project with asset
    2. Run headless with FabPerfTest.gd
    3. Parse metrics JSON
    4. Evaluate against thresholds
    5. Return verdict with scores and failures
    """
```

### 4.4 Add to World Pipeline
**File:** `fab/worlds/outora_library/world.yaml`

```yaml
stages:
  # ...existing stages...

  - id: validate
    type: gate
    requires: [export]
    gates:
      - fab/gates/interior_library_v001.yaml
      - fab/gates/godot_integration_v001.yaml

  - id: perf_validate
    type: gate
    requires: [godot]
    optional: true
    gates:
      - fab/gates/godot_performance_v001.yaml
```

### Files to Create
- `fab/gates/godot_performance_v001.yaml` (new)
- `cyntra-kernel/src/cyntra/fab/performance_gate.py` (new)
- `fab/vault/godot/templates/fab_game_template/project/scripts/FabPerfTest.gd` (new)

---

## Phase 5: Post-Import Automation

### Goal
Extend Godot post_import.gd to handle all marker types automatically.

### 5.1 Extended Post-Import Script
**File:** `fab/vault/godot/templates/fab_game_template/project/addons/fab_importer/post_import.gd`

```gdscript
@tool
extends EditorScenePostImport

func _post_import(scene: Node) -> Object:
    _process_colliders(scene)
    _process_triggers(scene)
    _process_navigation(scene)      # NEW: NAV_ → NavigationRegion3D
    _process_npc_spawns(scene)      # NEW: NPC_SPAWN_ → Marker3D with meta
    _process_item_spawns(scene)     # NEW: ITEM_SPAWN_ → Marker3D with meta
    _process_audio_zones(scene)     # NEW: AUDIO_ZONE_ → Area3D
    _process_physics_layers(scene)  # NEW: Layer assignment from suffix
    return scene

func _process_navigation(root: Node) -> void:
    var nav_meshes := _find_marker_meshes(root, ["NAV_", "OL_NAV_"])
    for mesh in nav_meshes:
        var nav_region := NavigationRegion3D.new()
        nav_region.name = "NavRegion_%s" % mesh.name
        nav_region.transform = mesh.transform

        # Create navigation mesh from geometry
        var nav_mesh := NavigationMesh.new()
        nav_mesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES
        nav_mesh.create_from_mesh(mesh.mesh)
        nav_region.navigation_mesh = nav_mesh

        mesh.get_parent().add_child(nav_region)
        mesh.queue_free()  # Remove source mesh

func _process_npc_spawns(root: Node) -> void:
    var spawns := _find_marker_nodes(root, ["NPC_SPAWN_", "OL_NPC_SPAWN_"])
    for spawn in spawns:
        spawn.set_meta("fab_npc_type", _extract_suffix(spawn.name, "NPC_SPAWN_"))
        spawn.set_meta("fab_role", "npc_spawn")

func _process_physics_layers(root: Node) -> void:
    # Parse COLLIDER_LAYER2_name → set collision_layer = 2
    for node in _find_all_static_bodies(root):
        var layer := _extract_layer_from_name(node.name)
        if layer > 0:
            node.collision_layer = 1 << (layer - 1)
```

### 5.2 Runtime FabTriggerArea Enhancement
**File:** `fab/vault/godot/templates/fab_game_template/project/scripts/FabTriggerArea.gd`

```gdscript
extends Area3D

signal fab_trigger_entered(trigger_name: String, body: Node)
signal fab_trigger_exited(trigger_name: String, body: Node)

@export var trigger_name: String = ""
@export var one_shot: bool = false
@export var require_player: bool = true

var _triggered := false

func _ready() -> void:
    body_entered.connect(_on_body_entered)
    body_exited.connect(_on_body_exited)

func _on_body_entered(body: Node) -> void:
    if require_player and not body.is_in_group("player"):
        return
    if one_shot and _triggered:
        return
    _triggered = true
    fab_trigger_entered.emit(trigger_name, body)
    # Global event bus integration
    if Engine.has_singleton("FabEvents"):
        Engine.get_singleton("FabEvents").trigger_entered(trigger_name, body)

func _on_body_exited(body: Node) -> void:
    if require_player and not body.is_in_group("player"):
        return
    fab_trigger_exited.emit(trigger_name, body)
```

### Files to Modify
- `fab/vault/godot/templates/fab_game_template/project/addons/fab_importer/post_import.gd`
- `fab/vault/godot/templates/fab_game_template/project/scripts/FabTriggerArea.gd`
- `fab/vault/godot/templates/fab_game_template/project/scripts/FabLevelLoader.gd`

---

## Phase 6: Documentation

### Goal
Document the complete marker contract for agents and developers.

### 6.1 Marker Contract Documentation
**File:** `docs/fab-godot-marker-contract.md`

```markdown
# Fab → Godot Marker Contract v1.1

## Overview
Markers are empty objects in Blender that control Godot scene setup at import time.

## Required Markers

### SPAWN_PLAYER
- **Names:** `SPAWN_PLAYER`, `OL_SPAWN_PLAYER`
- **Count:** Exactly 1 per level
- **Position:** ~1.6m above floor (eye height)
- **Godot:** Player spawns here

### COLLIDER_*
- **Names:** `COLLIDER_<name>`, `OL_COLLIDER_<name>`
- **Count:** At least 1
- **Geometry:** Simplified collision mesh
- **Godot:** StaticBody3D with trimesh shape

## Optional Markers

### NAV_*
- **Names:** `NAV_<zone>`, `OL_NAV_<zone>`
- **Geometry:** Flat walkable surface
- **Godot:** NavigationRegion3D for pathfinding

### NPC_SPAWN_<type>
- **Names:** `NPC_SPAWN_librarian`, `OL_NPC_SPAWN_scholar`
- **Position:** Ground level
- **Godot:** Spawns NPC of specified type

### ITEM_SPAWN_<id>
- **Names:** `ITEM_SPAWN_book_01`
- **Godot:** Spawns interactable item

### TRIGGER_<name>
- **Names:** `TRIGGER_entrance`, `OL_TRIGGER_secret`
- **Geometry:** Volume mesh
- **Godot:** Area3D with signals

### AUDIO_ZONE_<name>
- **Names:** `AUDIO_ZONE_reading_room`
- **Geometry:** Volume mesh
- **Godot:** Area3D + AudioStreamPlayer3D

### WAYPOINT_<n>
- **Names:** `WAYPOINT_01`, `WAYPOINT_02`
- **Position:** Patrol path points
- **Godot:** Path3D for NPC navigation

## Physics Layer Convention
Append `_LAYER<n>` to set collision layer:
- `COLLIDER_LAYER2_furniture` → collision_layer = 2
- `TRIGGER_LAYER3_zone` → area collision_layer = 3

## Blender Export Requirements
- All markers must be EMPTY objects (no geometry for spawns)
- NAV_/COLLIDER_/TRIGGER_ markers have mesh children
- Use world-space coordinates (apply transforms)
```

### Files to Create
- `docs/fab-godot-marker-contract.md` (new)
- Update `CLAUDE.md` with reference to marker contract

---

## Implementation Order (All Phases Together)

Execute all phases in parallel tracks where possible:

```
Track A (Blender Pipeline):     Track B (Godot Template):       Track C (Gates & Docs):
─────────────────────────────   ────────────────────────────    ─────────────────────────
Phase 1: navmesh.py             Phase 3: FabLevelLoader toggle  Phase 4: perf gate config
Phase 2: export.py markers      Phase 3: FabNPCSpawner.gd       Phase 4: FabPerfTest.gd
                                Phase 5: post_import.gd         Phase 6: marker-contract.md
                                Phase 3: Copy Cogito addon
```

| Phase | Files | Effort |
|-------|-------|--------|
| Phase 1: Navmesh | `navmesh.py`, `world.yaml` | 4h |
| Phase 2: Markers | `game_contract.py`, `export.py`, `godot_integration_v001.yaml` | 2h |
| Phase 3: Cogito | `FabLevelLoader.gd`, `FabNPCSpawner.gd`, `generic_npc.tscn`, copy addon | 5h |
| Phase 4: Perf Gate | `godot_performance_v001.yaml`, `performance_gate.py`, `FabPerfTest.gd` | 4h |
| Phase 5: Post-import | `post_import.gd`, `FabTriggerArea.gd` | 3h |
| Phase 6: Docs | `fab-godot-marker-contract.md` | 1h |

**Total estimated effort: ~19 hours**

---

## Testing Checklist

After implementation, validate with:

```bash
# 1. Run full pipeline
cd cyntra-kernel
cyntra fab-world --config outora_library --stage all

# 2. Verify navmesh generation
ls .cyntra/runs/latest/stages/navmesh/

# 3. Check marker export
python -c "
import pygltflib
gltf = pygltflib.GLTF2().load('.cyntra/runs/latest/world/outora_library.glb')
for node in gltf.nodes:
    if 'NAV_' in node.name or 'NPC_SPAWN' in node.name:
        print(node.name)
"

# 4. Run Godot import test
fab-godot --asset output/outora_library.glb \
          --template fab_cogito_template \
          --test headless

# 5. Verify NPC spawning
# Open Godot project and check scene tree for CogitoNPC instances

# 6. Run performance gate
cyntra fab-gate --config godot_performance_v001 --asset output/outora_library.glb
```

---

## Critical Files Summary

### New Files
| File | Phase | Purpose |
|------|-------|---------|
| `fab/worlds/outora_library/blender/stages/navmesh.py` | 1 | Blender navmesh bake stage |
| `fab/vault/godot/templates/fab_game_template/project/scripts/FabNPCSpawner.gd` | 3 | NPC spawning from markers |
| `fab/vault/godot/templates/fab_game_template/project/scripts/FabItemSpawner.gd` | 3 | Item spawning from markers |
| `fab/vault/godot/templates/fab_game_template/project/scenes/npcs/generic_npc.tscn` | 3 | Template NPC scene |
| `fab/vault/godot/templates/fab_game_template/project/scripts/FabPerfTest.gd` | 4 | Performance test runner |
| `fab/gates/godot_performance_v001.yaml` | 4 | Performance gate config |
| `cyntra-kernel/src/cyntra/fab/performance_gate.py` | 4 | Performance gate runner |
| `docs/fab-godot-marker-contract.md` | 6 | Marker documentation |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `fab/worlds/outora_library/world.yaml` | 1 | Add navmesh stage |
| `fab/outora-library/src/outora_library/game_contract.py` | 2 | Add NAV_, NPC_SPAWN_, etc. roles |
| `fab/worlds/outora_library/blender/stages/export.py` | 2 | Emit NPC spawn markers |
| `fab/gates/godot_integration_v001.yaml` | 2 | Validate new marker types |
| `fab/vault/godot/templates/fab_game_template/project/scripts/FabLevelLoader.gd` | 3 | Add use_cogito toggle, nav/NPC setup |
| `fab/vault/godot/templates/fab_game_template/project/addons/fab_importer/post_import.gd` | 5 | Handle all marker types |
| `fab/vault/godot/templates/fab_game_template/project/scripts/FabTriggerArea.gd` | 5 | Add signals, one-shot, player filter |

### Copy Operations
| Source | Destination | Phase |
|--------|-------------|-------|
| `fab/vault/godot/templates/cogito/project/addons/cogito/` | `fab/vault/godot/templates/fab_game_template/project/addons/cogito/` | 3 |
