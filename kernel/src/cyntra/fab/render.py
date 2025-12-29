"""
Fab Render Harness - Headless Blender Rendering

This module provides deterministic canonical rendering of assets through Blender.
It produces beauty renders, clay renders, and render passes for critic evaluation.

Usage:
    python -m cyntra.fab.render --help
    python -m cyntra.fab.render --asset asset.glb --config car_realism_v001 --out /tmp/renders
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from .config import GateConfig, find_gate_config, load_gate_config

logger = logging.getLogger(__name__)

# Path to lighting presets
PRESETS_DIR = Path(__file__).parent.parent.parent.parent.parent / "fab" / "lookdev" / "presets"

# Path to the Blender render script (bundled with this module)
BLENDER_SCRIPT_PATH = Path(__file__).parent / "blender_scripts" / "render_harness.py"


@dataclass
class RenderResult:
    """Result from render harness execution."""

    success: bool
    output_dir: Path
    beauty_renders: list[str] = field(default_factory=list)
    clay_renders: list[str] = field(default_factory=list)
    passes: dict[str, list[str]] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    blender_version: str | None = None
    duration_ms: int = 0
    exposure: float = 0.0  # EV offset used for this render


@dataclass
class BracketResult:
    """Result from exposure-bracketed rendering."""

    bracket_results: dict[float, RenderResult] = field(default_factory=dict)
    best_exposure: float = 0.0
    best_result: RenderResult | None = None
    all_exposures: list[float] = field(default_factory=list)


def load_lighting_preset(preset_name: str) -> dict[str, Any]:
    """
    Load a lighting preset from YAML file.

    Args:
        preset_name: Name of the preset (e.g., "car_studio")

    Returns:
        Preset configuration dict

    Raises:
        FileNotFoundError: If preset not found
    """
    # Search for preset file
    preset_path = PRESETS_DIR / f"{preset_name}.yaml"

    if not preset_path.exists():
        # Try alternate paths
        alt_paths = [
            Path(f"fab/lookdev/presets/{preset_name}.yaml"),
            Path(__file__).parent / "presets" / f"{preset_name}.yaml",
        ]
        for alt in alt_paths:
            if alt.exists():
                preset_path = alt
                break
        else:
            raise FileNotFoundError(f"Lighting preset '{preset_name}' not found in {PRESETS_DIR}")

    with open(preset_path) as f:
        preset = yaml.safe_load(f)

    logger.info(f"Loaded lighting preset: {preset_name}")
    return preset


def find_blender() -> Path | None:
    """Find Blender executable on the system."""
    # Common locations - prefer app bundle paths on macOS
    candidates = [
        # macOS app bundle (preferred - has all resources)
        "/Applications/Blender.app/Contents/MacOS/Blender",
        # Linux
        "/usr/bin/blender",
        "/usr/local/bin/blender",
        "/snap/bin/blender",
        # Windows
        "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe",
        "C:/Program Files/Blender Foundation/Blender 4.1/blender.exe",
        "C:/Program Files/Blender Foundation/Blender 4.0/blender.exe",
    ]

    # Check common locations first (app bundle is more reliable on macOS)
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return path

    # Fall back to PATH
    blender_path = shutil.which("blender")
    if blender_path:
        # On macOS, symlinks to the binary may not work properly
        # Check if it's a symlink to an app bundle
        real_path = Path(blender_path).resolve()
        if "Blender.app" in str(real_path):
            # Use the app bundle path instead
            app_path = Path("/Applications/Blender.app/Contents/MacOS/Blender")
            if app_path.exists():
                return app_path
        return real_path

    return None


def get_blender_version(blender_path: Path) -> str | None:
    """Get Blender version string."""
    try:
        result = subprocess.run(
            [str(blender_path), "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            # Parse "Blender 4.1.0" from output
            for line in result.stdout.split("\n"):
                if line.startswith("Blender"):
                    parts = line.split()
                    if len(parts) >= 2:
                        return parts[1]
        return None
    except Exception as e:
        logger.warning(f"Failed to get Blender version: {e}")
        return None


def prepare_render_config(
    gate_config: GateConfig,
    asset_path: Path,
    output_dir: Path,
    lookdev_scene: Path | None = None,
    camera_rig: Path | None = None,
    exposure_override: float | None = None,
) -> dict[str, Any]:
    """Prepare configuration for Blender script."""
    render = gate_config.render
    lighting = render.lighting

    # Load lighting preset if specified
    preset_data = None
    if lighting.preset:
        try:
            preset_data = load_lighting_preset(lighting.preset)
        except FileNotFoundError as e:
            logger.warning(f"Lighting preset not found: {e}")

    # Determine exposure value
    exposure = exposure_override if exposure_override is not None else render.exposure

    return {
        "asset_path": str(asset_path.absolute()),
        "output_dir": str(output_dir.absolute()),
        "lookdev_scene": str(lookdev_scene.absolute()) if lookdev_scene else None,
        "camera_rig": str(camera_rig.absolute()) if camera_rig else None,
        "render": {
            "engine": render.engine,
            "device": render.device,
            "resolution": list(render.resolution),
            "samples": render.samples,
            "seed": render.seed,
            "denoise": render.denoise,
            "threads": render.threads,
            "output_format": render.output_format,
            "color_depth": render.color_depth,
            "exposure": exposure,
        },
        "lighting": {
            "preset": lighting.preset,
            "preset_data": preset_data,
            "key_energy": lighting.key_energy,
            "fill_energy": lighting.fill_energy,
            "rim_energy": lighting.rim_energy,
            "hdri": lighting.hdri,
            "hdri_strength": lighting.hdri_strength,
            "hdri_rotation_deg": lighting.hdri_rotation_deg,
            "ambient_strength": lighting.ambient_strength,
        },
        "views": (gate_config.critics.get("category", {}).params if gate_config.critics else {}),
        "gate_config_id": gate_config.gate_config_id,
    }


def run_blender_render(
    blender_path: Path,
    asset_path: Path,
    output_dir: Path,
    render_config: dict[str, Any],
    timeout_seconds: int = 900,  # 15 minutes default
) -> RenderResult:
    """
    Run Blender headless to render the asset.

    Args:
        blender_path: Path to Blender executable
        asset_path: Path to asset file (.glb)
        output_dir: Directory for render output
        render_config: Configuration dict for Blender script
        timeout_seconds: Render timeout

    Returns:
        RenderResult with paths to rendered images
    """
    start_time = datetime.now(UTC)

    # Resolve early so macOS app-bundle cwd overrides don't break relative paths.
    output_dir = output_dir.resolve()

    # Ensure output directories exist
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "beauty").mkdir(exist_ok=True)
    (output_dir / "clay").mkdir(exist_ok=True)
    (output_dir / "passes").mkdir(exist_ok=True)
    (output_dir / "logs").mkdir(exist_ok=True)

    # Write config to temp file for Blender script
    config_file = output_dir / "render_config.json"
    with open(config_file, "w") as f:
        json.dump(render_config, f, indent=2)

    # Check if render script exists
    if not BLENDER_SCRIPT_PATH.exists():
        logger.warning(f"Blender script not found at {BLENDER_SCRIPT_PATH}, using inline script")
        # Use inline minimal script for now
        script_content = generate_inline_render_script()
        script_file = output_dir / "render_script.py"
        with open(script_file, "w") as f:
            f.write(script_content)
        script_path = script_file
    else:
        script_path = BLENDER_SCRIPT_PATH

    # Build Blender command
    cmd = [
        str(blender_path),
        "--background",
        "--factory-startup",
        "--python",
        str(script_path),
        "--",
        "--config",
        str(config_file),
    ]

    # Set environment for determinism
    env = os.environ.copy()
    env["PYTHONHASHSEED"] = "0"

    # For macOS app bundle, we need to run from within the bundle directory
    # to ensure Blender can find its resources
    cwd = str(output_dir)
    if "Blender.app" in str(blender_path):
        cwd = str(blender_path.parent)
        logger.info(f"Running from app bundle directory: {cwd}")

    logger.info(f"Running Blender: {' '.join(cmd)}")

    # Run Blender
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            env=env,
            cwd=cwd,
        )

        # Save logs
        stdout_log = output_dir / "logs" / "blender_stdout.log"
        stderr_log = output_dir / "logs" / "blender_stderr.log"
        stdout_log.write_text(result.stdout)
        stderr_log.write_text(result.stderr)

        success = result.returncode == 0

        if not success:
            logger.error(f"Blender failed with exit code {result.returncode}")
            logger.error(f"stderr: {result.stderr[:500]}")

    except subprocess.TimeoutExpired:
        logger.error(f"Blender render timed out after {timeout_seconds}s")
        return RenderResult(
            success=False,
            output_dir=output_dir,
            errors=["RENDER_TIMEOUT"],
        )
    except Exception as e:
        logger.error(f"Blender execution failed: {e}")
        return RenderResult(
            success=False,
            output_dir=output_dir,
            errors=[f"BLENDER_ERROR: {str(e)}"],
        )

    # Collect rendered files
    beauty_renders = sorted([str(p) for p in (output_dir / "beauty").glob("*.png")])
    clay_renders = sorted([str(p) for p in (output_dir / "clay").glob("*.png")])

    end_time = datetime.now(UTC)
    duration_ms = int((end_time - start_time).total_seconds() * 1000)

    return RenderResult(
        success=success and len(beauty_renders) > 0,
        output_dir=output_dir,
        beauty_renders=beauty_renders,
        clay_renders=clay_renders,
        passes={},
        errors=[] if success else [f"Exit code: {result.returncode}"],
        blender_version=get_blender_version(blender_path),
        duration_ms=duration_ms,
    )


def generate_inline_render_script() -> str:
    """Generate an inline Blender Python script for rendering."""
    return '''"""
