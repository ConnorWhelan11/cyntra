"""
LOD Generate Stage - Generate Level of Detail meshes for world assets.

This stage:
1. Processes exported GLBs from the export stage
2. Generates LOD0/LOD1/LOD2 variants using mesh decimation
3. Creates Godot .tscn scene wrappers with LOD switching

Uses cyntra.fab.lod_generator for mesh processing.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import structlog

from cyntra.fab.lod_generator import (
    LOD_PRESETS,
    LODConfig,
    generate_godot_lod_scene,
    generate_lods,
)

logger = structlog.get_logger()


def execute(
    *,
    run_dir: Path,
    stage_dir: Path,
    inputs: dict[str, Path],
    params: dict[str, Any],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    """Execute the LOD generation stage."""

    errors = []
    outputs = []
    metadata = {
        "lod_meshes_generated": 0,
        "godot_scenes_generated": 0,
        "total_vertex_reduction_pct": 0.0,
    }

    # Get LOD preset from params
    lod_preset = params.get("lod", {}).get("preset", "desktop")
    generate_scenes = params.get("lod", {}).get("generate_scenes", True)

    if lod_preset not in LOD_PRESETS:
        errors.append(
            f"Unknown LOD preset: {lod_preset}. Valid: {list(LOD_PRESETS.keys())}"
        )
        return {"success": False, "outputs": [], "metadata": metadata, "errors": errors}

    config: LODConfig = LOD_PRESETS[lod_preset]

    logger.info(
        "Starting LOD generation",
        preset=lod_preset,
        num_levels=len(config.levels),
        generate_scenes=generate_scenes,
    )

    # Find exported GLBs from the export stage
    export_dir = inputs.get("export")
    if not export_dir:
        errors.append("Missing 'export' stage input")
        return {"success": False, "outputs": [], "metadata": metadata, "errors": errors}

    world_dir = export_dir / "world" if (export_dir / "world").exists() else export_dir

    # Find all GLBs to process
    glb_files: list[Path] = []

    # Main world GLB
    main_glb = world_dir / "outora_library.glb"
    if main_glb.exists():
        glb_files.append(main_glb)

    # Section GLBs
    sections_dir = world_dir / "sections"
    if sections_dir.exists():
        glb_files.extend(sections_dir.glob("*.glb"))

    if not glb_files:
        errors.append(f"No GLB files found in {world_dir}")
        return {"success": False, "outputs": [], "metadata": metadata, "errors": errors}

    logger.info("Found GLBs to process", count=len(glb_files))

    # Create output directory for LODs
    lod_dir = run_dir / "world" / "lods"
    lod_dir.mkdir(parents=True, exist_ok=True)

    # Process each GLB
    all_results = []
    total_reduction = 0.0

    for glb_path in glb_files:
        logger.info("Processing", mesh=glb_path.name)

        try:
            # Run async LOD generation
            result = asyncio.run(
                generate_lods(
                    source_mesh=glb_path,
                    output_dir=lod_dir,
                    config=config,
                )
            )

            all_results.append(result)

            if result.success:
                # Track generated LOD files
                for lod_name, lod_path in result.lod_meshes.items():
                    outputs.append(str(lod_path))
                    metadata["lod_meshes_generated"] += 1

                    # Track vertex reduction
                    stats = result.lod_stats.get(lod_name, {})
                    if stats.get("reduction_pct"):
                        total_reduction += stats["reduction_pct"]

                # Generate Godot scene if requested
                if generate_scenes:
                    scene_path = generate_godot_lod_scene(result)
                    if scene_path:
                        outputs.append(str(scene_path))
                        metadata["godot_scenes_generated"] += 1

                logger.info(
                    "Generated LODs",
                    mesh=glb_path.name,
                    levels=len(result.lod_meshes),
                )
            else:
                for error in result.errors:
                    errors.append(f"{glb_path.name}: {error}")

        except Exception as e:
            errors.append(f"Failed to process {glb_path.name}: {str(e)}")
            logger.error("LOD generation failed", mesh=glb_path.name, error=str(e))

    # Calculate average vertex reduction
    if metadata["lod_meshes_generated"] > 0:
        metadata["total_vertex_reduction_pct"] = round(
            total_reduction / metadata["lod_meshes_generated"], 1
        )

    # Summary
    metadata["glbs_processed"] = len(glb_files)
    metadata["preset_used"] = lod_preset

    success = metadata["lod_meshes_generated"] > 0

    if success:
        logger.info(
            "LOD stage complete",
            meshes_generated=metadata["lod_meshes_generated"],
            scenes_generated=metadata["godot_scenes_generated"],
            avg_reduction=f"{metadata['total_vertex_reduction_pct']}%",
        )
    else:
        logger.error("LOD stage failed", errors=errors)

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }
