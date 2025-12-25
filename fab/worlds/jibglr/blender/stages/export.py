"""
Export Stage - Export GLB for Godot and web viewers.

Exports the forest clearing with all gameplay markers.

Implements the standard Fab World stage contract.
"""

from pathlib import Path
from typing import Any, Dict, Mapping


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

    # Load lighting scene
    lighting_dir = inputs.get("lighting")
    if not lighting_dir:
        errors.append("Missing 'lighting' stage input")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    lighting_blend = lighting_dir / "lighting_setup.blend"
    if not lighting_blend.exists():
        errors.append(f"Lighting blend not found: {lighting_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(lighting_blend))

    # Get export settings
    draco_compression = params.get("settings", {}).get("draco_compression", True)

    # Create output directory
    world_dir = run_dir / "world"
    world_dir.mkdir(parents=True, exist_ok=True)

    outputs = []

    # ==========================================================================
    # VERIFY GODOT CONTRACT MARKERS
    # ==========================================================================

    spawn_marker = bpy.data.objects.get("SPAWN_PLAYER")
    if not spawn_marker:
        errors.append("Missing SPAWN_PLAYER marker - Godot contract violation")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    colliders = [obj for obj in bpy.data.objects if obj.name.startswith("COLLIDER_")]
    if not colliders:
        errors.append("No COLLIDER_ meshes found - Godot contract violation")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    nav_meshes = [obj for obj in bpy.data.objects if obj.name.startswith("NAV_")]

    metadata["spawn_marker"] = spawn_marker.name
    metadata["collider_count"] = len(colliders)
    metadata["nav_mesh_count"] = len(nav_meshes)

    print(f"✓ Verified Godot contract: 1 spawn, {len(colliders)} colliders, {len(nav_meshes)} nav meshes")

    # ==========================================================================
    # EXPORT GLB
    # ==========================================================================

    main_glb = world_dir / "jibglr.glb"

    print(f"Exporting to {main_glb.name}...")

    try:
        # Select all exportable objects
        bpy.ops.object.select_all(action="DESELECT")

        marker_prefixes = (
            "SPAWN_",
            "COLLIDER_",
            "NAV_",
            "TRIGGER_",
            "INTERACT_",
            "NPC_SPAWN_",
            "ITEM_SPAWN_",
            "AUDIO_ZONE_",
            "WAYPOINT_",
        )

        selected_count = 0
        for obj in bpy.context.view_layer.objects:
            # Include mesh objects (geometry)
            if obj.type == "MESH":
                obj.select_set(True)
                selected_count += 1
            # Include marker empties
            elif obj.type == "EMPTY":
                if any(obj.name.startswith(prefix) for prefix in marker_prefixes):
                    obj.select_set(True)
                    selected_count += 1

        print(f"  Selected {selected_count} objects for export")

        # Export GLB
        bpy.ops.export_scene.gltf(
            filepath=str(main_glb),
            export_format="GLB",
            use_selection=True,
            export_materials="EXPORT",
            export_lights=False,
            export_cameras=False,
            export_draco_mesh_compression_enable=draco_compression,
            export_draco_mesh_compression_level=6 if draco_compression else 0,
            export_apply=True,
        )

        outputs.append(str(main_glb))

        file_size_mb = main_glb.stat().st_size / (1024 * 1024)
        metadata["glb_size_mb"] = round(file_size_mb, 2)

        print(f"  ✓ Exported: {main_glb.name} ({file_size_mb:.2f} MB)")

    except Exception as e:
        errors.append(f"Failed to export GLB: {e}")
        import traceback
        errors.append(traceback.format_exc())

    # ==========================================================================
    # COLLECT STATS
    # ==========================================================================

    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    metadata["total_mesh_objects"] = len(mesh_objects)
    metadata["total_vertices"] = sum(len(obj.data.vertices) for obj in mesh_objects)
    metadata["total_materials"] = len(bpy.data.materials)
    metadata["draco_compression"] = draco_compression

    success = len(errors) == 0

    if success:
        print(f"✓ Export stage complete: {metadata['total_vertices']} vertices, {metadata['total_materials']} materials")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