Fab Render Harness - Blender Script
This script is executed inside Blender to perform headless rendering.
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy


def setup_render_settings(config: dict):
    """Configure render settings from config."""
    scene = bpy.context.scene
    render = config.get("render", {})

    # Engine
    scene.render.engine = "CYCLES" if render.get("engine") == "CYCLES" else "BLENDER_EEVEE"

    # Device
    if scene.render.engine == "CYCLES":
        bpy.context.preferences.addons["cycles"].preferences.compute_device_type = "NONE"
        scene.cycles.device = "CPU"

    # Resolution
    res = render.get("resolution", [768, 512])
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100

    # Samples
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = render.get("samples", 128)
        scene.cycles.seed = render.get("seed", 1337)
        scene.cycles.use_denoising = render.get("denoise", False)

    # Output format
    scene.render.image_settings.file_format = render.get("output_format", "PNG")
    scene.render.image_settings.color_depth = str(render.get("color_depth", 16))
    scene.render.image_settings.color_mode = "RGBA"

    # Film
    scene.render.film_transparent = False

    # Exposure (applied via color management)
    exposure = render.get("exposure", 0.0)
    if hasattr(scene, "view_settings"):
        scene.view_settings.exposure = exposure


def import_asset(asset_path: str) -> list:
    """Import GLB/GLTF asset and return imported objects."""
    # Clear existing mesh objects
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.ops.object.delete()

    # Import GLB
    bpy.ops.import_scene.gltf(filepath=asset_path)

    # Get imported objects
    imported = [obj for obj in bpy.context.selected_objects]

    return imported


