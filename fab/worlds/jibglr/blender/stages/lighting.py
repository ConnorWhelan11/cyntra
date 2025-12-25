"""
Lighting Stage - Set up sun and ambient lighting.

Applies lighting presets for different moods.

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

    # Load materials scene
    materials_dir = inputs.get("materials")
    if not materials_dir:
        errors.append("Missing 'materials' stage input")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    materials_blend = materials_dir / "materials_setup.blend"
    if not materials_blend.exists():
        errors.append(f"Materials blend not found: {materials_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(materials_blend))

    # Get lighting params
    light_params = params.get("lighting", {})
    preset = light_params.get("preset", "golden_hour")
    sun_angle = light_params.get("sun_angle_deg", 35.0)

    # ==========================================================================
    # LIGHTING PRESETS
    # ==========================================================================

    presets = {
        "golden_hour": {
            "sun_color": (1.0, 0.85, 0.6),
            "sun_energy": 3.0,
            "sun_angle_offset": -15,
            "ambient_color": (0.6, 0.7, 1.0),
            "ambient_strength": 0.3,
        },
        "midday": {
            "sun_color": (1.0, 0.98, 0.95),
            "sun_energy": 5.0,
            "sun_angle_offset": 0,
            "ambient_color": (0.8, 0.9, 1.0),
            "ambient_strength": 0.5,
        },
        "overcast": {
            "sun_color": (0.9, 0.92, 0.95),
            "sun_energy": 1.5,
            "sun_angle_offset": 10,
            "ambient_color": (0.85, 0.88, 0.92),
            "ambient_strength": 0.7,
        },
    }

    active_preset = presets.get(preset, presets["golden_hour"])

    # ==========================================================================
    # CREATE SUN LIGHT
    # ==========================================================================

    bpy.ops.object.light_add(
        type="SUN",
        location=(0, 0, 20)
    )
    sun = bpy.context.active_object
    sun.name = "Sun"

    # Set sun rotation (coming from above/behind)
    effective_angle = sun_angle + active_preset["sun_angle_offset"]
    sun.rotation_euler.x = math.radians(90 - effective_angle)
    sun.rotation_euler.z = math.radians(45)  # From northeast

    # Set sun properties
    sun.data.color = active_preset["sun_color"]
    sun.data.energy = active_preset["sun_energy"]
    sun.data.angle = math.radians(0.5)  # Soft shadows

    print(f"✓ Created sun light with {preset} preset")

    # ==========================================================================
    # WORLD AMBIENT
    # ==========================================================================

    world = bpy.context.scene.world
    if not world:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world

    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        r, g, b = active_preset["ambient_color"]
        strength = active_preset["ambient_strength"]
        bg_node.inputs["Color"].default_value = (r, g, b, 1.0)
        bg_node.inputs["Strength"].default_value = strength

    print("✓ Set world ambient lighting")

    metadata["preset"] = preset
    metadata["sun_angle"] = effective_angle

    # ==========================================================================
    # SAVE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    lighting_blend = stage_dir / "lighting_setup.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(lighting_blend))

    return {
        "success": True,
        "outputs": [str(lighting_blend)],
        "metadata": metadata,
        "errors": [],
    }
