"""
Material Post-Processing - Organize ComfyUI outputs into a structured library.

This module processes raw ComfyUI stage outputs and:
1. Organizes them into the material library structure
2. Generates Godot .tres material resources
3. Creates manifest files for tracking

Usage:
    from cyntra.fab.material_postprocess import process_comfyui_run

    process_comfyui_run(
        run_dir=Path(".cyntra/runs/my_run"),
        library_root=Path("fab/materials"),
    )
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog

from cyntra.fab.material_library import (
    Material,
    MaterialLibrary,
    MaterialMetadata,
    PBRMaps,
)

logger = structlog.get_logger()


def process_comfyui_run(
    run_dir: Path,
    library_root: Path,
    generate_godot: bool = True,
) -> dict[str, Any]:
    """
    Process a Fab World run with ComfyUI stages and organize into material library.

    Args:
        run_dir: Path to the run directory containing stage outputs
        library_root: Path to material library root
        generate_godot: Whether to generate Godot .tres files

    Returns:
        Processing result with added materials and any errors
    """
    results = {
        "processed": [],
        "errors": [],
        "library_path": str(library_root),
    }

    # Load run manifest for metadata
    manifest_path = run_dir / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception as e:
            results["errors"].append(f"Failed to load manifest: {e}")

    # Get seed for reproducibility tracking
    determinism = manifest.get("determinism", {})
    seed = int(determinism.get("seed", 42))

    # Initialize material library
    library = MaterialLibrary(library_root)

    # Find all ComfyUI stage outputs
    stages_dir = run_dir / "stages"
    if not stages_dir.exists():
        # Try flat structure
        stages_dir = run_dir

    # Look for stage directories with PBR outputs
    for stage_dir in sorted(stages_dir.iterdir()):
        if not stage_dir.is_dir():
            continue

        # Check if this looks like a material stage
        if not _is_material_stage(stage_dir):
            continue

        stage_id = stage_dir.name
        logger.info("Processing material stage", stage_id=stage_id)

        try:
            # Detect PBR maps
            maps = PBRMaps.from_directory(stage_dir)

            # Skip if no maps found
            if not maps.basecolor and not maps.normal:
                logger.debug("No PBR maps found", stage_dir=str(stage_dir))
                continue

            # Get prompt from stage metadata or manifest
            prompt = _get_stage_prompt(stage_dir, manifest, stage_id)

            # Determine category from stage name
            category = _infer_category(stage_id)

            # Create material
            material = Material(
                id=stage_id,
                metadata=MaterialMetadata(
                    name=stage_id.replace("_", " ").title(),
                    description=f"Generated from: {prompt[:100]}" if prompt else "",
                    category=category,
                    tags=_infer_tags(stage_id, prompt),
                    prompt=prompt or "",
                    seed=seed,
                    workflow="chord_pbr",
                    source="comfyui",
                ),
                maps=maps,
            )

            # Add to library
            mat_path = library.add_material(
                material,
                category=category,
                generate_godot=generate_godot,
            )

            results["processed"].append(
                {
                    "id": stage_id,
                    "path": str(mat_path),
                    "maps": {
                        "basecolor": str(maps.basecolor) if maps.basecolor else None,
                        "normal": str(maps.normal) if maps.normal else None,
                        "roughness": str(maps.roughness) if maps.roughness else None,
                        "metalness": str(maps.metalness) if maps.metalness else None,
                        "height": str(maps.height) if maps.height else None,
                    },
                }
            )

        except Exception as e:
            error_msg = f"Failed to process stage {stage_id}: {e}"
            logger.error(error_msg)
            results["errors"].append(error_msg)

    logger.info(
        "Material processing complete",
        processed=len(results["processed"]),
        errors=len(results["errors"]),
    )

    return results


def _is_material_stage(stage_dir: Path) -> bool:
    """Check if a directory contains material stage outputs."""
    # Look for common PBR map patterns
    patterns = ["basecolor", "albedo", "diffuse", "normal", "roughness"]
    return any(list(stage_dir.glob(f"*{pattern}*")) for pattern in patterns)


def _get_stage_prompt(
    stage_dir: Path,
    manifest: dict[str, Any],
    stage_id: str,
) -> str | None:
    """Extract the generation prompt for a stage."""
    # Try stage-specific metadata
    metadata_path = stage_dir / "metadata.json"
    if metadata_path.exists():
        try:
            meta = json.loads(metadata_path.read_text())
            if "prompt" in meta:
                return meta["prompt"]
        except Exception:
            pass

    # Try manifest stages
    stages = manifest.get("stages", [])
    for stage in stages:
        if stage.get("id") == stage_id:
            params = stage.get("comfyui_params", {})
            if "prompt" in params:
                return params["prompt"]

    return None


def _infer_category(stage_id: str) -> str:
    """Infer material category from stage ID."""
    stage_lower = stage_id.lower()

    if any(kw in stage_lower for kw in ["grass", "moss", "stone", "cobble", "dirt", "sand"]):
        return "terrain"
    if any(kw in stage_lower for kw in ["brick", "concrete", "plaster", "wall", "floor"]):
        return "architecture"
    if any(kw in stage_lower for kw in ["wood", "oak", "pine", "plank"]):
        return "architecture"
    if any(kw in stage_lower for kw in ["metal", "iron", "steel", "rust", "copper"]):
        return "metal"
    if any(kw in stage_lower for kw in ["fabric", "cloth", "leather", "canvas"]):
        return "fabric"

    return "uncategorized"


def _infer_tags(stage_id: str, prompt: str | None) -> list[str]:
    """Infer tags from stage ID and prompt."""
    tags = []
    text = f"{stage_id} {prompt or ''}".lower()

    # Material type tags
    if "grass" in text:
        tags.append("grass")
    if "stone" in text or "cobble" in text:
        tags.append("stone")
    if "brick" in text:
        tags.append("brick")
    if "wood" in text or "oak" in text or "plank" in text:
        tags.append("wood")
    if "metal" in text or "iron" in text or "steel" in text:
        tags.append("metal")
    if "rust" in text:
        tags.append("rusty")

    # Style tags
    if "medieval" in text or "fantasy" in text:
        tags.append("fantasy")
    if "industrial" in text:
        tags.append("industrial")
    if "weathered" in text or "aged" in text or "old" in text:
        tags.append("weathered")
    if "seamless" in text or "tileable" in text:
        tags.append("seamless")

    return tags


def export_library_for_godot(
    library_root: Path,
    godot_project_path: Path,
) -> list[Path]:
    """
    Export all materials from library to a Godot project.

    Args:
        library_root: Path to material library
        godot_project_path: Path to Godot project (containing project.godot)

    Returns:
        List of exported .tres file paths
    """
    library = MaterialLibrary(library_root)

    # Standard Godot material directories
    materials_dir = godot_project_path / "materials"
    godot_project_path / "textures"

    return library.export_for_godot(materials_dir.parent)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Process ComfyUI run into material library")
    parser.add_argument("--run-dir", required=True, help="Path to run directory")
    parser.add_argument("--library", required=True, help="Path to material library")
    parser.add_argument("--no-godot", action="store_true", help="Skip Godot .tres generation")

    args = parser.parse_args()

    result = process_comfyui_run(
        run_dir=Path(args.run_dir),
        library_root=Path(args.library),
        generate_godot=not args.no_godot,
    )

    print(json.dumps(result, indent=2))
