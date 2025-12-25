"""
Prepare Stage - Initialize Blender environment for photo studio scene.

Implements the standard Fab World stage contract.
"""

from pathlib import Path
from typing import Any, Dict, Mapping
import os
import sys


def execute(
    *,
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
    manifest: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute the prepare stage."""

    errors = []
    metadata = {}

    try:
        import bpy
    except ImportError:
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": ["Blender Python (bpy) not available - must run in Blender"],
        }

    # ==========================================================================
    # 1. INJECT DETERMINISM
    # ==========================================================================

    seed = manifest.get("determinism", {}).get("seed", 42)
    pythonhashseed = manifest.get("determinism", {}).get("pythonhashseed", 0)
    cycles_seed = manifest.get("determinism", {}).get("cycles_seed", 42)

    import random
    random.seed(seed)
    metadata["random_seed"] = seed

    bpy.context.scene.frame_current = 1

    if hasattr(bpy.context.scene, "cycles"):
        bpy.context.scene.cycles.seed = cycles_seed
        bpy.context.scene.cycles.use_animated_seed = False
        metadata["cycles_seed"] = cycles_seed

    actual_pythonhashseed = os.environ.get("PYTHONHASHSEED", "not set")
    if actual_pythonhashseed != str(pythonhashseed):
        errors.append(
            f"PYTHONHASHSEED mismatch: expected {pythonhashseed}, got {actual_pythonhashseed}"
        )

    metadata["pythonhashseed"] = actual_pythonhashseed

    # ==========================================================================
    # 2. CLEAN SCENE
    # ==========================================================================

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    # ==========================================================================
    # 3. CONFIGURE SCENE SETTINGS FOR STUDIO RENDERING
    # ==========================================================================

    bpy.context.scene.cycles.device = "CPU"
    bpy.context.preferences.filepaths.use_relative_paths = False
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.length_unit = "METERS"

    # High-quality render settings for product photography
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 256
    bpy.context.scene.cycles.use_denoising = True
    bpy.context.scene.cycles.denoiser = "OPENIMAGEDENOISE"

    # Film settings for studio look
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium Contrast"

    metadata["render_device"] = bpy.context.scene.cycles.device
    metadata["render_samples"] = bpy.context.scene.cycles.samples
    metadata["unit_system"] = bpy.context.scene.unit_settings.system

    # ==========================================================================
    # 4. RECORD VERSIONS
    # ==========================================================================

    metadata["blender_version"] = bpy.app.version_string
    metadata["python_version"] = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"

    # ==========================================================================
    # 5. SAVE PREPARED SCENE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    prepared_blend = stage_dir / "prepared.blend"

    bpy.ops.wm.save_as_mainfile(filepath=str(prepared_blend))

    outputs = [str(prepared_blend)]

    success = len(errors) == 0

    if success:
        print("✓ Prepare stage complete (photo studio)")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
