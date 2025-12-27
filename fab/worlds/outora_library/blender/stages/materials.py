"""
Materials Stage - Apply Gothic materials to baked geometry.

This stage applies physically-based materials:
- Stone materials (limestone, granite)
- Wood materials (oak, walnut)
- Metal materials (iron, bronze)
- Glass materials for windows

Based on gothic_materials.py from the original pipeline.
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
    """Execute the materials stage."""

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

    # Load baked scene
    bake_output = run_dir / "world" / "outora_library_baked.blend"
    if not bake_output.exists():
        errors.append(f"Baked blend file not found: {bake_output}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(bake_output))

    # Inject determinism
    seed = manifest.get("determinism", {}).get("seed", 42)
    import random

    random.seed(seed)

    # Get material parameters
    stone_variant = params.get("materials", {}).get(
        "stone_variant", "limestone_weathered"
    )
    wood_variant = params.get("materials", {}).get("wood_variant", "oak_aged")
    color_palette = params.get("materials", {}).get("color_palette", "warm_academic")

    metadata["stone_variant"] = stone_variant
    metadata["wood_variant"] = wood_variant
    metadata["color_palette"] = color_palette

    # Import and run materials module
    repo_root = Path(__file__).resolve().parents[5]
    original_blender_dir = repo_root / "fab" / "assets" / "blender"

    if str(original_blender_dir) not in sys.path:
        sys.path.insert(0, str(original_blender_dir))

    try:
        import gothic_materials as materials
        import importlib

        importlib.reload(materials)

        print(f"Applying materials (stone={stone_variant}, wood={wood_variant})...")
        materials.create_all_materials()
        materials.apply_materials_to_scene()

        metadata["materials_applied"] = True
        metadata["material_count"] = len(bpy.data.materials)

    except Exception as e:
        errors.append(f"Failed to apply materials: {e}")
        import traceback

        errors.append(traceback.format_exc())

    # Save
    stage_dir.mkdir(parents=True, exist_ok=True)
    output_blend = stage_dir / "materials_applied.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    outputs = [str(output_blend)]
    success = len(errors) == 0

    if success:
        print(f"✓ Materials stage complete: {metadata['material_count']} materials")

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
