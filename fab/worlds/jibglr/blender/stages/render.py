"""
Render Stage - Generate preview renders of the scene.

Creates beauty shots for quality review.

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
    """Execute the render stage."""

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

    # Create output directory
    render_dir = run_dir / "render" / "beauty"
    render_dir.mkdir(parents=True, exist_ok=True)

    outputs = []

    # ==========================================================================
    # CONFIGURE RENDER SETTINGS
    # ==========================================================================

    scene = bpy.context.scene

    # Use Cycles for quality renders
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64  # Low samples for preview
    scene.cycles.seed = manifest.get("determinism", {}).get("cycles_seed", 42)

    # Resolution
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100

    # Output format
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    # ==========================================================================
    # CAMERA POSITIONS
    # ==========================================================================

    camera_setups = [
        # (name, location, rotation_euler, focal_length)
        ("overview", (18, -18, 12), (math.radians(60), 0, math.radians(45)), 35),
        ("bridge_view", (8, -6, 3), (math.radians(75), 0, math.radians(35)), 50),
        ("stream_view", (-2, -12, 2), (math.radians(85), 0, math.radians(-10)), 35),
        ("forest_edge", (-15, 5, 4), (math.radians(70), 0, math.radians(-65)), 28),
    ]

    # Create camera if needed
    camera = bpy.data.objects.get("RenderCamera")
    if not camera:
        bpy.ops.object.camera_add()
        camera = bpy.context.active_object
        camera.name = "RenderCamera"

    scene.camera = camera

    # ==========================================================================
    # RENDER VIEWS
    # ==========================================================================

    for view_name, location, rotation, focal_length in camera_setups:
        camera.location = location
        camera.rotation_euler = rotation
        camera.data.lens = focal_length

        output_path = render_dir / f"{view_name}.png"
        scene.render.filepath = str(output_path)

        print(f"  Rendering {view_name}...")

        try:
            bpy.ops.render.render(write_still=True)
            outputs.append(str(output_path))
            print(f"  ✓ Saved {view_name}.png")
        except Exception as e:
            print(f"  ⚠ Failed to render {view_name}: {e}")

    metadata["renders_created"] = len(outputs)
    metadata["resolution"] = f"{scene.render.resolution_x}x{scene.render.resolution_y}"
    metadata["samples"] = scene.cycles.samples

    print(f"✓ Render stage complete: {len(outputs)} images")

    return {
        "success": True,
        "outputs": outputs,
        "metadata": metadata,
        "errors": [],
    }
