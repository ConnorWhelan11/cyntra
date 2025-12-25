"""
Materials Stage - Finalize and optimize materials.

Applies palette variations based on parameters.

Implements the standard Fab World stage contract.
"""

from pathlib import Path
from typing import Any, Dict, Mapping, Tuple


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

    # Load navmesh scene
    navmesh_dir = inputs.get("navmesh")
    if not navmesh_dir:
        errors.append("Missing 'navmesh' stage input")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    navmesh_blend = navmesh_dir / "navmesh_setup.blend"
    if not navmesh_blend.exists():
        errors.append(f"Navmesh blend not found: {navmesh_blend}")
        return {"success": False, "outputs": [], "metadata": {}, "errors": errors}

    bpy.ops.wm.open_mainfile(filepath=str(navmesh_blend))

    # Get material palette
    mat_params = params.get("materials", {})
    palette = mat_params.get("palette", "forest_autumn")

    # ==========================================================================
    # DEFINE PALETTES
    # ==========================================================================

    palettes = {
        "forest_autumn": {
            "Ground_Grass": (0.25, 0.35, 0.12, 1.0),
            "Tree_Foliage": (0.6, 0.35, 0.1, 1.0),  # Orange-gold
            "Grass_Blade": (0.4, 0.45, 0.15, 1.0),
            "Flower_Yellow": (0.9, 0.6, 0.15, 1.0),
        },
        "forest_spring": {
            "Ground_Grass": (0.2, 0.45, 0.15, 1.0),
            "Tree_Foliage": (0.15, 0.5, 0.12, 1.0),  # Bright green
            "Grass_Blade": (0.25, 0.55, 0.18, 1.0),
            "Flower_Yellow": (0.95, 0.85, 0.3, 1.0),
        },
        "forest_winter": {
            "Ground_Grass": (0.6, 0.65, 0.7, 1.0),  # Snow-covered
            "Tree_Foliage": (0.12, 0.25, 0.15, 1.0),  # Dark evergreen
            "Grass_Blade": (0.5, 0.55, 0.6, 1.0),  # Frosted
            "Flower_Yellow": (0.7, 0.7, 0.75, 1.0),  # Ice crystals
        },
    }

    active_palette = palettes.get(palette, palettes["forest_autumn"])

    # ==========================================================================
    # APPLY PALETTE
    # ==========================================================================

    materials_updated = 0
    for mat_name, color in active_palette.items():
        mat = bpy.data.materials.get(mat_name)
        if mat and mat.use_nodes:
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = color
                materials_updated += 1

    metadata["palette"] = palette
    metadata["materials_updated"] = materials_updated
    print(f"✓ Applied {palette} palette to {materials_updated} materials")

    # ==========================================================================
    # SAVE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    materials_blend = stage_dir / "materials_setup.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(materials_blend))

    return {
        "success": True,
        "outputs": [str(materials_blend)],
        "metadata": metadata,
        "errors": [],
    }
