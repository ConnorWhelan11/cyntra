"""
Lighting Stage - Set up Gothic cathedral lighting.

This stage configures:
- Window light emission
- Chandeliers and ambient sources
- HDRI environment
- Lighting presets (dramatic, warm_reading, cosmic)

Based on gothic_lighting.py from the original pipeline.
"""

from pathlib import Path
from typing import Any, Dict, Mapping
import sys


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

    materials_blend = materials_dir / "materials_applied.blend"
    if not materials_blend.exists():
        errors.append(f"Materials blend file not found: {materials_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(materials_blend))

    # Inject determinism
    seed = manifest.get("determinism", {}).get("seed", 42)
    import random
    random.seed(seed)

    # Get lighting parameters
    preset = params.get("lighting", {}).get("preset", "dramatic")
    window_emission = params.get("lighting", {}).get("window_emission", 2.5)
    chandelier_count = params.get("lighting", {}).get("chandelier_count", 8)

    metadata["lighting_preset"] = preset
    metadata["window_emission"] = window_emission
    metadata["chandelier_count"] = chandelier_count

    # Import and run lighting module
    repo_root = Path(__file__).resolve().parents[5]
    original_blender_dir = repo_root / "fab" / "outora-library" / "blender"

    if str(original_blender_dir) not in sys.path:
        sys.path.insert(0, str(original_blender_dir))

    try:
        import gothic_lighting as lighting
        import importlib
        importlib.reload(lighting)

        print(f"Setting up lighting (preset={preset}, emission={window_emission})...")
        lighting.create_lighting_setup(clear_existing=True)

        metadata["lighting_setup"] = True
        metadata["light_count"] = len([obj for obj in bpy.data.objects if obj.type == "LIGHT"])

    except Exception as e:
        errors.append(f"Failed to setup lighting: {e}")
        import traceback
        errors.append(traceback.format_exc())

    # Save
    stage_dir.mkdir(parents=True, exist_ok=True)
    output_blend = stage_dir / "lighting_setup.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    outputs = [str(output_blend)]
    success = len(errors) == 0

    if success:
        print(f"✓ Lighting stage complete: {metadata.get('light_count', 0)} lights")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