def normalize_asset(objects: list):
    """Normalize asset origin and position."""
    if not objects:
        return

    # Join objects to compute bounds
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj.type == "MESH":
            obj.select_set(True)

    if not bpy.context.selected_objects:
        return

    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]

    # Compute bounding box
    min_z = float("inf")
    for obj in objects:
        if obj.type == "MESH":
            for v in obj.data.vertices:
                world_co = obj.matrix_world @ v.co
                min_z = min(min_z, world_co.z)

    # Move to ground
    if min_z != float("inf"):
        for obj in objects:
            obj.location.z -= min_z


def setup_camera(index: int, total: int, distance: float = 5.0):
    """Setup camera for turntable rendering."""
    angle = (index / total) * 2 * math.pi

    cam = bpy.data.objects.get("Camera")
    if not cam:
        bpy.ops.object.camera_add()
        cam = bpy.context.object

    cam.location.x = math.sin(angle) * distance
    cam.location.y = -math.cos(angle) * distance
    cam.location.z = distance * 0.4

    # Point at origin
    direction = -cam.location
    rot_quat = direction.to_track_quat("-Z", "Y")
    cam.rotation_euler = rot_quat.to_euler()

    bpy.context.scene.camera = cam


def setup_lighting(config: dict = None):
    """Setup lighting from config or defaults."""
    # Clear existing lights
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj)

    lighting = config.get("lighting", {}) if config else {}
    preset_data = lighting.get("preset_data", {})

    # Use preset data if available, otherwise use inline config or defaults
    if preset_data:
        key_cfg = preset_data.get("key_light", {})
        fill_cfg = preset_data.get("fill_light", {})
        rim_cfg = preset_data.get("rim_light", {})
    else:
        key_cfg = {}
        fill_cfg = {}
        rim_cfg = {}

    # Key light
    key_loc = key_cfg.get("location", [3, -3, 5])
    bpy.ops.object.light_add(type="AREA", location=tuple(key_loc))
    key = bpy.context.object
    key.name = "Key_Light"
    key.data.energy = lighting.get("key_energy") or key_cfg.get("energy", 500)
    key.data.size = key_cfg.get("size", 2)
    key_color = key_cfg.get("color", [1.0, 1.0, 1.0])
    key.data.color = tuple(key_color[:3])

    # Fill light
    fill_loc = fill_cfg.get("location", [-3, -2, 3])
    bpy.ops.object.light_add(type="AREA", location=tuple(fill_loc))
    fill = bpy.context.object
    fill.name = "Fill_Light"
    fill.data.energy = lighting.get("fill_energy") or fill_cfg.get("energy", 200)
    fill.data.size = fill_cfg.get("size", 3)
    fill_color = fill_cfg.get("color", [1.0, 1.0, 1.0])
    fill.data.color = tuple(fill_color[:3])

    # Rim light
    rim_loc = rim_cfg.get("location", [0, 4, 4])
    bpy.ops.object.light_add(type="AREA", location=tuple(rim_loc))
    rim = bpy.context.object
    rim.name = "Rim_Light"
    rim.data.energy = lighting.get("rim_energy") or rim_cfg.get("energy", 300)
    rim.data.size = rim_cfg.get("size", 2)
    rim_color = rim_cfg.get("color", [1.0, 1.0, 1.0])
    rim.data.color = tuple(rim_color[:3])

    # Add accent lights from preset
    for i, accent in enumerate(preset_data.get("accent_lights", [])):
        accent_loc = accent.get("location", [0, 0, 3])
        bpy.ops.object.light_add(type="AREA", location=tuple(accent_loc))
        accent_light = bpy.context.object
        accent_light.name = f"Accent_Light_{i}"
        accent_light.data.energy = accent.get("energy", 100)
        accent_light.data.size = accent.get("size", 1)
        accent_color = accent.get("color", [1.0, 1.0, 1.0])
        accent_light.data.color = tuple(accent_color[:3])

    # Setup HDRI environment if specified
    hdri_name = lighting.get("hdri") or preset_data.get("hdri")
    if hdri_name:
        setup_hdri_environment(
            hdri_name,
            strength=lighting.get("hdri_strength", preset_data.get("hdri_strength", 0.5)),
            rotation=lighting.get("hdri_rotation_deg", preset_data.get("hdri_rotation_deg", 0.0)),
        )


