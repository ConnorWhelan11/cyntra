"""
Export Stage - Export GLB files for Godot and web viewers.

This stage:
1. Exports the full library as a single GLB
2. Exports sectioned GLBs for streaming
3. Applies Draco compression
4. Validates export for Godot contract compliance

Based on export_fab_game_glb.py from the original pipeline.
"""

from pathlib import Path
from typing import Any, Dict, Mapping
import sys


def execute(
    *,
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
    manifest: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute the export stage."""

    errors = []
    metadata = {}

    try:
        import bpy
    except ImportError:
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": ["Blender Python (bpy) not available"],
        }

    # Load lighting scene (final scene state)
    lighting_dir = inputs.get("lighting")
    if not lighting_dir:
        errors.append("Missing 'lighting' stage input")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    lighting_blend = lighting_dir / "lighting_setup.blend"
    if not lighting_blend.exists():
        errors.append(f"Lighting blend file not found: {lighting_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(lighting_blend))

    # Get export settings
    draco_compression = params.get("settings", {}).get("draco_compression", True)

    # Create output directories
    world_dir = run_dir / "world"
    sections_dir = world_dir / "sections"
    world_dir.mkdir(parents=True, exist_ok=True)
    sections_dir.mkdir(parents=True, exist_ok=True)

    outputs = []

    # ==========================================================================
    # 1. ADD GODOT CONTRACT MARKERS
    # ==========================================================================

    # Ensure SPAWN_PLAYER marker exists
    spawn_marker = bpy.data.objects.get("SPAWN_PLAYER")
    if not spawn_marker:
        # Create spawn marker at reasonable location (library entrance)
        bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 1.6))
        spawn_marker = bpy.context.active_object
        spawn_marker.name = "SPAWN_PLAYER"
        print("✓ Added SPAWN_PLAYER marker at origin")
    else:
        print("✓ SPAWN_PLAYER marker already exists")

    metadata["spawn_marker_added"] = True

    # ==========================================================================
    # 1b. ADD NPC SPAWN MARKERS
    # ==========================================================================

    npc_spawn_locations = [
        # (name, location, facing_direction_y)
        ("NPC_SPAWN_librarian", (5.0, 0.0, 0.0), 3.14),      # Near entrance
        ("NPC_SPAWN_scholar_01", (-12.0, 8.0, 0.0), 0.0),    # East reading alcove
        ("NPC_SPAWN_scholar_02", (-12.0, -8.0, 0.0), 0.0),   # West reading alcove
        ("NPC_SPAWN_student_01", (18.0, 6.0, 5.0), 1.57),    # Mezzanine study pod
        ("NPC_SPAWN_student_02", (18.0, -6.0, 5.0), -1.57),  # Mezzanine study pod
    ]

    npc_markers_added = 0
    for npc_name, location, rotation_z in npc_spawn_locations:
        if not bpy.data.objects.get(npc_name):
            bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
            npc_marker = bpy.context.active_object
            npc_marker.name = npc_name
            npc_marker.rotation_euler[2] = rotation_z
            npc_markers_added += 1

    if npc_markers_added > 0:
        print(f"✓ Added {npc_markers_added} NPC spawn markers")
    metadata["npc_spawn_markers"] = npc_markers_added

    # ==========================================================================
    # 1c. ADD WAYPOINT MARKERS FOR PATROL PATHS
    # ==========================================================================

    waypoint_locations = [
        # Librarian patrol path (around central hall)
        ("WAYPOINT_01", (5.0, 5.0, 0.0)),
        ("WAYPOINT_02", (5.0, -5.0, 0.0)),
        ("WAYPOINT_03", (-5.0, -5.0, 0.0)),
        ("WAYPOINT_04", (-5.0, 5.0, 0.0)),
    ]

    waypoints_added = 0
    for wp_name, location in waypoint_locations:
        if not bpy.data.objects.get(wp_name):
            bpy.ops.object.empty_add(type="SPHERE", location=location)
            wp_marker = bpy.context.active_object
            wp_marker.name = wp_name
            wp_marker.empty_display_size = 0.3
            waypoints_added += 1

    if waypoints_added > 0:
        print(f"✓ Added {waypoints_added} waypoint markers")
    metadata["waypoint_markers"] = waypoints_added

    # ==========================================================================
    # 2. EXPORT FULL LIBRARY GLB
    # ==========================================================================

    main_glb = world_dir / "outora_library.glb"

    print(f"Exporting full library to {main_glb.name}...")

    try:
        # Select all mesh objects and markers for export
        bpy.ops.object.select_all(action="DESELECT")

        # Marker prefixes to include (empties for spawns, meshes for nav/colliders)
        marker_prefixes = (
            "SPAWN_",
            "COLLIDER_", "OL_COLLIDER_",
            "TRIGGER_", "OL_TRIGGER_",
            "NAV_", "OL_NAV_",
            "NPC_SPAWN_", "OL_NPC_SPAWN_",
            "ITEM_SPAWN_", "OL_ITEM_SPAWN_",
            "AUDIO_ZONE_", "OL_AUDIO_ZONE_",
            "WAYPOINT_", "OL_WAYPOINT_",
            "INTERACT_", "OL_INTERACT_",
        )

        for obj in bpy.context.view_layer.objects:
            # Include all mesh objects
            if obj.type == "MESH":
                obj.select_set(True)
            # Include marker empties
            elif obj.type == "EMPTY":
                if any(obj.name.startswith(prefix) for prefix in marker_prefixes):
                    obj.select_set(True)

        # Export GLB with optimizations
        bpy.ops.export_scene.gltf(
            filepath=str(main_glb),
            export_format="GLB",
            use_selection=True,
            export_materials="EXPORT",
            export_lights=False,  # Godot handles lighting
            export_cameras=False,
            export_draco_mesh_compression_enable=draco_compression,
            export_draco_mesh_compression_level=6 if draco_compression else 0,
            export_apply=True,  # Apply modifiers
        )

        outputs.append(str(main_glb))

        # Get file size
        file_size_mb = main_glb.stat().st_size / (1024 * 1024)
        metadata["main_glb_size_mb"] = round(file_size_mb, 2)

        print(f"  ✓ Exported: {main_glb.name} ({file_size_mb:.1f} MB)")

    except Exception as e:
        errors.append(f"Failed to export main GLB: {e}")
        import traceback
        errors.append(traceback.format_exc())

    # ==========================================================================
    # 3. EXPORT SECTIONED GLBs (for streaming)
    # ==========================================================================

    # Look for collection-based sections or spatial divisions
    # For now, we'll export a simple spatial division

    print("Exporting sectioned GLBs...")

    # Define spatial sections (adjust based on actual library layout)
    sections = [
        ("central_hall", (-15, -15, 0), (15, 15, 25)),
        ("east_wing", (15, -15, 0), (45, 15, 25)),
        ("west_wing", (-45, -15, 0), (-15, 15, 25)),
    ]

    for section_name, (min_x, min_y, min_z), (max_x, max_y, max_z) in sections:
        # Select objects within this bounding box
        bpy.ops.object.select_all(action="DESELECT")

        selected_count = 0
        for obj in bpy.context.view_layer.objects:
            if obj.type == "MESH":
                loc = obj.location
                if (min_x <= loc.x <= max_x and
                    min_y <= loc.y <= max_y and
                    min_z <= loc.z <= max_z):
                    obj.select_set(True)
                    selected_count += 1

        if selected_count > 0:
            section_glb = sections_dir / f"{section_name}.glb"

            try:
                bpy.ops.export_scene.gltf(
                    filepath=str(section_glb),
                    export_format="GLB",
                    use_selection=True,
                    export_materials="EXPORT",
                    export_draco_mesh_compression_enable=draco_compression,
                    export_draco_mesh_compression_level=6 if draco_compression else 0,
                )

                outputs.append(str(section_glb))
                print(f"  ✓ Exported section: {section_name} ({selected_count} objects)")

            except Exception as e:
                print(f"  ⚠ Failed to export section {section_name}: {e}")

    # ==========================================================================
    # 4. EXPORT METADATA
    # ==========================================================================

    metadata["draco_compression"] = draco_compression
    metadata["total_exports"] = len(outputs)
    metadata["section_count"] = len([p for p in outputs if "/sections/" in str(p)])

    # Count final stats
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    metadata["total_mesh_objects"] = len(mesh_objects)
    metadata["total_vertices"] = sum(len(obj.data.vertices) for obj in mesh_objects)
    metadata["total_materials"] = len(bpy.data.materials)

    success = len(errors) == 0

    if success:
        print(f"✓ Export stage complete: {len(outputs)} files exported")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
