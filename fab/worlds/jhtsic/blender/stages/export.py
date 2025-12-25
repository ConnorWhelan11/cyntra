"""
Export Stage - Export GLB for Three.js viewer and quality gates.

Exports the photo studio scene with EV for web viewing.

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
        errors.append("Missing SPAWN_PLAYER marker - contract violation")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    colliders = [obj for obj in bpy.data.objects if obj.name.startswith("COLLIDER_")]
    if not colliders:
        errors.append("No COLLIDER_ meshes found - contract violation")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    metadata["spawn_marker"] = spawn_marker.name
    metadata["collider_count"] = len(colliders)

    print(f"✓ Verified markers: 1 spawn, {len(colliders)} colliders")

    # ==========================================================================
    # EXPORT FULL SCENE GLB
    # ==========================================================================

    main_glb = world_dir / "jhtsic.glb"

    print(f"Exporting to {main_glb.name}...")

    try:
        # Select all mesh and marker objects for export
        bpy.ops.object.select_all(action="DESELECT")

        marker_prefixes = (
            "SPAWN_",
            "COLLIDER_",
            "NAV_",
            "TRIGGER_",
            "INTERACT_",
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

        # Export GLB with materials
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
    # EXPORT VEHICLE-ONLY GLB (for asset quality gate)
    # ==========================================================================

    vehicle_glb = world_dir / "jhtsic_vehicle.glb"

    try:
        bpy.ops.object.select_all(action="DESELECT")

        # Select only vehicle parts
        vehicle_count = 0
        for obj in bpy.context.view_layer.objects:
            if obj.type == "MESH" and obj.name.startswith("EV_"):
                obj.select_set(True)
                vehicle_count += 1

        if vehicle_count > 0:
            print(f"  Exporting vehicle ({vehicle_count} parts)...")

            bpy.ops.export_scene.gltf(
                filepath=str(vehicle_glb),
                export_format="GLB",
                use_selection=True,
                export_materials="EXPORT",
                export_lights=False,
                export_cameras=False,
                export_draco_mesh_compression_enable=draco_compression,
                export_draco_mesh_compression_level=6 if draco_compression else 0,
                export_apply=True,
            )

            outputs.append(str(vehicle_glb))
            vehicle_size_mb = vehicle_glb.stat().st_size / (1024 * 1024)
            metadata["vehicle_glb_size_mb"] = round(vehicle_size_mb, 2)

            print(f"  ✓ Exported: {vehicle_glb.name} ({vehicle_size_mb:.2f} MB)")

    except Exception as e:
        # Non-fatal - main export is what matters
        print(f"  ⚠ Vehicle-only export failed: {e}")

    # ==========================================================================
    # COLLECT STATS
    # ==========================================================================

    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    vehicle_meshes = [obj for obj in mesh_objects if obj.name.startswith("EV_")]

    metadata["total_mesh_objects"] = len(mesh_objects)
    metadata["vehicle_mesh_objects"] = len(vehicle_meshes)
    metadata["total_vertices"] = sum(len(obj.data.vertices) for obj in mesh_objects)
    metadata["vehicle_vertices"] = sum(len(obj.data.vertices) for obj in vehicle_meshes)
    metadata["total_materials"] = len(bpy.data.materials)
    metadata["draco_compression"] = draco_compression

    # Calculate vehicle bounding box for gate validation
    if vehicle_meshes:
        min_x = min_y = min_z = float("inf")
        max_x = max_y = max_z = float("-inf")

        for obj in vehicle_meshes:
            for v in obj.data.vertices:
                world_co = obj.matrix_world @ v.co
                min_x = min(min_x, world_co.x)
                max_x = max(max_x, world_co.x)
                min_y = min(min_y, world_co.y)
                max_y = max(max_y, world_co.y)
                min_z = min(min_z, world_co.z)
                max_z = max(max_z, world_co.z)

        metadata["vehicle_bounds_m"] = {
            "length": round(max_y - min_y, 2),
            "width": round(max_x - min_x, 2),
            "height": round(max_z - min_z, 2),
        }

    success = len(errors) == 0

    if success:
        print(f"✓ Export stage complete: {metadata['total_vertices']} vertices, {metadata['total_materials']} materials")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
