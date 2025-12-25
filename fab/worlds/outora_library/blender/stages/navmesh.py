"""
Navmesh Stage - Generate navigation meshes for NPC pathfinding.

This stage:
1. Loads the baked blend file
2. Collects floor geometry from known collections
3. Uses Blender's navmesh generation
4. Creates NAV_ mesh objects for Godot import
5. Saves the result with navigation data

The generated NAV_ meshes will be converted to NavigationRegion3D nodes
by the Godot import pipeline.
"""

from pathlib import Path
from typing import Any, Dict, List, Mapping


def execute(
    *,
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
    manifest: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute the navmesh stage."""

    errors: List[str] = []
    metadata: Dict[str, Any] = {}

    try:
        import bpy
        import bmesh
    except ImportError:
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": ["Blender Python (bpy) not available"],
        }

    # ==========================================================================
    # 1. LOAD BAKED SCENE
    # ==========================================================================

    bake_input = inputs.get("bake")
    if not bake_input:
        errors.append("Missing 'bake' stage input")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    # Handle both directory and direct file paths
    if bake_input.is_dir():
        baked_blend = bake_input / "outora_library_baked.blend"
    else:
        baked_blend = bake_input

    # Also check world directory (where bake stage saves)
    if not baked_blend.exists():
        world_baked = run_dir / "world" / "outora_library_baked.blend"
        if world_baked.exists():
            baked_blend = world_baked

    if not baked_blend.exists():
        errors.append(f"Baked blend file not found: {baked_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    print(f"Loading baked scene from {baked_blend}...")
    bpy.ops.wm.open_mainfile(filepath=str(baked_blend))

    # ==========================================================================
    # 2. COLLECT FLOOR GEOMETRY
    # ==========================================================================

    # Collection names that contain walkable floor geometry
    floor_collection_names = [
        "OL_Gothic_Floors",
        "OL_Floors",
        "OL_Floors_Mezz",
        "OL_Floors_Slabs",
    ]

    # Object name prefixes for floor meshes (fallback if collections don't exist)
    floor_object_prefixes = [
        "ol_floor",
        "ol_mezzanine",
        "floor_",
        "walkable_",
    ]

    floor_objects: List[bpy.types.Object] = []

    # First, try to collect from known collections
    for col_name in floor_collection_names:
        col = bpy.data.collections.get(col_name)
        if col:
            for obj in col.objects:
                if obj.type == "MESH" and obj not in floor_objects:
                    floor_objects.append(obj)
                    print(f"  Found floor mesh in {col_name}: {obj.name}")

    # Fallback: search by object name prefix if no collection matches
    if not floor_objects:
        print("No floor collections found, searching by object name...")
        for obj in bpy.data.objects:
            if obj.type != "MESH":
                continue
            name_lower = obj.name.lower()
            for prefix in floor_object_prefixes:
                if name_lower.startswith(prefix):
                    floor_objects.append(obj)
                    print(f"  Found floor mesh by name: {obj.name}")
                    break

    if not floor_objects:
        errors.append("No floor geometry found for navmesh generation")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    metadata["floor_objects_count"] = len(floor_objects)
    print(f"Found {len(floor_objects)} floor objects for navmesh generation")

    # ==========================================================================
    # 3. CREATE NAVIGATION COLLECTION
    # ==========================================================================

    nav_collection = bpy.data.collections.get("OL_Navigation")
    if not nav_collection:
        nav_collection = bpy.data.collections.new("OL_Navigation")
        bpy.context.scene.collection.children.link(nav_collection)

    # ==========================================================================
    # 4. GENERATE NAVMESH USING BLENDER'S BUILT-IN TOOLS
    # ==========================================================================

    # Deselect all first
    bpy.ops.object.select_all(action="DESELECT")

    # Select floor objects
    for obj in floor_objects:
        obj.select_set(True)

    if floor_objects:
        bpy.context.view_layer.objects.active = floor_objects[0]

    # Try using Blender's navmesh operator (requires object mode)
    bpy.ops.object.mode_set(mode="OBJECT")

    navmesh_created = False

    # Method 1: Use Blender's built-in navmesh_make if available
    try:
        # This requires the "Recast" navmesh addon or built-in navmesh
        bpy.ops.mesh.navmesh_make()
        navmesh_obj = bpy.context.active_object
        if navmesh_obj and navmesh_obj.type == "MESH":
            navmesh_obj.name = "NAV_WALKABLE"
            navmesh_created = True
            print("✓ Created navmesh using Blender's navmesh_make operator")
    except (RuntimeError, AttributeError) as e:
        print(f"  navmesh_make not available: {e}")

    # Method 2: Create simplified navmesh from floor geometry manually
    if not navmesh_created:
        print("Creating navmesh from floor geometry using manual approach...")
        navmesh_obj = _create_navmesh_from_floors(floor_objects)
        if navmesh_obj:
            navmesh_created = True

    if not navmesh_created:
        errors.append("Failed to generate navmesh")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    # ==========================================================================
    # 5. ORGANIZE NAVMESH OBJECTS
    # ==========================================================================

    # Move navmesh to navigation collection
    navmesh_obj = bpy.data.objects.get("NAV_WALKABLE")
    if navmesh_obj:
        # Unlink from current collections
        for col in navmesh_obj.users_collection:
            col.objects.unlink(navmesh_obj)
        # Link to navigation collection
        nav_collection.objects.link(navmesh_obj)

        # Set navmesh properties
        navmesh_obj.display_type = "WIRE"
        navmesh_obj.hide_render = True

        # Calculate navmesh stats
        if navmesh_obj.type == "MESH":
            metadata["navmesh_vertices"] = len(navmesh_obj.data.vertices)
            metadata["navmesh_faces"] = len(navmesh_obj.data.polygons)

    # Create level-specific navmeshes if we have mezzanine floors
    mezzanine_floors = [o for o in floor_objects if "mezz" in o.name.lower()]
    ground_floors = [o for o in floor_objects if o not in mezzanine_floors]

    if ground_floors:
        ground_nav = _create_level_navmesh(ground_floors, "NAV_GROUND")
        if ground_nav:
            nav_collection.objects.link(ground_nav)
            metadata["ground_nav_created"] = True

    if mezzanine_floors:
        mezz_nav = _create_level_navmesh(mezzanine_floors, "NAV_MEZZANINE")
        if mezz_nav:
            nav_collection.objects.link(mezz_nav)
            metadata["mezzanine_nav_created"] = True

    # ==========================================================================
    # 6. SAVE RESULT
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    output_blend = stage_dir / "navmesh.blend"

    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    outputs = [str(output_blend)]
    metadata["navmesh_generated"] = True

    success = len(errors) == 0

    if success:
        print(f"✓ Navmesh stage complete: {metadata.get('navmesh_vertices', 0)} vertices")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }


def _create_navmesh_from_floors(floor_objects: List["bpy.types.Object"]) -> "bpy.types.Object":
    """
    Create a simplified navmesh by merging and decimating floor geometry.

    This is a fallback when Blender's navmesh_make is not available.
    """
    import bpy
    import bmesh

    if not floor_objects:
        return None

    # Create new mesh to hold combined floor geometry
    nav_mesh = bpy.data.meshes.new("NAV_WALKABLE_mesh")
    nav_obj = bpy.data.objects.new("NAV_WALKABLE", nav_mesh)

    # Link to scene temporarily for operations
    bpy.context.scene.collection.objects.link(nav_obj)

    # Create bmesh and merge all floor geometry
    bm = bmesh.new()

    for obj in floor_objects:
        # Get evaluated mesh (with modifiers applied)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        obj_eval = obj.evaluated_get(depsgraph)
        mesh_eval = obj_eval.to_mesh()

        if mesh_eval:
            # Transform to world space
            bm_temp = bmesh.new()
            bm_temp.from_mesh(mesh_eval)
            bmesh.ops.transform(bm_temp, matrix=obj.matrix_world, verts=bm_temp.verts)

            # Merge into main bmesh
            for v in bm_temp.verts:
                bm.verts.new(v.co)

            bm.verts.ensure_lookup_table()
            vert_offset = len(bm.verts) - len(bm_temp.verts)

            for f in bm_temp.faces:
                try:
                    new_verts = [bm.verts[vert_offset + v.index] for v in f.verts]
                    bm.faces.new(new_verts)
                except (ValueError, IndexError):
                    pass  # Skip degenerate faces

            bm_temp.free()
            obj_eval.to_mesh_clear()

    # Remove duplicate vertices
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)

    # Simplify for navigation (decimate)
    # Target ~10% of original faces for efficient pathfinding
    original_faces = len(bm.faces)
    if original_faces > 1000:
        target_ratio = max(0.1, 1000 / original_faces)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.001)
        # Note: Full decimation would require Blender's decimate modifier

    # Write to mesh
    bm.to_mesh(nav_mesh)
    bm.free()

    # Apply decimate modifier for cleaner result
    bpy.context.view_layer.objects.active = nav_obj
    decimate = nav_obj.modifiers.new(name="NavDecimate", type="DECIMATE")
    decimate.ratio = 0.25  # Keep 25% of geometry
    decimate.use_collapse_triangulate = True

    # Apply modifier
    bpy.ops.object.modifier_apply(modifier=decimate.name)

    print(f"  Created NAV_WALKABLE with {len(nav_mesh.vertices)} vertices")

    return nav_obj


def _create_level_navmesh(
    floor_objects: List["bpy.types.Object"],
    name: str
) -> "bpy.types.Object":
    """Create a navmesh for a specific level (ground or mezzanine)."""
    import bpy
    import bmesh

    if not floor_objects:
        return None

    # Create new mesh
    nav_mesh = bpy.data.meshes.new(f"{name}_mesh")
    nav_obj = bpy.data.objects.new(name, nav_mesh)

    # Create bmesh from floor objects
    bm = bmesh.new()

    for obj in floor_objects:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        obj_eval = obj.evaluated_get(depsgraph)
        mesh_eval = obj_eval.to_mesh()

        if mesh_eval:
            bm_temp = bmesh.new()
            bm_temp.from_mesh(mesh_eval)
            bmesh.ops.transform(bm_temp, matrix=obj.matrix_world, verts=bm_temp.verts)

            # Copy geometry
            vert_map = {}
            for v in bm_temp.verts:
                new_v = bm.verts.new(v.co)
                vert_map[v.index] = new_v

            bm.verts.ensure_lookup_table()

            for f in bm_temp.faces:
                try:
                    new_verts = [vert_map[v.index] for v in f.verts]
                    bm.faces.new(new_verts)
                except (ValueError, KeyError):
                    pass

            bm_temp.free()
            obj_eval.to_mesh_clear()

    # Clean up
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)

    # Write to mesh
    bm.to_mesh(nav_mesh)
    bm.free()

    # Set display properties
    nav_obj.display_type = "WIRE"
    nav_obj.hide_render = True

    print(f"  Created {name} with {len(nav_mesh.vertices)} vertices")

    return nav_obj
