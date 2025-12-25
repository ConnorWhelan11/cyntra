"""
Render Stage - Render product photography views for quality gate evaluation.

Renders multiple camera angles for the fab-realism gate critics.

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

    # Create render output directory
    render_dir = run_dir / "render" / "beauty"
    render_dir.mkdir(parents=True, exist_ok=True)

    outputs = []

    # ==========================================================================
    # CONFIGURE RENDER SETTINGS
    # ==========================================================================

    scene = bpy.context.scene

    # Resolution for quality gate
    scene.render.resolution_x = 768
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100

    # Cycles settings for determinism
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.seed = manifest.get("determinism", {}).get("cycles_seed", 42)
    scene.cycles.use_animated_seed = False

    # Denoising
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"

    # Output format
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "16"

    # Film
    scene.render.film_transparent = False

    metadata["render_resolution"] = [scene.render.resolution_x, scene.render.resolution_y]
    metadata["render_samples"] = scene.cycles.samples

    print(f"✓ Configured render: {scene.render.resolution_x}x{scene.render.resolution_y} @ {scene.cycles.samples} samples")

    # ==========================================================================
    # RENDER ALL CAMERAS
    # ==========================================================================

    cameras = [obj for obj in bpy.data.objects if obj.type == "CAMERA"]
    rendered_count = 0

    for cam in cameras:
        cam_name = cam.name
        output_path = render_dir / f"beauty_{cam_name}.png"

        print(f"  Rendering {cam_name}...")

        scene.camera = cam
        scene.render.filepath = str(output_path)

        try:
            bpy.ops.render.render(write_still=True)
            outputs.append(str(output_path))
            rendered_count += 1
            print(f"    ✓ {cam_name} complete")
        except Exception as e:
            errors.append(f"Failed to render {cam_name}: {e}")
            print(f"    ✗ {cam_name} failed: {e}")

    metadata["cameras_rendered"] = rendered_count
    metadata["total_cameras"] = len(cameras)

    # ==========================================================================
    # RENDER TURNTABLE (12 frames)
    # ==========================================================================

    turntable_dir = run_dir / "render" / "turntable"
    turntable_dir.mkdir(parents=True, exist_ok=True)

    # Use hero camera for turntable
    hero_cam = bpy.data.objects.get("cam_hero_3q")
    if hero_cam:
        scene.camera = hero_cam

        # Get all vehicle objects to rotate
        vehicle_objects = [obj for obj in bpy.data.objects
                          if obj.type == "MESH" and obj.name.startswith("EV_")]

        turntable_frames = 12
        angle_per_frame = 360.0 / turntable_frames

        print(f"  Rendering turntable ({turntable_frames} frames)...")

        import math
        for frame in range(turntable_frames):
            angle = math.radians(frame * angle_per_frame)

            # Rotate vehicle objects
            for obj in vehicle_objects:
                obj.rotation_euler.z = angle

            output_path = turntable_dir / f"turntable_f{frame:02d}.png"
            scene.render.filepath = str(output_path)

            try:
                bpy.ops.render.render(write_still=True)
                outputs.append(str(output_path))
            except Exception as e:
                errors.append(f"Failed turntable frame {frame}: {e}")

        # Reset rotation
        for obj in vehicle_objects:
            obj.rotation_euler.z = 0

        metadata["turntable_frames"] = turntable_frames
        print(f"    ✓ Turntable complete")

    # ==========================================================================
    # RENDER CLAY (optional for gate)
    # ==========================================================================

    clay_dir = run_dir / "render" / "clay"
    clay_dir.mkdir(parents=True, exist_ok=True)

    # Create clay material override
    mat_clay = bpy.data.materials.new(name="Clay_Override")
    mat_clay.use_nodes = True
    bsdf = mat_clay.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.8, 0.8, 0.8, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.5
        bsdf.inputs["Metallic"].default_value = 0.0

    # Store original materials
    original_materials = {}
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            original_materials[obj.name] = list(obj.data.materials)
            obj.data.materials.clear()
            obj.data.materials.append(mat_clay)

    # Render clay views (hero and profile)
    clay_cameras = ["cam_hero_3q", "cam_profile"]
    for cam_name in clay_cameras:
        cam = bpy.data.objects.get(cam_name)
        if cam:
            scene.camera = cam
            output_path = clay_dir / f"clay_{cam_name}.png"
            scene.render.filepath = str(output_path)

            try:
                bpy.ops.render.render(write_still=True)
                outputs.append(str(output_path))
            except Exception as e:
                errors.append(f"Failed clay render {cam_name}: {e}")

    # Restore original materials
    for obj_name, mats in original_materials.items():
        obj = bpy.data.objects.get(obj_name)
        if obj:
            obj.data.materials.clear()
            for mat in mats:
                obj.data.materials.append(mat)

    metadata["clay_renders"] = len(clay_cameras)
    print("✓ Clay renders complete")

    # ==========================================================================
    # SUMMARY
    # ==========================================================================

    success = len(errors) == 0
    metadata["total_renders"] = len(outputs)

    if success:
        print(f"✓ Render stage complete: {len(outputs)} images")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