def setup_hdri_environment(hdri_name: str, strength: float = 0.5, rotation: float = 0.0):
    """Setup HDRI environment lighting."""
    import os

    # Find HDRI file
    hdri_paths = [
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "fab", "lookdev", "hdris", f"{hdri_name}.hdr"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "fab", "lookdev", "hdris", f"{hdri_name}.exr"),
        f"/tmp/hdris/{hdri_name}.hdr",
    ]

    hdri_path = None
    for path in hdri_paths:
        if os.path.exists(path):
            hdri_path = path
            break

    if not hdri_path:
        print(f"HDRI not found: {hdri_name}")
        return

    # Setup world nodes
    world = bpy.context.scene.world
    if not world:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world

    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links

    nodes.clear()

    # Create nodes
    env_tex = nodes.new("ShaderNodeTexEnvironment")
    env_tex.image = bpy.data.images.load(hdri_path)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value[2] = math.radians(rotation)

    tex_coord = nodes.new("ShaderNodeTexCoord")

    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = strength

    output = nodes.new("ShaderNodeOutputWorld")

    # Link nodes
    links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], env_tex.inputs["Vector"])
    links.new(env_tex.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])

    print(f"HDRI loaded: {hdri_name} (strength={strength}, rotation={rotation})")


def setup_ground():
    """Setup ground plane with shadow catcher."""
    # Add ground plane
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "Ground"

    # Create material
    mat = bpy.data.materials.new(name="Ground_Material")
    if hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    if mat.node_tree:
        nodes = mat.node_tree.nodes
        principled = nodes.get("Principled BSDF")
        if principled:
            principled.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
            principled.inputs["Roughness"].default_value = 0.8

    ground.data.materials.append(mat)

    # Shadow catcher (Cycles) - compatible with Blender 4.x and 5.x
    if bpy.context.scene.render.engine == "CYCLES":
        if hasattr(ground, "is_shadow_catcher"):
            ground.is_shadow_catcher = True


