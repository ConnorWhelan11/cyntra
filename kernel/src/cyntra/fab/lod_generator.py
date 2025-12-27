"""
LOD Generator - Create multiple Level of Detail meshes.

Generates LOD0 (high), LOD1 (medium), LOD2 (low) versions of meshes
for efficient game rendering at different distances.

Uses Blender's decimate modifier to reduce polygon count while
preserving visual quality and UV coordinates.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import structlog

from cyntra.fab.mesh_optimizer import MeshOptimizeConfig, optimize_mesh

logger = structlog.get_logger()


@dataclass
class LODLevel:
    """Configuration for a single LOD level."""

    name: str  # e.g., "lod0", "lod1", "lod2"
    target_vertices: int
    target_faces: int
    screen_percentage: float = 1.0  # Godot LOD screen percentage threshold


@dataclass
class LODConfig:
    """Configuration for LOD generation."""

    # LOD levels (from highest to lowest detail)
    levels: list[LODLevel] = field(
        default_factory=lambda: [
            LODLevel(name="lod0", target_vertices=25000, target_faces=12500, screen_percentage=1.0),
            LODLevel(name="lod1", target_vertices=5000, target_faces=2500, screen_percentage=0.25),
            LODLevel(name="lod2", target_vertices=1000, target_faces=500, screen_percentage=0.1),
        ]
    )

    # Optimization settings
    preserve_uvs: bool = True
    uv_method: str = "smart_project"
    min_ratio: float = 0.001  # Allow aggressive decimation for LODs (0.1%)

    # Output settings
    suffix_pattern: str = "_{name}"  # e.g., mesh_lod0.glb, mesh_lod1.glb

    # Skip LOD if source already under threshold
    skip_if_under_budget: bool = True


@dataclass
class LODResult:
    """Result from LOD generation."""

    success: bool
    mesh_id: str
    source_path: Path

    # Generated LOD meshes
    lod_meshes: dict[str, Path] = field(default_factory=dict)  # name -> path

    # Statistics per LOD
    lod_stats: dict[str, dict[str, Any]] = field(default_factory=dict)

    # Errors
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "mesh_id": self.mesh_id,
            "source_path": str(self.source_path),
            "lod_meshes": {name: str(path) for name, path in self.lod_meshes.items()},
            "lod_stats": self.lod_stats,
            "errors": self.errors,
        }


async def generate_lods(
    source_mesh: Path,
    output_dir: Path | None = None,
    config: LODConfig | None = None,
) -> LODResult:
    """
    Generate multiple LOD levels for a mesh.

    Args:
        source_mesh: Path to the high-poly source mesh
        output_dir: Output directory (defaults to source directory)
        config: LOD configuration

    Returns:
        LODResult with paths to generated LOD meshes
    """
    config = config or LODConfig()
    mesh_id = source_mesh.stem
    output_dir = output_dir or source_mesh.parent

    result = LODResult(
        success=False,
        mesh_id=mesh_id,
        source_path=source_mesh,
    )

    if not source_mesh.exists():
        result.errors.append(f"Source mesh not found: {source_mesh}")
        return result

    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "Generating LODs",
        mesh_id=mesh_id,
        source=str(source_mesh),
        num_levels=len(config.levels),
    )

    for level in config.levels:
        lod_name = level.name
        suffix = config.suffix_pattern.format(name=lod_name)
        output_path = output_dir / f"{mesh_id}{suffix}.glb"

        logger.debug(
            f"Generating {lod_name}",
            target_verts=level.target_vertices,
            target_faces=level.target_faces,
        )

        # Create optimization config for this LOD level
        opt_config = MeshOptimizeConfig(
            target_vertices=level.target_vertices,
            target_faces=level.target_faces,
            min_ratio=config.min_ratio,
            generate_uvs=config.preserve_uvs,
            uv_method=config.uv_method,
            skip_if_under_budget=config.skip_if_under_budget,
        )

        try:
            opt_result = await optimize_mesh(
                source_mesh,
                output_path,
                opt_config,
            )

            if opt_result.success and opt_result.output_path:
                result.lod_meshes[lod_name] = opt_result.output_path
                result.lod_stats[lod_name] = {
                    "initial_vertices": opt_result.initial_vertices,
                    "final_vertices": opt_result.final_vertices,
                    "reduction_pct": opt_result.vertex_reduction_pct,
                    "has_uvs": opt_result.has_uvs,
                    "screen_percentage": level.screen_percentage,
                }

                logger.info(
                    f"Generated {lod_name}",
                    vertices=opt_result.final_vertices,
                    reduction=f"{opt_result.vertex_reduction_pct:.1f}%",
                )
            else:
                result.errors.append(f"{lod_name}: {opt_result.error}")

        except Exception as e:
            result.errors.append(f"{lod_name}: {str(e)}")
            logger.error(f"LOD generation failed for {lod_name}", error=str(e))

    # Consider success if at least one LOD was generated
    result.success = len(result.lod_meshes) > 0

    if result.success:
        logger.info(
            "LOD generation complete",
            mesh_id=mesh_id,
            levels_generated=len(result.lod_meshes),
        )

    return result


def generate_godot_lod_scene(
    result: LODResult,
    output_path: Path | None = None,
) -> Path | None:
    """
    Generate a Godot scene file with LOD configuration.

    Creates a .tscn file that includes LOD switching based on screen percentage.

    Args:
        result: LODResult from LOD generation
        output_path: Output .tscn path (defaults to source mesh directory)

    Returns:
        Path to generated .tscn file
    """
    if not result.success or not result.lod_meshes:
        return None

    output_path = output_path or result.source_path.parent / f"{result.mesh_id}_lod.tscn"

    # Build Godot scene with LOD nodes
    # Using Godot 4.x LOD system (VisibleOnScreenNotifier3D or manual LOD)
    lines = [
        f"[gd_scene load_steps={len(result.lod_meshes) + 1} format=3]",
        "",
    ]

    # Add external resources for each LOD
    for i, (_lod_name, lod_path) in enumerate(sorted(result.lod_meshes.items()), 1):
        rel_path = lod_path.name
        lines.append(f'[ext_resource type="PackedScene" path="{rel_path}" id="{i}"]')

    lines.append("")

    # Root node
    lines.append(f'[node name="{result.mesh_id}" type="Node3D"]')
    lines.append("")

    # Add LOD child nodes with visibility ranges
    # In Godot 4, we use visibility_range_begin and visibility_range_end
    for i, (lod_name, _lod_path) in enumerate(sorted(result.lod_meshes.items()), 1):
        stats = result.lod_stats.get(lod_name, {})
        stats.get("screen_percentage", 1.0)

        # Convert screen percentage to distance (approximate)
        # Higher screen % = closer = lower begin distance
        # LOD0: 0-10m, LOD1: 10-25m, LOD2: 25m+
        if lod_name == "lod0":
            range_begin = 0.0
            range_end = 10.0
        elif lod_name == "lod1":
            range_begin = 10.0
            range_end = 25.0
        else:
            range_begin = 25.0
            range_end = 100.0

        lines.append(f'[node name="{lod_name}" parent="." instance=ExtResource("{i}")]')
        lines.append(f"visibility_range_begin = {range_begin}")
        lines.append(f"visibility_range_end = {range_end}")
        lines.append("")

    content = "\n".join(lines)
    output_path.write_text(content)

    logger.debug("Generated Godot LOD scene", path=str(output_path))

    return output_path


# Preset configurations for different use cases
LOD_PRESETS = {
    "desktop": LODConfig(
        levels=[
            LODLevel("lod0", target_vertices=50000, target_faces=25000, screen_percentage=1.0),
            LODLevel("lod1", target_vertices=10000, target_faces=5000, screen_percentage=0.25),
            LODLevel("lod2", target_vertices=2000, target_faces=1000, screen_percentage=0.1),
        ]
    ),
    "mobile": LODConfig(
        levels=[
            LODLevel("lod0", target_vertices=10000, target_faces=5000, screen_percentage=1.0),
            LODLevel("lod1", target_vertices=2000, target_faces=1000, screen_percentage=0.3),
            LODLevel("lod2", target_vertices=500, target_faces=250, screen_percentage=0.1),
        ]
    ),
    "vr": LODConfig(
        levels=[
            LODLevel("lod0", target_vertices=25000, target_faces=12500, screen_percentage=1.0),
            LODLevel("lod1", target_vertices=5000, target_faces=2500, screen_percentage=0.2),
        ]
    ),
}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate LOD meshes")
    parser.add_argument("mesh", type=Path, help="Source mesh GLB file")
    parser.add_argument("--output", "-o", type=Path, help="Output directory")
    parser.add_argument(
        "--preset",
        choices=list(LOD_PRESETS.keys()),
        default="desktop",
        help="LOD preset configuration",
    )
    parser.add_argument("--godot", action="store_true", help="Generate Godot .tscn file")

    args = parser.parse_args()

    config = LOD_PRESETS[args.preset]

    result = asyncio.run(
        generate_lods(
            source_mesh=args.mesh,
            output_dir=args.output,
            config=config,
        )
    )

    if result.success:
        print(f"LODs generated for {result.mesh_id}:")
        for lod_name, path in sorted(result.lod_meshes.items()):
            stats = result.lod_stats.get(lod_name, {})
            print(f"  {lod_name}: {path.name} ({stats.get('final_vertices', 0):,} verts)")

        if args.godot:
            scene_path = generate_godot_lod_scene(result)
            if scene_path:
                print(f"  Godot scene: {scene_path}")
    else:
        print("Failed:")
        for error in result.errors:
            print(f"  - {error}")
