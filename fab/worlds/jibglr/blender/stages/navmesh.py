"""
Navmesh Stage - Generate navigation mesh for NPC pathfinding.

Creates NAV_WALKABLE mesh covering accessible ground areas.

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
    """Execute the navmesh stage."""

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

    # Load generated scene
    generate_dir = inputs.get("generate")
    if not generate_dir:
        errors.append("Missing 'generate' stage input")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    generated_blend = generate_dir / "generated.blend"
    if not generated_blend.exists():
        errors.append(f"Generated blend not found: {generated_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(generated_blend))

    # Get layout params
    layout = params.get("layout", {})
    clearing_radius = layout.get("clearing_radius_m", 12.0)
    stream_width = layout.get("stream_width_m", 2.5)
    bridge_length = layout.get("bridge_length_m", 4.0)

    # ==========================================================================
    # CREATE NAV_WALKABLE
    # ==========================================================================

    # Simple approach: create two ground planes on either side of stream,
    # connected by the bridge area

    # West side navmesh
    bpy.ops.mesh.primitive_plane_add(
        size=1,
        location=(-(stream_width / 2 + clearing_radius / 2), 0, 0.01)
    )
    nav_west = bpy.context.active_object
    nav_west.name = "NAV_WALKABLE_WEST"
    nav_west.scale = (clearing_radius - stream_width / 2, clearing_radius * 2, 1)
    bpy.ops.object.transform_apply(scale=True)

    # East side navmesh
    bpy.ops.mesh.primitive_plane_add(
        size=1,
        location=((stream_width / 2 + clearing_radius / 2), 0, 0.01)
    )
    nav_east = bpy.context.active_object
    nav_east.name = "NAV_WALKABLE_EAST"
    nav_east.scale = (clearing_radius - stream_width / 2, clearing_radius * 2, 1)
    bpy.ops.object.transform_apply(scale=True)

    # Bridge navmesh
    bridge_deck_height = 0.3
    bpy.ops.mesh.primitive_plane_add(
        size=1,
        location=(0, 0, bridge_deck_height + 0.01)
    )
    nav_bridge = bpy.context.active_object
    nav_bridge.name = "NAV_BRIDGE"
    nav_bridge.scale = (stream_width + 0.6, bridge_length, 1)
    bpy.ops.object.transform_apply(scale=True)

    metadata["nav_regions"] = 3
    print("✓ Created navigation meshes")

    # ==========================================================================
    # SAVE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    navmesh_blend = stage_dir / "navmesh_setup.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(navmesh_blend))

    return {
        "success": True,
        "outputs": [str(navmesh_blend)],
        "metadata": metadata,
        "errors": [],
    }
