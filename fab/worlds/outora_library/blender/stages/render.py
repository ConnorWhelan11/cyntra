"""
Render Stage - Generate preview renders of the library.

This stage produces:
- Beauty renders (with materials and lighting)
- Clay renders (material-free for geometry review)
- Multiple camera angles
- High-resolution preview images

Uses Cycles CPU rendering for determinism.
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
        errors.append(f"Lighting blend file not found: {lighting_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(lighting_blend))

    # Inject determinism for rendering
    seed = manifest.get("determinism", {}).get("cycles_seed", 42)
    bpy.context.scene.cycles.seed = seed
    bpy.context.scene.cycles.use_animated_seed = False

    # Configure Cycles for deterministic rendering
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.device = "CPU"
    bpy.context.scene.cycles.samples = 128  # Adjust for quality/speed tradeoff

    # Set output format
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.image_settings.color_mode = "RGBA"
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1080
    bpy.context.scene.render.resolution_percentage = 100

    # Create output directories
    render_dir = run_dir / "render"
    beauty_dir = render_dir / "beauty"
    clay_dir = render_dir / "clay"

    beauty_dir.mkdir(parents=True, exist_ok=True)
    clay_dir.mkdir(parents=True, exist_ok=True)

    outputs = []

    # ==========================================================================
    # RENDER BEAUTY PASSES
    # ==========================================================================

    # Find or create camera
    camera = bpy.data.objects.get("Camera")
    if not camera:
        # Create default camera if none exists
        bpy.ops.object.camera_add(location=(0, -20, 10))
        camera = bpy.context.active_object
        camera.rotation_euler = (1.1, 0, 0)  # Look at origin

    bpy.context.scene.camera = camera

    # Render from multiple angles
    camera_positions = [
        ("main_hall", (0, -30, 12), (1.2, 0, 0)),
        ("tier_2", (15, -25, 20), (1.1, 0, 0.3)),
        ("wing_detail", (-10, -15, 8), (1.15, 0, -0.2)),
    ]

    print("Rendering beauty passes...")
    for view_name, location, rotation in camera_positions:
        camera.location = location
        camera.rotation_euler = rotation

        output_path = beauty_dir / f"{view_name}.png"
        bpy.context.scene.render.filepath = str(output_path)

        try:
            bpy.ops.render.render(write_still=True)
            outputs.append(str(output_path))
            print(f"  ✓ Rendered: {view_name}")
        except Exception as e:
            errors.append(f"Failed to render {view_name}: {e}")

    # ==========================================================================
    # RENDER CLAY PASSES (material override)
    # ==========================================================================

    print("Rendering clay passes...")

    # Store original materials
    original_materials = {}
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.data.materials:
            original_materials[obj.name] = list(obj.data.materials)

    # Create simple clay material
    clay_mat = bpy.data.materials.get("Clay_Override")
    if not clay_mat:
        clay_mat = bpy.data.materials.new(name="Clay_Override")
        clay_mat.use_nodes = True
        nodes = clay_mat.node_tree.nodes
        nodes.clear()

        # Simple diffuse shader
        bsdf = nodes.new(type="ShaderNodeBsdfDiffuse")
        bsdf.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1.0)
        output = nodes.new(type="ShaderNodeOutputMaterial")
        clay_mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    # Override all materials with clay
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(clay_mat)

    # Render clay views
    for view_name, location, rotation in camera_positions:
        camera.location = location
        camera.rotation_euler = rotation

        output_path = clay_dir / f"{view_name}_clay.png"
        bpy.context.scene.render.filepath = str(output_path)

        try:
            bpy.ops.render.render(write_still=True)
            outputs.append(str(output_path))
            print(f"  ✓ Rendered clay: {view_name}")
        except Exception as e:
            errors.append(f"Failed to render clay {view_name}: {e}")

    # Restore original materials
    for obj_name, mats in original_materials.items():
        obj = bpy.data.objects.get(obj_name)
        if obj:
            obj.data.materials.clear()
            for mat in mats:
                obj.data.materials.append(mat)

    # ==========================================================================
    # METADATA
    # ==========================================================================

    metadata["render_engine"] = "CYCLES"
    metadata["render_device"] = "CPU"
    metadata["render_samples"] = bpy.context.scene.cycles.samples
    metadata["resolution"] = f"{bpy.context.scene.render.resolution_x}x{bpy.context.scene.render.resolution_y}"
    metadata["beauty_renders"] = len([p for p in outputs if "/beauty/" in str(p)])
    metadata["clay_renders"] = len([p for p in outputs if "/clay/" in str(p)])

    success = len(errors) == 0

    if success:
        print(f"✓ Render stage complete: {len(outputs)} images")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