def create_clay_material():
    """Create neutral clay material for geometry evaluation."""
    mat = bpy.data.materials.new(name="Clay_Material")
    if hasattr(mat, "use_nodes"):
        mat.use_nodes = True

    if mat.node_tree:
        nodes = mat.node_tree.nodes
        principled = nodes.get("Principled BSDF")
        if principled:
            # Neutral gray
            principled.inputs["Base Color"].default_value = (0.6, 0.6, 0.6, 1)
            principled.inputs["Roughness"].default_value = 0.7
            principled.inputs["Metallic"].default_value = 0.0

    return mat


def apply_clay_material(objects: list, clay_mat):
    """Apply clay material to all mesh objects."""
    for obj in objects:
        if obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(clay_mat)


def render_views(output_dir: str, mode: str, num_views: int = 6):
    """Render multiple views."""
    output_path = Path(output_dir) / mode
    output_path.mkdir(exist_ok=True)

    # Fixed camera positions (azimuth, elevation in degrees)
    fixed_views = [
        ("front_3q", 45, 15),
        ("rear_3q", 225, 15),
        ("side_left", 90, 5),
        ("front", 0, 10),
        ("top", 0, 75),
    ]

    for name, azimuth, elevation in fixed_views:
        angle_rad = math.radians(azimuth)
        elev_rad = math.radians(elevation)
        distance = 5.0

        cam = bpy.data.objects.get("Camera") or bpy.context.scene.camera
        if cam:
            cam.location.x = math.sin(angle_rad) * math.cos(elev_rad) * distance
            cam.location.y = -math.cos(angle_rad) * math.cos(elev_rad) * distance
            cam.location.z = math.sin(elev_rad) * distance

            # Point at origin
            from mathutils import Vector
            direction = Vector((0, 0, 0.5)) - cam.location
            rot_quat = direction.to_track_quat("-Z", "Y")
            cam.rotation_euler = rot_quat.to_euler()

        # Render
        filepath = str(output_path / f"{mode}_{name}.png")
        bpy.context.scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)
        print(f"Rendered: {filepath}")

    # Turntable frames
    for i in range(12):
        setup_camera(i, 12, distance=5.0)
        filepath = str(output_path / f"{mode}_turntable_f{i:02d}.png")
        bpy.context.scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)
        print(f"Rendered: {filepath}")


def main():
    # Parse arguments after "--"
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to render config JSON")
    args = parser.parse_args(argv)

    # Load config
    with open(args.config, "r") as f:
        config = json.load(f)

    asset_path = config["asset_path"]
    output_dir = config["output_dir"]

    print(f"Fab Render Harness")
    print(f"Asset: {asset_path}")
    print(f"Output: {output_dir}")

    # Setup scene
    setup_render_settings(config)
    setup_lighting(config)
    setup_ground()

    # Import and normalize asset
    objects = import_asset(asset_path)
    normalize_asset(objects)

    # Store original materials
    original_materials = {}
    for obj in objects:
        if obj.type == "MESH":
            original_materials[obj.name] = list(obj.data.materials)

    # Render beauty views
    print("\\nRendering beauty views...")
    render_views(output_dir, "beauty")

    # Apply clay material and render
    print("\\nRendering clay views...")
    clay_mat = create_clay_material()
    apply_clay_material(objects, clay_mat)
    render_views(output_dir, "clay")

    print("\\nRender complete!")


if __name__ == "__main__":
    main()
