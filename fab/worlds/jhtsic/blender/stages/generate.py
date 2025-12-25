"""
Generate Stage - Create minimalist photo studio with electric vehicle.

Creates:
- Curved cyclorama backdrop (seamless wall-to-floor)
- Reflective studio floor
- Stylized electric vehicle (sedan silhouette)
- Gameplay markers for viewer integration

Implements the standard Fab World stage contract.
"""

from pathlib import Path
from typing import Any, Dict, Mapping, Tuple, List
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
    studio = params.get("studio", {})
    backdrop_radius = studio.get("backdrop_radius_m", 12.0)
    floor_size = studio.get("floor_size_m", 20.0)
    backdrop_height = studio.get("backdrop_height_m", 8.0)
    floor_reflectivity = studio.get("floor_reflectivity", 0.15)

    vehicle = params.get("vehicle", {})
    car_length = vehicle.get("length_m", 4.8)
    car_width = vehicle.get("width_m", 1.9)
    car_height = vehicle.get("height_m", 1.5)
    body_color = vehicle.get("body_color", [0.02, 0.02, 0.03])
    accent_color = vehicle.get("accent_color", [0.0, 0.5, 0.9])

    mat_params = params.get("materials", {})
    floor_color = mat_params.get("floor_color", [0.04, 0.04, 0.045])
    backdrop_color = mat_params.get("backdrop_color", [0.12, 0.12, 0.13])

    # ==========================================================================
    # HELPER FUNCTIONS
    # ==========================================================================

    def create_material(name: str, color: Tuple[float, ...],
                       roughness: float = 0.5, metallic: float = 0.0,
                       clearcoat: float = 0.0) -> "bpy.types.Material":
        """Create a PBR material."""
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            if len(color) == 3:
                color = (*color, 1.0)
            bsdf.inputs["Base Color"].default_value = color
            bsdf.inputs["Roughness"].default_value = roughness
            bsdf.inputs["Metallic"].default_value = metallic
            # Clearcoat for automotive paint
            if hasattr(bsdf.inputs, "Coat Weight"):
                bsdf.inputs["Coat Weight"].default_value = clearcoat
            elif "Clearcoat" in bsdf.inputs:
                bsdf.inputs["Clearcoat"].default_value = clearcoat
        return mat

    def create_emission_material(name: str, color: Tuple[float, ...],
                                  strength: float = 5.0) -> "bpy.types.Material":
        """Create an emissive material for accent lights."""
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links

        # Clear default nodes
        for node in nodes:
            nodes.remove(node)

        # Create emission setup
        output = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (*color[:3], 1.0) if len(color) == 3 else color
        emission.inputs["Strength"].default_value = strength

        links.new(emission.outputs["Emission"], output.inputs["Surface"])

        output.location = (300, 0)
        emission.location = (0, 0)

        return mat

    # ==========================================================================
    # 1. CREATE MATERIALS
    # ==========================================================================

    # Studio materials
    mat_floor = create_material("Studio_Floor", tuple(floor_color),
                                roughness=0.3, metallic=0.0)
    # Add slight reflection to floor
    bsdf = mat_floor.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Specular IOR Level"].default_value = floor_reflectivity * 2

    mat_backdrop = create_material("Studio_Backdrop", tuple(backdrop_color),
                                   roughness=0.95, metallic=0.0)

    # Vehicle materials - automotive paint with clearcoat
    mat_body = create_material("EV_Body", tuple(body_color),
                               roughness=0.2, metallic=0.9, clearcoat=1.0)
    mat_glass = create_material("EV_Glass", (0.02, 0.02, 0.02),
                                roughness=0.0, metallic=0.0)
    # Glass transparency
    glass_bsdf = mat_glass.node_tree.nodes.get("Principled BSDF")
    if glass_bsdf:
        glass_bsdf.inputs["Transmission Weight"].default_value = 0.9
        glass_bsdf.inputs["Alpha"].default_value = 0.3

    mat_trim = create_material("EV_Trim", (0.01, 0.01, 0.01),
                               roughness=0.4, metallic=0.8)
    mat_wheel = create_material("EV_Wheel", (0.03, 0.03, 0.03),
                                roughness=0.3, metallic=0.7)
    mat_tire = create_material("EV_Tire", (0.015, 0.015, 0.015),
                               roughness=0.9, metallic=0.0)
    mat_accent = create_emission_material("EV_Accent", tuple(accent_color), strength=2.0)

    metadata["materials_created"] = 8
    print("✓ Created studio and vehicle materials")

    # ==========================================================================
    # 2. CREATE CYCLORAMA BACKDROP
    # ==========================================================================

    # Create curved backdrop (quarter cylinder + flat top)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=backdrop_radius,
        depth=backdrop_height * 2,
        end_fill_type="NOTHING",
        location=(0, backdrop_radius * 0.5, backdrop_height)
    )
    backdrop = bpy.context.active_object
    backdrop.name = "Studio_Backdrop"
    backdrop.rotation_euler.x = math.pi / 2

    # Edit to keep only back half
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(backdrop.data)

    # Delete front-facing vertices (positive Y in local space after rotation)
    verts_to_delete = []
    for v in bm.verts:
        # After X rotation, we want to keep the back portion
        if v.co.y > 0.1:  # Small threshold
            verts_to_delete.append(v)

    bmesh.ops.delete(bm, geom=verts_to_delete, context="VERTS")
    bmesh.update_edit_mesh(backdrop.data)
    bpy.ops.object.mode_set(mode="OBJECT")

    backdrop.data.materials.append(mat_backdrop)
    print("✓ Created cyclorama backdrop")

    # ==========================================================================
    # 3. CREATE STUDIO FLOOR
    # ==========================================================================

    bpy.ops.mesh.primitive_plane_add(
        size=floor_size,
        location=(0, 0, 0)
    )
    floor = bpy.context.active_object
    floor.name = "Studio_Floor"
    floor.data.materials.append(mat_floor)

    # Subdivide for smooth reflections
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=8)
    bpy.ops.object.mode_set(mode="OBJECT")

    print("✓ Created studio floor")

    # ==========================================================================
    # 4. CREATE ELECTRIC VEHICLE
    # ==========================================================================

    # Vehicle positioned at center, facing forward (-Y)
    car_center = Vector((0, 0, 0))

    # --- BODY (sleek sedan shape) ---
    # Main body - elongated rounded cube
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, car_height * 0.35))
    body = bpy.context.active_object
    body.name = "EV_Body_Main"
    body.scale = (car_width / 2, car_length / 2, car_height * 0.35)
    bpy.ops.object.transform_apply(scale=True)

    # Add bevel for smooth edges
    bevel = body.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = 0.15
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")

    body.data.materials.append(mat_body)

    # --- CABIN (greenhouse) ---
    bpy.ops.mesh.primitive_cube_add(location=(0, -car_length * 0.05, car_height * 0.75))
    cabin = bpy.context.active_object
    cabin.name = "EV_Cabin"
    cabin.scale = (car_width * 0.45, car_length * 0.35, car_height * 0.25)
    bpy.ops.object.transform_apply(scale=True)

    # Bevel cabin
    cabin_bevel = cabin.modifiers.new(name="Bevel", type="BEVEL")
    cabin_bevel.width = 0.08
    cabin_bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")

    cabin.data.materials.append(mat_glass)

    # --- WHEELS (4 corners) ---
    wheel_radius = 0.38
    tire_width = 0.25
    wheel_positions = [
        (car_width / 2 - 0.15, car_length / 2 - 0.6, wheel_radius),   # Front right
        (-car_width / 2 + 0.15, car_length / 2 - 0.6, wheel_radius),  # Front left
        (car_width / 2 - 0.15, -car_length / 2 + 0.7, wheel_radius),  # Rear right
        (-car_width / 2 + 0.15, -car_length / 2 + 0.7, wheel_radius), # Rear left
    ]

    for i, (wx, wy, wz) in enumerate(wheel_positions):
        # Tire
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32,
            radius=wheel_radius,
            depth=tire_width,
            location=(wx, wy, wz)
        )
        tire = bpy.context.active_object
        tire.name = f"EV_Tire_{i}"
        tire.rotation_euler.y = math.pi / 2
        bpy.ops.object.transform_apply(rotation=True)
        tire.data.materials.append(mat_tire)

        # Wheel rim
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24,
            radius=wheel_radius * 0.7,
            depth=tire_width * 0.3,
            location=(wx + (0.13 if wx > 0 else -0.13), wy, wz)
        )
        rim = bpy.context.active_object
        rim.name = f"EV_Wheel_{i}"
        rim.rotation_euler.y = math.pi / 2
        bpy.ops.object.transform_apply(rotation=True)
        rim.data.materials.append(mat_wheel)

    # --- HEADLIGHTS (LED strips) ---
    headlight_y = car_length / 2 - 0.05
    for side in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(
            location=(side * car_width * 0.35, headlight_y, car_height * 0.45)
        )
        headlight = bpy.context.active_object
        headlight.name = f"EV_Headlight_{'R' if side > 0 else 'L'}"
        headlight.scale = (0.25, 0.02, 0.03)
        bpy.ops.object.transform_apply(scale=True)
        headlight.data.materials.append(mat_accent)

    # --- TAILLIGHTS (light bar) ---
    taillight_y = -car_length / 2 + 0.05
    bpy.ops.mesh.primitive_cube_add(
        location=(0, taillight_y, car_height * 0.5)
    )
    taillight = bpy.context.active_object
    taillight.name = "EV_Taillight_Bar"
    taillight.scale = (car_width * 0.4, 0.02, 0.025)
    bpy.ops.object.transform_apply(scale=True)
    # Red taillight emission
    mat_taillight = create_emission_material("EV_Taillight", (0.9, 0.05, 0.02), strength=3.0)
    taillight.data.materials.append(mat_taillight)

    # --- TRIM (lower body accent) ---
    bpy.ops.mesh.primitive_cube_add(
        location=(0, 0, car_height * 0.12)
    )
    lower_trim = bpy.context.active_object
    lower_trim.name = "EV_Lower_Trim"
    lower_trim.scale = (car_width / 2 + 0.02, car_length / 2 + 0.02, 0.05)
    bpy.ops.object.transform_apply(scale=True)
    lower_trim.data.materials.append(mat_trim)

    # --- CHARGING PORT (accent detail) ---
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.04,
        depth=0.01,
        location=(car_width / 2 - 0.02, car_length * 0.15, car_height * 0.4)
    )
    charge_port = bpy.context.active_object
    charge_port.name = "EV_Charge_Port"
    charge_port.rotation_euler.y = math.pi / 2
    bpy.ops.object.transform_apply(rotation=True)
    charge_port.data.materials.append(mat_accent)

    metadata["vehicle_parts"] = {
        "body": 1,
        "cabin": 1,
        "wheels": 4,
        "tires": 4,
        "lights": 4,
        "trim": 2,
    }
    print("✓ Created electric vehicle")

    # ==========================================================================
    # 5. CREATE GAMEPLAY MARKERS
    # ==========================================================================

    # SPAWN_PLAYER - viewer camera position
    bpy.ops.object.empty_add(
        type="PLAIN_AXES",
        location=(5, 6, 1.6)
    )
    spawn = bpy.context.active_object
    spawn.name = "SPAWN_PLAYER"
    spawn.empty_display_size = 0.5

    # COLLIDER_FLOOR
    bpy.ops.mesh.primitive_plane_add(size=floor_size, location=(0, 0, 0))
    collider_floor = bpy.context.active_object
    collider_floor.name = "COLLIDER_FLOOR"

    # COLLIDER_VEHICLE (simplified bounding box)
    bpy.ops.mesh.primitive_cube_add(
        location=(0, 0, car_height / 2)
    )
    collider_vehicle = bpy.context.active_object
    collider_vehicle.name = "COLLIDER_VEHICLE"
    collider_vehicle.scale = (car_width / 2 + 0.1, car_length / 2 + 0.1, car_height / 2)
    bpy.ops.object.transform_apply(scale=True)

    metadata["markers_created"] = {
        "spawn": 1,
        "colliders": 2,
    }
    print("✓ Created gameplay markers")

    # ==========================================================================
    # 6. SAVE GENERATED SCENE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    generated_blend = stage_dir / "generated.blend"

    bpy.ops.wm.save_as_mainfile(filepath=str(generated_blend))

    # Count totals
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    metadata["total_objects"] = len(bpy.data.objects)
    metadata["total_mesh_objects"] = len(mesh_objects)
    metadata["total_vertices"] = sum(len(obj.data.vertices) for obj in mesh_objects)
    metadata["vehicle_dimensions"] = {
        "length_m": car_length,
        "width_m": car_width,
        "height_m": car_height,
    }

    print(f"✓ Generate stage complete: {metadata['total_objects']} objects, {metadata['total_vertices']} vertices")

    return {
        "success": True,
        "outputs": [str(generated_blend)],
        "metadata": metadata,
        "errors": [],
    }
