"""
Generate Stage - Create Gothic architectural kit pieces.

This stage generates procedural Gothic architectural elements:
- Clustered piers with bases and capitals
- Ribbed vault segments
- Lancet windows with tracery
- Buttresses with proper profiles
- Arcade arches with moldings

Based on gothic_kit_generator.py from the original pipeline.
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
    """Execute the generate stage."""

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
    # 1. LOAD PREPARED SCENE
    # ==========================================================================

    prepare_dir = inputs.get("prepare")
    if not prepare_dir:
        errors.append("Missing 'prepare' stage input")
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": errors,
        }

    prepared_blend = prepare_dir / "prepared.blend"
    if not prepared_blend.exists():
        errors.append(f"Prepared blend file not found: {prepared_blend}")
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": errors,
        }

    # Open the prepared scene
    bpy.ops.wm.open_mainfile(filepath=str(prepared_blend))

    # ==========================================================================
    # 2. INJECT DETERMINISM
    # ==========================================================================

    seed = manifest.get("determinism", {}).get("seed", 42)
    import random

    random.seed(seed)

    if hasattr(bpy.context.scene, "cycles"):
        bpy.context.scene.cycles.seed = seed

    # ==========================================================================
    # 3. IMPORT AND RUN GOTHIC KIT GENERATOR
    # ==========================================================================

    # Add the original blender scripts directory to path for imports
    repo_root = Path(__file__).resolve().parents[5]  # Up to repo root
    original_blender_dir = repo_root / "fab" / "assets" / "blender"

    if str(original_blender_dir) not in sys.path:
        sys.path.insert(0, str(original_blender_dir))

    try:
        # Import the gothic kit generator module
        import gothic_kit_generator as kit
        import importlib

        importlib.reload(kit)  # Ensure fresh import

        # Generate all kit pieces
        print("Generating Gothic architectural kit pieces...")
        kit.generate_all_pieces()

        metadata["kit_generator"] = "gothic_kit_generator.py"
        metadata["pieces_generated"] = True

    except Exception as e:
        errors.append(f"Failed to generate kit pieces: {e}")
        import traceback

        errors.append(traceback.format_exc())

    # ==========================================================================
    # 4. COUNT GENERATED OBJECTS
    # ==========================================================================

    # Count objects in the OL_Assets collection (where kit pieces are stored)
    kit_collection = bpy.data.collections.get("OL_Assets")
    if kit_collection:
        piece_count = len(kit_collection.objects)
        metadata["kit_piece_count"] = piece_count
        print(f"Generated {piece_count} kit pieces")
    else:
        metadata["kit_piece_count"] = 0
        print("⚠ OL_Assets collection not found")

    # ==========================================================================
    # 5. SAVE GENERATED SCENE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    output_blend = stage_dir / "kit_pieces.blend"

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
        print(f"✓ Generate stage complete: {metadata.get('kit_piece_count', 0)} pieces")
    else:
        print(f"✗ Generate stage failed with {len(errors)} error(s)")

    return result