'''


def run_render_harness(
    asset_path: Path,
    config: GateConfig,
    output_dir: Path,
    lookdev_scene: Path | None = None,
    camera_rig: Path | None = None,
    blender_path: Path | None = None,
) -> RenderResult:
    """
    Run the full render harness pipeline.

    Args:
        asset_path: Path to asset file (.glb)
        config: Gate configuration
        output_dir: Output directory for renders
        lookdev_scene: Optional lookdev scene file
        camera_rig: Optional camera rig JSON
        blender_path: Optional Blender executable path

    Returns:
        RenderResult with render outputs
    """
    # Find Blender
    if blender_path is None:
        blender_path = find_blender()

    if blender_path is None:
        logger.error("Blender not found. Please install Blender or specify --blender path")
        return RenderResult(
            success=False,
            output_dir=output_dir,
            errors=["BLENDER_NOT_FOUND"],
        )

    logger.info(f"Using Blender: {blender_path}")

    # Validate asset
    if not asset_path.exists():
        logger.error(f"Asset not found: {asset_path}")
        return RenderResult(
            success=False,
            output_dir=output_dir,
            errors=["IMPORT_FILE_NOT_FOUND"],
        )

    # Prepare config
    render_config = prepare_render_config(config, asset_path, output_dir, lookdev_scene, camera_rig)

    # Run Blender
    result = run_blender_render(
        blender_path=blender_path,
        asset_path=asset_path,
        output_dir=output_dir,
        render_config=render_config,
    )
    result.exposure = config.render.exposure
    return result


def render_with_brackets(
    asset_path: Path,
    config: GateConfig,
    output_dir: Path,
    lookdev_scene: Path | None = None,
    camera_rig: Path | None = None,
    blender_path: Path | None = None,
    critic_func: callable = None,
) -> BracketResult:
    """
    Render asset at multiple exposure levels and select best based on critic scores.

    This helps avoid false negatives from clipped highlights/shadows by rendering
    at different exposures and evaluating each with critics.

    Args:
        asset_path: Path to asset file (.glb)
        config: Gate configuration (must have exposure_bracket.enabled=True)
        output_dir: Base output directory
        lookdev_scene: Optional lookdev scene file
        camera_rig: Optional camera rig JSON
        blender_path: Optional Blender executable path
        critic_func: Optional function(RenderResult) -> float to score renders

    Returns:
        BracketResult with all renders and best selection
    """
    bracket_config = config.render.exposure_bracket

    if not bracket_config.enabled:
        # Single render at default exposure
        result = run_render_harness(
            asset_path=asset_path,
            config=config,
            output_dir=output_dir,
            lookdev_scene=lookdev_scene,
            camera_rig=camera_rig,
            blender_path=blender_path,
        )
        return BracketResult(
            bracket_results={config.render.exposure: result},
            best_exposure=config.render.exposure,
            best_result=result,
            all_exposures=[config.render.exposure],
        )

    brackets = bracket_config.brackets
    logger.info(f"Rendering with exposure brackets: {brackets}")

    bracket_results: dict[float, RenderResult] = {}
    scores: dict[float, float] = {}

    for exposure in brackets:
        # Create exposure-specific output directory
        exp_suffix = f"exp_{exposure:+.1f}".replace(".", "_").replace("+", "p").replace("-", "m")
        exp_output_dir = output_dir / exp_suffix

        # Prepare config with exposure override
        render_config = prepare_render_config(
            config,
            asset_path,
            exp_output_dir,
            lookdev_scene,
            camera_rig,
            exposure_override=exposure,
        )

        # Find Blender if needed
        if blender_path is None:
            blender_path = find_blender()

        if blender_path is None:
            logger.error("Blender not found")
            return BracketResult(
                bracket_results={},
                best_exposure=0.0,
                best_result=None,
                all_exposures=list(brackets),
            )

        # Render
        result = run_blender_render(
            blender_path=blender_path,
            asset_path=asset_path,
            output_dir=exp_output_dir,
            render_config=render_config,
        )
        result.exposure = exposure
        bracket_results[exposure] = result

        # Score if critic function provided
        if critic_func and result.success:
            try:
                score = critic_func(result)
                scores[exposure] = score
                logger.info(f"Exposure {exposure:+.1f}: score={score:.3f}")
            except Exception as e:
                logger.warning(f"Critic failed for exposure {exposure}: {e}")
                scores[exposure] = 0.0
        elif result.success:
            # Default scoring: prefer neutral exposure
            scores[exposure] = 1.0 - abs(exposure) * 0.1

    # Select best result
    if scores:
        best_exposure = max(scores, key=lambda e: scores[e])
    else:
        # Fallback to neutral exposure
        best_exposure = 0.0 if 0.0 in bracket_results else list(bracket_results.keys())[0]

    best_result = bracket_results.get(best_exposure)

    logger.info(f"Best exposure: {best_exposure:+.1f}")

    return BracketResult(
        bracket_results=bracket_results,
        best_exposure=best_exposure,
        best_result=best_result,
        all_exposures=list(brackets),
    )


def main(args: list[str] = None) -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="fab-render",
        description="Fab Render Harness - Headless Blender rendering for asset evaluation",
    )

    parser.add_argument(
        "--asset",
        type=Path,
        required=True,
        help="Path to asset file (.glb)",
    )

    parser.add_argument(
        "--config",
        type=str,
        default="car_realism_v001",
        help="Gate config ID or path to YAML file",
    )

    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output directory for renders",
    )

    parser.add_argument(
        "--lookdev",
        type=Path,
        help="Path to lookdev scene (.blend)",
    )

    parser.add_argument(
        "--camera-rig",
        type=Path,
        help="Path to camera rig JSON",
    )

    parser.add_argument(
        "--blender",
        type=Path,
        help="Path to Blender executable",
    )

    parser.add_argument(
        "--lighting-preset",
        type=str,
        help="Lighting preset name (e.g., car_studio, furniture_showroom)",
    )

    parser.add_argument(
        "--exposure",
        type=float,
        default=None,
        help="Exposure offset in EV (default: from config)",
    )

    parser.add_argument(
        "--bracket",
        action="store_true",
        help="Enable exposure bracketing (renders at -0.5, 0, +0.5 EV)",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    parser.add_argument(
        "--json",
        action="store_true",
        help="Output result as JSON",
    )

    parsed = parser.parse_args(args)

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if parsed.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Load gate config
    try:
        config_path = Path(parsed.config)
        if config_path.exists() and config_path.suffix in (".yaml", ".yml"):
            gate_config = load_gate_config(config_path)
        else:
            config_path = find_gate_config(parsed.config)
            gate_config = load_gate_config(config_path)
    except FileNotFoundError as e:
        logger.error(f"Config not found: {e}")
        return 1

    # Apply CLI overrides
    if parsed.lighting_preset:
        gate_config.render.lighting.preset = parsed.lighting_preset
    if parsed.exposure is not None:
        gate_config.render.exposure = parsed.exposure
    if parsed.bracket:
        gate_config.render.exposure_bracket.enabled = True

    # Run render harness (with bracketing if enabled)
    if gate_config.render.exposure_bracket.enabled:
        bracket_result = render_with_brackets(
            asset_path=parsed.asset,
            config=gate_config,
            output_dir=parsed.out,
            lookdev_scene=parsed.lookdev,
            camera_rig=parsed.camera_rig,
            blender_path=parsed.blender,
        )
        result = bracket_result.best_result
        if result is None:
            logger.error("All bracket renders failed")
            return 1
    else:
        result = run_render_harness(
            asset_path=parsed.asset,
            config=gate_config,
            output_dir=parsed.out,
            lookdev_scene=parsed.lookdev,
            camera_rig=parsed.camera_rig,
            blender_path=parsed.blender,
        )

    # Output result
    if parsed.json:
        output = {
            "success": result.success,
            "output_dir": str(result.output_dir),
            "beauty_renders": result.beauty_renders,
            "clay_renders": result.clay_renders,
            "errors": result.errors,
            "blender_version": result.blender_version,
            "duration_ms": result.duration_ms,
            "exposure": result.exposure,
        }
        print(json.dumps(output, indent=2))
    else:
        print(f"\n{'=' * 60}")
        print("Fab Render Harness Result")
        print(f"{'=' * 60}")
        print(f"Success:    {result.success}")
        print(f"Output:     {result.output_dir}")
        print(f"Blender:    {result.blender_version or 'unknown'}")
        print(f"Duration:   {result.duration_ms}ms")
        print(f"\nBeauty renders: {len(result.beauty_renders)}")
        for r in result.beauty_renders[:5]:
            print(f"  - {Path(r).name}")
        if len(result.beauty_renders) > 5:
            print(f"  ... and {len(result.beauty_renders) - 5} more")
        print(f"\nClay renders: {len(result.clay_renders)}")
        for r in result.clay_renders[:5]:
            print(f"  - {Path(r).name}")
        if result.errors:
            print("\nErrors:")
            for e in result.errors:
                print(f"  - {e}")
        print(f"{'=' * 60}\n")

    return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(main())
