"""
Bake Stage - Instance Gothic layout from Sverchok output.

This stage:
1. Runs the Sverchok layout generator (sverchok_layout_v2.py)
2. Instances kit pieces at layout positions
3. Applies transformations and hierarchy
4. Bakes the final layout

Based on bake_gothic_v2.py from the original pipeline.
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
    """Execute the bake stage."""

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

    # ==========================================================================
    # 1. LOAD GENERATED SCENE
    # ==========================================================================

    generate_dir = inputs.get("generate")
    if not generate_dir:
        errors.append("Missing 'generate' stage input")
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": errors,
        }

    generated_blend = generate_dir / "kit_pieces.blend"
    if not generated_blend.exists():
        errors.append(f"Generated blend file not found: {generated_blend}")
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": errors,
        }

    # Open the generated scene
    bpy.ops.wm.open_mainfile(filepath=str(generated_blend))

    # ==========================================================================
    # 2. INJECT DETERMINISM
    # ==========================================================================

    seed = manifest.get("determinism", {}).get("seed", 42)
    import random

    random.seed(seed)

    if hasattr(bpy.context.scene, "cycles"):
        bpy.context.scene.cycles.seed = seed

    # ==========================================================================
    # 3. GET PARAMETERS
    # ==========================================================================

    bake_mode = params.get("bake", {}).get("mode", "all")
    complexity = params.get("layout", {}).get("complexity", "medium")

    metadata["bake_mode"] = bake_mode
    metadata["complexity"] = complexity

    # ==========================================================================
    # 4. IMPORT AND RUN LAYOUT BAKING
    # ==========================================================================

    # Add the original blender scripts directory to path
    repo_root = Path(__file__).resolve().parents[5]
    original_blender_dir = repo_root / "fab" / "assets" / "blender"

    if str(original_blender_dir) not in sys.path:
        sys.path.insert(0, str(original_blender_dir))

    try:
        # Import the bake module
        import bake_gothic_v2 as bake
        import importlib

        importlib.reload(bake)

        # Run the baking process
        print(f"Baking Gothic layout (mode={bake_mode}, complexity={complexity})...")

        # The bake module expects to find the OL_Assets collection
        kit_collection = bpy.data.collections.get("OL_Assets")
        if not kit_collection:
            errors.append("OL_Assets collection not found - kit pieces missing")
            return {
                "success": False,
                "outputs": [],
                "metadata": metadata,
                "errors": errors,
            }

        # Run the main baking function
        bake.bake_all()

        metadata["bake_completed"] = True

    except Exception as e:
        errors.append(f"Failed to bake layout: {e}")
        import traceback

        errors.append(traceback.format_exc())
        return {
            "success": False,
            "outputs": [],
            "metadata": metadata,
            "errors": errors,
        }

    # ==========================================================================
    # 5. COUNT BAKED OBJECTS
    # ==========================================================================

    # Count objects in the scene after baking
    total_objects = len(bpy.data.objects)
    metadata["total_objects"] = total_objects

    # Count mesh objects specifically
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    metadata["mesh_objects"] = len(mesh_objects)

    # Calculate total vertex count
    total_vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
    metadata["total_vertices"] = total_vertices

    print(f"Baked scene: {total_objects} objects, {total_vertices:,} vertices")

    # ==========================================================================
    # 6. SAVE BAKED SCENE
    # ==========================================================================

    # Save to world directory (not stage directory) as this is a key milestone
    world_dir = run_dir / "world"
    world_dir.mkdir(parents=True, exist_ok=True)
    output_blend = world_dir / "outora_library_baked.blend"

    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    outputs = [str(output_blend)]

    # ==========================================================================
    # RETURN
    # ==========================================================================

    success = len(errors) == 0

    result = {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }

    if success:
        print(
            f"✓ Bake stage complete: {total_objects} objects, {total_vertices:,} vertices"
        )
    else:
        print(f"✗ Bake stage failed with {len(errors)} error(s)")

    return result
