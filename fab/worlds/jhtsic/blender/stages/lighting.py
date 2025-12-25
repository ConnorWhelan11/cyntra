"""
Lighting Stage - Set up dramatic studio lighting for EV product photography.

Implements three-point lighting with additional accent and environment:
- Key light: Main dramatic illumination
- Fill light: Shadow softening
- Rim light: Edge separation
- Ground reflection bounce
- Dark ambient for drama

Implements the standard Fab World stage contract.
"""

from pathlib import Path
from typing import Any, Dict, Mapping
import math


def execute(
    *,
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
    manifest: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute the lighting stage."""

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

    # Get lighting parameters
    light_params = params.get("lighting", {})
    preset = light_params.get("preset", "dramatic")
    key_energy = light_params.get("key_energy", 1500.0)
    fill_ratio = light_params.get("fill_ratio", 0.3)
    rim_energy = light_params.get("rim_energy", 800.0)
    ambient_strength = light_params.get("ambient_strength", 0.05)

    # ==========================================================================
    # LIGHTING PRESETS
    # ==========================================================================

    presets = {
        "dramatic": {
            "key_color": (1.0, 0.98, 0.95),
            "key_energy_mult": 1.0,
            "key_angle_h": 45,
            "key_angle_v": 40,
            "fill_color": (0.85, 0.9, 1.0),
            "fill_energy_mult": 0.25,
            "rim_color": (0.95, 0.95, 1.0),
            "rim_energy_mult": 1.2,
            "ambient_color": (0.02, 0.02, 0.025),
            "ambient_mult": 1.0,
        },
        "soft": {
            "key_color": (1.0, 0.97, 0.92),
            "key_energy_mult": 0.7,
            "key_angle_h": 30,
            "key_angle_v": 50,
            "fill_color": (0.95, 0.95, 1.0),
            "fill_energy_mult": 0.5,
            "rim_color": (1.0, 0.98, 0.95),
            "rim_energy_mult": 0.6,
            "ambient_color": (0.08, 0.08, 0.09),
            "ambient_mult": 2.0,
        },
        "high_key": {
            "key_color": (1.0, 1.0, 1.0),
            "key_energy_mult": 1.5,
            "key_angle_h": 20,
            "key_angle_v": 60,
            "fill_color": (1.0, 1.0, 1.0),
            "fill_energy_mult": 0.8,
            "rim_color": (1.0, 1.0, 1.0),
            "rim_energy_mult": 0.5,
            "ambient_color": (0.15, 0.15, 0.16),
            "ambient_mult": 3.0,
        },
    }

    active_preset = presets.get(preset, presets["dramatic"])

    # ==========================================================================
    # 1. CREATE KEY LIGHT
    # ==========================================================================

    # Position key light front-right, elevated
    key_distance = 8.0
    key_h_angle = math.radians(active_preset["key_angle_h"])
    key_v_angle = math.radians(active_preset["key_angle_v"])

    key_x = math.sin(key_h_angle) * key_distance
    key_y = math.cos(key_h_angle) * key_distance
    key_z = math.sin(key_v_angle) * key_distance

    bpy.ops.object.light_add(
        type="AREA",
        location=(key_x, key_y, key_z)
    )
    key_light = bpy.context.active_object
    key_light.name = "Key_Light"

    # Point at vehicle center
    direction = key_light.location.normalized()
    key_light.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    # Large soft area light
    key_light.data.shape = "RECTANGLE"
    key_light.data.size = 4.0
    key_light.data.size_y = 3.0
    key_light.data.energy = key_energy * active_preset["key_energy_mult"]
    key_light.data.color = active_preset["key_color"]

    print(f"✓ Created key light ({preset} preset)")

    # ==========================================================================
    # 2. CREATE FILL LIGHT
    # ==========================================================================

    # Position fill light opposite side, lower
    fill_x = -key_x * 0.8
    fill_y = key_y * 0.6
    fill_z = key_z * 0.5

    bpy.ops.object.light_add(
        type="AREA",
        location=(fill_x, fill_y, fill_z)
    )
    fill_light = bpy.context.active_object
    fill_light.name = "Fill_Light"

    direction = fill_light.location.normalized()
    fill_light.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    fill_light.data.shape = "RECTANGLE"
    fill_light.data.size = 6.0
    fill_light.data.size_y = 4.0
    fill_light.data.energy = key_energy * fill_ratio * active_preset["fill_energy_mult"]
    fill_light.data.color = active_preset["fill_color"]

    print("✓ Created fill light")

    # ==========================================================================
    # 3. CREATE RIM LIGHTS
    # ==========================================================================

    # Two rim lights from behind, left and right
    rim_positions = [
        (-4.0, -7.0, 4.0),  # Rear left
        (4.0, -7.0, 4.0),   # Rear right
    ]

    for i, (rx, ry, rz) in enumerate(rim_positions):
        bpy.ops.object.light_add(
            type="AREA",
            location=(rx, ry, rz)
        )
        rim = bpy.context.active_object
        rim.name = f"Rim_Light_{i}"

        direction = rim.location.normalized()
        rim.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

        rim.data.shape = "RECTANGLE"
        rim.data.size = 2.0
        rim.data.size_y = 3.0
        rim.data.energy = rim_energy * active_preset["rim_energy_mult"]
        rim.data.color = active_preset["rim_color"]

    print("✓ Created rim lights")

    # ==========================================================================
    # 4. CREATE GROUND BOUNCE
    # ==========================================================================

    # Subtle upward-facing light under vehicle for ground reflection simulation
    bpy.ops.object.light_add(
        type="AREA",
        location=(0, 0, -0.5)
    )
    bounce = bpy.context.active_object
    bounce.name = "Ground_Bounce"
    bounce.rotation_euler.x = math.pi  # Face up

    bounce.data.shape = "RECTANGLE"
    bounce.data.size = 6.0
    bounce.data.size_y = 4.0
    bounce.data.energy = key_energy * 0.05
    bounce.data.color = (0.9, 0.9, 0.95)

    print("✓ Created ground bounce")

    # ==========================================================================
    # 5. SET WORLD AMBIENT
    # ==========================================================================

    world = bpy.context.scene.world
    if not world:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world

    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        r, g, b = active_preset["ambient_color"]
        strength = ambient_strength * active_preset["ambient_mult"]
        bg_node.inputs["Color"].default_value = (r, g, b, 1.0)
        bg_node.inputs["Strength"].default_value = strength

    print("✓ Set world ambient")

    # ==========================================================================
    # 6. CREATE PRODUCT CAMERAS
    # ==========================================================================

    # Camera positions for product photography
    camera_setups = [
        {
            "name": "cam_hero_3q",
            "location": (7.0, 8.0, 2.5),
            "focal_length": 50,
            "description": "Hero 3/4 view"
        },
        {
            "name": "cam_front",
            "location": (0, 10.0, 1.8),
            "focal_length": 50,
            "description": "Direct front"
        },
        {
            "name": "cam_rear_3q",
            "location": (-6.0, -8.0, 2.2),
            "focal_length": 50,
            "description": "Rear 3/4 view"
        },
        {
            "name": "cam_profile",
            "location": (12.0, 0, 1.5),
            "focal_length": 85,
            "description": "Side profile"
        },
        {
            "name": "cam_low_drama",
            "location": (5.0, 6.0, 0.4),
            "focal_length": 35,
            "description": "Low dramatic angle"
        },
    ]

    for cam_setup in camera_setups:
        bpy.ops.object.camera_add(location=cam_setup["location"])
        cam = bpy.context.active_object
        cam.name = cam_setup["name"]

        # Point at vehicle center (slightly elevated)
        target = bpy.data.objects.new("target_temp", None)
        target.location = (0, 0, 0.6)
        bpy.context.collection.objects.link(target)

        constraint = cam.constraints.new("TRACK_TO")
        constraint.target = target
        constraint.track_axis = "TRACK_NEGATIVE_Z"
        constraint.up_axis = "UP_Y"

        bpy.context.view_layer.update()
        bpy.ops.constraint.apply(constraint=constraint.name)

        bpy.data.objects.remove(target)

        # Set focal length
        cam.data.lens = cam_setup["focal_length"]
        cam.data.sensor_width = 36

    # Set hero camera as active
    hero_cam = bpy.data.objects.get("cam_hero_3q")
    if hero_cam:
        bpy.context.scene.camera = hero_cam

    print(f"✓ Created {len(camera_setups)} product cameras")

    # ==========================================================================
    # 7. SAVE
    # ==========================================================================

    metadata["preset"] = preset
    metadata["key_energy"] = key_energy * active_preset["key_energy_mult"]
    metadata["fill_ratio"] = fill_ratio
    metadata["rim_energy"] = rim_energy * active_preset["rim_energy_mult"]
    metadata["cameras_created"] = len(camera_setups)

    stage_dir.mkdir(parents=True, exist_ok=True)
    lighting_blend = stage_dir / "lighting_setup.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(lighting_blend))

    print(f"✓ Lighting stage complete ({preset} preset)")

    return {
        "success": True,
        "outputs": [str(lighting_blend)],
        "metadata": metadata,
        "errors": [],
    }
