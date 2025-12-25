"""
Generate Stage - Create low-poly forest clearing with stream and bridge.

Creates:
- Ground plane with clearing
- Stream with simple water
- Wooden bridge
- Low-poly trees around the perimeter
- Rocks and vegetation
- Gameplay markers (spawn, colliders, nav)

Implements the standard Fab World stage contract.
"""

from pathlib import Path
from typing import Any, Dict, Mapping, Tuple
import math
import random


def execute(
    *,
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
    manifest: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute the generate stage."""

    errors = []
    metadata = {}

    try:
        import bpy
        import bmesh
        from mathutils import Vector
    except ImportError:
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": ["Blender Python (bpy) not available"],
        }

    # Load prepared scene
    prepare_dir = inputs.get("prepare")
    if not prepare_dir:
        errors.append("Missing 'prepare' stage input")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    prepared_blend = prepare_dir / "prepared.blend"
    if not prepared_blend.exists():
        errors.append(f"Prepared blend not found: {prepared_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(prepared_blend))

    # Re-seed RNG from manifest
    seed = manifest.get("determinism", {}).get("seed", 42)
    random.seed(seed)

    # Get parameters
    layout = params.get("layout", {})
    clearing_radius = layout.get("clearing_radius_m", 12.0)
    stream_width = layout.get("stream_width_m", 2.5)
    bridge_length = layout.get("bridge_length_m", 4.0)

    tree_params = params.get("trees", {})
    tree_count = tree_params.get("count", 18)
    tree_min_dist = tree_params.get("min_distance_m", 3.0)

    veg_params = params.get("vegetation", {})
    grass_patches = veg_params.get("grass_patches", 30)
    rock_count = veg_params.get("rock_count", 8)
    flower_patches = veg_params.get("flower_patches", 5)

    bridge_params = params.get("bridge", {})
    bridge_has_rails = bridge_params.get("has_rails", True)

    # ==========================================================================
    # HELPER FUNCTIONS
    # ==========================================================================

    def create_material(name: str, color: Tuple[float, float, float, float]) -> "bpy.types.Material":
        """Create a simple solid color material."""
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = color
            bsdf.inputs["Roughness"].default_value = 0.8
        return mat

    def create_low_poly_tree(location: Vector, scale: float = 1.0) -> "bpy.types.Object":
        """Create a stylized low-poly tree (trunk + triangular foliage)."""
        # Trunk - tapered cylinder
        bpy.ops.mesh.primitive_cone_add(
            vertices=6,
            radius1=0.15 * scale,
            radius2=0.08 * scale,
            depth=1.5 * scale,
            location=(location.x, location.y, 0.75 * scale)
        )
        trunk = bpy.context.active_object
        trunk.name = f"Tree_Trunk_{random.randint(1000, 9999)}"

        # Foliage - stacked cones
        foliage_parts = []
        foliage_heights = [1.5, 2.2, 2.8]
        foliage_radii = [1.0, 0.75, 0.5]

        for i, (h, r) in enumerate(zip(foliage_heights, foliage_radii)):
            bpy.ops.mesh.primitive_cone_add(
                vertices=8,
                radius1=r * scale,
                radius2=0.0,
                depth=1.2 * scale,
                location=(location.x, location.y, h * scale)
            )
            cone = bpy.context.active_object
            cone.name = f"Tree_Foliage_{i}_{random.randint(1000, 9999)}"
            foliage_parts.append(cone)

        # Parent foliage to trunk
        for part in foliage_parts:
            part.parent = trunk

        return trunk

    def create_rock(location: Vector, scale: float = 1.0) -> "bpy.types.Object":
        """Create a low-poly rock using an icosphere."""
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=0.5 * scale,
            location=location
        )
        rock = bpy.context.active_object
        rock.name = f"Rock_{random.randint(1000, 9999)}"

        # Deform slightly for natural look
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(rock.data)
        for v in bm.verts:
            v.co.x += random.uniform(-0.1, 0.1) * scale
            v.co.y += random.uniform(-0.1, 0.1) * scale
            v.co.z *= random.uniform(0.6, 1.0)
        bmesh.update_edit_mesh(rock.data)
        bpy.ops.object.mode_set(mode="OBJECT")

        return rock

    def create_grass_patch(location: Vector) -> "bpy.types.Object":
        """Create a simple grass patch (low-poly blade cluster)."""
        bpy.ops.mesh.primitive_cone_add(
            vertices=3,
            radius1=0.3,
            radius2=0.0,
            depth=0.4,
            location=(location.x, location.y, 0.2)
        )
        grass = bpy.context.active_object
        grass.name = f"Grass_{random.randint(1000, 9999)}"
        grass.scale = (random.uniform(0.8, 1.2), random.uniform(0.8, 1.2), random.uniform(0.8, 1.2))
        grass.rotation_euler.z = random.uniform(0, math.pi * 2)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        return grass

    def point_in_clearing(x: float, y: float) -> bool:
        """Check if point is in the clearing (not in stream)."""
        # Stream runs along Y axis
        return abs(x) > stream_width / 2 + 0.5

    def point_near_edge(x: float, y: float, min_dist: float, max_dist: float) -> bool:
        """Check if point is near the clearing edge (for trees)."""
        dist = math.sqrt(x * x + y * y)
        return min_dist < dist < max_dist

    # ==========================================================================
    # 1. CREATE MATERIALS
    # ==========================================================================

    mat_ground = create_material("Ground_Grass", (0.2, 0.35, 0.15, 1.0))
    mat_water = create_material("Water_Stream", (0.2, 0.4, 0.5, 1.0))
    mat_water.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.1
    mat_wood_dark = create_material("Wood_Dark", (0.25, 0.15, 0.08, 1.0))
    mat_wood_light = create_material("Wood_Light", (0.45, 0.30, 0.15, 1.0))
    mat_trunk = create_material("Tree_Trunk", (0.35, 0.22, 0.12, 1.0))
    mat_foliage = create_material("Tree_Foliage", (0.15, 0.4, 0.12, 1.0))
    mat_rock = create_material("Rock_Gray", (0.35, 0.35, 0.33, 1.0))
    mat_grass = create_material("Grass_Blade", (0.25, 0.45, 0.18, 1.0))
    mat_flower = create_material("Flower_Yellow", (0.9, 0.7, 0.2, 1.0))

    metadata["materials_created"] = 9

    # ==========================================================================
    # 2. CREATE GROUND
    # ==========================================================================

    # Main ground plane
    bpy.ops.mesh.primitive_plane_add(size=clearing_radius * 2.5, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    ground.data.materials.append(mat_ground)

    # Subdivide for slight undulation
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=4)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Slight vertex displacement
    for v in ground.data.vertices:
        if abs(v.co.x) > stream_width / 2:
            v.co.z = random.uniform(-0.05, 0.1)

    print("✓ Created ground plane")

    # ==========================================================================
    # 3. CREATE STREAM
    # ==========================================================================

    # Stream bed (slightly lower plane)
    stream_length = clearing_radius * 2.5
    bpy.ops.mesh.primitive_plane_add(
        size=1,
        location=(0, 0, -0.15)
    )
    stream = bpy.context.active_object
    stream.name = "Stream"
    stream.scale = (stream_width, stream_length, 1)
    bpy.ops.object.transform_apply(scale=True)
    stream.data.materials.append(mat_water)

    print("✓ Created stream")

    # ==========================================================================
    # 4. CREATE BRIDGE
    # ==========================================================================

    bridge_y = 0  # Bridge at center
    bridge_deck_height = 0.3
    plank_width = 0.4
    plank_count = int(bridge_length / plank_width)

    # Bridge planks
    for i in range(plank_count):
        plank_y = bridge_y - bridge_length / 2 + plank_width * (i + 0.5)
        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(0, plank_y, bridge_deck_height)
        )
        plank = bpy.context.active_object
        plank.name = f"Bridge_Plank_{i}"
        plank.scale = (stream_width + 0.8, plank_width * 0.9, 0.08)
        bpy.ops.object.transform_apply(scale=True)
        plank.data.materials.append(mat_wood_dark if i % 2 == 0 else mat_wood_light)

    # Bridge supports
    support_positions = [
        (-stream_width / 2 - 0.3, bridge_y - bridge_length / 2 + 0.3),
        (-stream_width / 2 - 0.3, bridge_y + bridge_length / 2 - 0.3),
        (stream_width / 2 + 0.3, bridge_y - bridge_length / 2 + 0.3),
        (stream_width / 2 + 0.3, bridge_y + bridge_length / 2 - 0.3),
    ]

    for i, (sx, sy) in enumerate(support_positions):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.08,
            depth=0.8,
            location=(sx, sy, -0.1)
        )
        support = bpy.context.active_object
        support.name = f"Bridge_Support_{i}"
        support.data.materials.append(mat_wood_dark)

    # Bridge rails
    if bridge_has_rails:
        for side in [-1, 1]:
            rail_x = side * (stream_width / 2 + 0.3)
            # Vertical posts
            for post_offset in [-bridge_length / 2 + 0.3, 0, bridge_length / 2 - 0.3]:
                bpy.ops.mesh.primitive_cylinder_add(
                    radius=0.04,
                    depth=0.6,
                    location=(rail_x, bridge_y + post_offset, bridge_deck_height + 0.35)
                )
                post = bpy.context.active_object
                post.name = f"Bridge_Post_{random.randint(100, 999)}"
                post.data.materials.append(mat_wood_dark)

            # Horizontal rail
            bpy.ops.mesh.primitive_cylinder_add(
                radius=0.03,
                depth=bridge_length - 0.4,
                location=(rail_x, bridge_y, bridge_deck_height + 0.6)
            )
            rail = bpy.context.active_object
            rail.name = f"Bridge_Rail_{side}"
            rail.rotation_euler.x = math.pi / 2
            bpy.ops.object.transform_apply(rotation=True)
            rail.data.materials.append(mat_wood_light)

    print("✓ Created bridge")

    # ==========================================================================
    # 5. CREATE TREES
    # ==========================================================================

    tree_positions = []
    attempts = 0
    max_attempts = tree_count * 20

    while len(tree_positions) < tree_count and attempts < max_attempts:
        attempts += 1
        angle = random.uniform(0, math.pi * 2)
        dist = random.uniform(clearing_radius * 0.6, clearing_radius * 1.1)
        x = math.cos(angle) * dist
        y = math.sin(angle) * dist

        # Check minimum distance from other trees
        too_close = False
        for tx, ty in tree_positions:
            if math.sqrt((x - tx) ** 2 + (y - ty) ** 2) < tree_min_dist:
                too_close = True
                break

        # Avoid stream area
        if abs(x) < stream_width + 1.0:
            too_close = True

        if not too_close:
            tree_positions.append((x, y))

    for x, y in tree_positions:
        scale = random.uniform(0.7, 1.3)
        tree = create_low_poly_tree(Vector((x, y, 0)), scale)

        # Apply materials
        if tree.data.materials:
            tree.data.materials[0] = mat_trunk
        else:
            tree.data.materials.append(mat_trunk)

        # Apply foliage material to children
        for child in tree.children:
            if child.data.materials:
                child.data.materials[0] = mat_foliage
            else:
                child.data.materials.append(mat_foliage)

    metadata["trees_created"] = len(tree_positions)
    print(f"✓ Created {len(tree_positions)} trees")

    # ==========================================================================
    # 6. CREATE ROCKS
    # ==========================================================================

    rock_positions = []
    for _ in range(rock_count):
        # Place rocks near stream banks and clearing edges
        if random.random() < 0.6:
            # Near stream
            x = random.choice([-1, 1]) * (stream_width / 2 + random.uniform(0.3, 1.5))
            y = random.uniform(-clearing_radius * 0.8, clearing_radius * 0.8)
        else:
            # Random in clearing
            angle = random.uniform(0, math.pi * 2)
            dist = random.uniform(2, clearing_radius * 0.5)
            x = math.cos(angle) * dist
            y = math.sin(angle) * dist
            if abs(x) < stream_width + 0.5:
                x = random.choice([-1, 1]) * (stream_width + 0.5)

        scale = random.uniform(0.3, 0.8)
        rock = create_rock(Vector((x, y, scale * 0.3)), scale)
        rock.data.materials.append(mat_rock)
        rock_positions.append((x, y))

    metadata["rocks_created"] = rock_count
    print(f"✓ Created {rock_count} rocks")

    # ==========================================================================
    # 7. CREATE GRASS AND FLOWERS
    # ==========================================================================

    for _ in range(grass_patches):
        angle = random.uniform(0, math.pi * 2)
        dist = random.uniform(1, clearing_radius * 0.8)
        x = math.cos(angle) * dist
        y = math.sin(angle) * dist

        if abs(x) > stream_width / 2 + 0.3:
            grass = create_grass_patch(Vector((x, y, 0)))
            grass.data.materials.append(mat_grass)

    for _ in range(flower_patches):
        angle = random.uniform(0, math.pi * 2)
        dist = random.uniform(2, clearing_radius * 0.6)
        x = math.cos(angle) * dist
        y = math.sin(angle) * dist

        if abs(x) > stream_width / 2 + 0.5:
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=6,
                ring_count=4,
                radius=0.1,
                location=(x, y, 0.15)
            )
            flower = bpy.context.active_object
            flower.name = f"Flower_{random.randint(1000, 9999)}"
            flower.data.materials.append(mat_flower)

    metadata["grass_patches"] = grass_patches
    metadata["flower_patches"] = flower_patches
    print(f"✓ Created vegetation")

    # ==========================================================================
    # 8. CREATE GAMEPLAY MARKERS
    # ==========================================================================

    # SPAWN_PLAYER - on bridge
    bpy.ops.object.empty_add(
        type="PLAIN_AXES",
        location=(0, 0, bridge_deck_height + 1.6)
    )
    spawn = bpy.context.active_object
    spawn.name = "SPAWN_PLAYER"
    spawn.empty_display_size = 0.5

    # COLLIDER_GROUND - simplified ground collision
    bpy.ops.mesh.primitive_plane_add(size=clearing_radius * 2.5, location=(0, 0, 0))
    collider_ground = bpy.context.active_object
    collider_ground.name = "COLLIDER_GROUND"

    # COLLIDER_BRIDGE - bridge deck collision
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, bridge_deck_height))
    collider_bridge = bpy.context.active_object
    collider_bridge.name = "COLLIDER_BRIDGE"
    collider_bridge.scale = (stream_width + 0.8, bridge_length, 0.1)
    bpy.ops.object.transform_apply(scale=True)

    # COLLIDER_STREAM_BANK - invisible walls at stream edges
    for side, name_suffix in [(-1, "WEST"), (1, "EAST")]:
        bpy.ops.mesh.primitive_cube_add(
            location=(side * (stream_width / 2 + 0.1), 0, 0.5)
        )
        bank = bpy.context.active_object
        bank.name = f"COLLIDER_STREAM_BANK_{name_suffix}"
        bank.scale = (0.2, clearing_radius * 2.5, 1.0)
        bpy.ops.object.transform_apply(scale=True)

    print("✓ Created gameplay markers")
    metadata["markers_created"] = {
        "spawn": 1,
        "colliders": 4,
    }

    # ==========================================================================
    # 9. SAVE GENERATED SCENE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    generated_blend = stage_dir / "generated.blend"

    bpy.ops.wm.save_as_mainfile(filepath=str(generated_blend))

    # Count totals
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    metadata["total_objects"] = len(bpy.data.objects)
    metadata["total_mesh_objects"] = len(mesh_objects)
    metadata["total_vertices"] = sum(len(obj.data.vertices) for obj in mesh_objects)

    print(f"✓ Generate stage complete: {metadata['total_objects']} objects, {metadata['total_vertices']} vertices")

    return {
        "success": True,
        "outputs": [str(generated_blend)],
        "metadata": metadata,
        "errors": [],
    }
