"""
Mesh Optimizer - Orchestrates Blender-based mesh optimization.

Runs Blender headlessly to:
- Decimate meshes to game-ready vertex counts
- Generate UV coordinates for texturing
- Export optimized GLB files

Usage:
    from cyntra.fab.mesh_optimizer import optimize_mesh, MeshOptimizeConfig

    config = MeshOptimizeConfig(
        target_vertices=25000,
        generate_uvs=True,
        uv_method="smart_project",
    )
    result = await optimize_mesh(input_glb, output_glb, config)
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


def find_project_root() -> Path:
    """Find the glia-fab project root."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "fab" / "blender").exists() and (parent / "CLAUDE.md").exists():
            return parent
        if (parent / ".beads").exists() and (parent / "fab").exists():
            return parent
    return Path.cwd()


PROJECT_ROOT = find_project_root()
BLENDER_SCRIPT = PROJECT_ROOT / "fab" / "blender" / "scripts" / "optimize_mesh.py"


@dataclass
class MeshOptimizeConfig:
    """Configuration for mesh optimization."""

    # Decimation settings
    target_vertices: int = 25000
    target_faces: int = 12500
    min_ratio: float = 0.05  # Minimum decimation ratio (avoid extreme reduction)
    skip_if_under_budget: bool = True  # Skip if already meets targets

    # UV settings
    generate_uvs: bool = True
    uv_method: str = "smart_project"  # smart_project, cube, lightmap
    uv_angle_limit: float = 66.0  # Degrees for smart UV project
    uv_island_margin: float = 0.02

    # Execution settings
    timeout_seconds: float = 300.0  # 5 minutes
    seed: int = 42

    # Blender settings
    blender_path: Path | None = None  # Auto-detect if None


@dataclass
class OptimizeResult:
    """Result from mesh optimization."""

    success: bool
    input_path: Path
    output_path: Path | None = None

    # Statistics
    initial_vertices: int = 0
    initial_faces: int = 0
    final_vertices: int = 0
    final_faces: int = 0
    has_uvs: bool = False

    # Reduction percentages
    vertex_reduction_pct: float = 0.0
    face_reduction_pct: float = 0.0

    # Error info
    error: str | None = None
    stderr: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "input_path": str(self.input_path),
            "output_path": str(self.output_path) if self.output_path else None,
            "initial": {"vertices": self.initial_vertices, "faces": self.initial_faces},
            "final": {
                "vertices": self.final_vertices,
                "faces": self.final_faces,
                "has_uvs": self.has_uvs,
            },
            "reduction": {
                "vertices_pct": round(self.vertex_reduction_pct, 2),
                "faces_pct": round(self.face_reduction_pct, 2),
            },
            "error": self.error,
        }


def find_blender() -> Path | None:
    """Find Blender executable."""
    # Check common locations
    candidates = [
        # macOS
        Path("/Applications/Blender.app/Contents/MacOS/Blender"),
        Path.home() / "Applications" / "Blender.app" / "Contents" / "MacOS" / "Blender",
        # Linux
        Path("/usr/bin/blender"),
        Path("/usr/local/bin/blender"),
        Path("/snap/bin/blender"),
        # Windows
        Path("C:/Program Files/Blender Foundation/Blender 4.0/blender.exe"),
        Path("C:/Program Files/Blender Foundation/Blender 3.6/blender.exe"),
    ]

    for path in candidates:
        if path.exists():
            return path

    # Try PATH
    blender = shutil.which("blender")
    if blender:
        return Path(blender)

    return None


async def optimize_mesh(
    input_path: Path,
    output_path: Path,
    config: MeshOptimizeConfig | None = None,
) -> OptimizeResult:
    """
    Optimize a mesh using Blender.

    Args:
        input_path: Path to input GLB/GLTF file
        output_path: Path to write optimized GLB
        config: Optimization configuration

    Returns:
        OptimizeResult with statistics and status
    """
    config = config or MeshOptimizeConfig()

    result = OptimizeResult(
        success=False,
        input_path=input_path,
    )

    # Find Blender
    blender = config.blender_path or find_blender()
    if not blender:
        result.error = "Blender not found. Install Blender or set blender_path in config."
        logger.error("Blender not found")
        return result

    # Verify input exists
    if not input_path.exists():
        result.error = f"Input file not found: {input_path}"
        return result

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Verify script exists
    if not BLENDER_SCRIPT.exists():
        result.error = f"Blender script not found: {BLENDER_SCRIPT}"
        return result

    # Stats output file
    stats_path = output_path.with_suffix(".stats.json")

    # Build command
    cmd = [
        str(blender),
        "--background",
        "--factory-startup",
        "--python",
        str(BLENDER_SCRIPT),
        "--",
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--target-vertices",
        str(config.target_vertices),
        "--target-faces",
        str(config.target_faces),
        "--min-ratio",
        str(config.min_ratio),
        "--seed",
        str(config.seed),
        "--stats-output",
        str(stats_path),
    ]

    if config.generate_uvs:
        cmd.extend(
            [
                "--generate-uvs",
                "--uv-method",
                config.uv_method,
                "--uv-angle-limit",
                str(config.uv_angle_limit),
                "--uv-island-margin",
                str(config.uv_island_margin),
            ]
        )

    # Set environment for determinism
    env = {
        "PYTHONHASHSEED": str(config.seed),
        "OMP_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
    }

    logger.info(
        "Running mesh optimization",
        input=str(input_path),
        target_verts=config.target_vertices,
        generate_uvs=config.generate_uvs,
    )

    try:
        # Run Blender
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**dict(subprocess.os.environ), **env},
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=config.timeout_seconds,
        )

        stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        if proc.returncode != 0:
            result.error = f"Blender exited with code {proc.returncode}"
            result.stderr = stderr_str
            logger.error(
                "Blender optimization failed",
                returncode=proc.returncode,
                stderr=stderr_str[:500],
            )
            return result

        # Parse stats from output file
        if stats_path.exists():
            with open(stats_path) as f:
                stats = json.load(f)

            result.initial_vertices = stats.get("initial", {}).get("vertices", 0)
            result.initial_faces = stats.get("initial", {}).get("faces", 0)
            result.final_vertices = stats.get("final", {}).get("vertices", 0)
            result.final_faces = stats.get("final", {}).get("faces", 0)
            result.has_uvs = stats.get("final", {}).get("has_uvs", False)
            result.vertex_reduction_pct = stats.get("reduction", {}).get("vertices_percent", 0.0)
            result.face_reduction_pct = stats.get("reduction", {}).get("faces_percent", 0.0)

            # Clean up stats file
            stats_path.unlink()

        # Verify output exists
        if output_path.exists():
            result.success = True
            result.output_path = output_path

            logger.info(
                "Mesh optimization complete",
                output=str(output_path),
                initial_verts=result.initial_vertices,
                final_verts=result.final_vertices,
                reduction=f"{result.vertex_reduction_pct:.1f}%",
                has_uvs=result.has_uvs,
            )
        else:
            result.error = "Output file not created"

    except TimeoutError:
        result.error = f"Optimization timed out after {config.timeout_seconds}s"
        logger.error("Blender optimization timed out", timeout=config.timeout_seconds)

    except Exception as e:
        result.error = str(e)
        logger.exception("Mesh optimization error")

    return result


# Convenience function for sync usage
def optimize_mesh_sync(
    input_path: Path,
    output_path: Path,
    config: MeshOptimizeConfig | None = None,
) -> OptimizeResult:
    """Synchronous wrapper for optimize_mesh."""
    return asyncio.run(optimize_mesh(input_path, output_path, config))


if __name__ == "__main__":
    # CLI for testing
    import argparse

    parser = argparse.ArgumentParser(description="Optimize mesh for game use")
    parser.add_argument("input", type=Path, help="Input GLB file")
    parser.add_argument("output", type=Path, help="Output GLB file")
    parser.add_argument("--target-vertices", type=int, default=25000)
    parser.add_argument("--generate-uvs", action="store_true")
    parser.add_argument("--uv-method", default="smart_project")

    args = parser.parse_args()

    config = MeshOptimizeConfig(
        target_vertices=args.target_vertices,
        generate_uvs=args.generate_uvs,
        uv_method=args.uv_method,
    )

    result = optimize_mesh_sync(args.input, args.output, config)

    if result.success:
        print(f"Success: {result.output_path}")
        print(f"  {result.initial_vertices} -> {result.final_vertices} vertices")
        print(f"  Reduction: {result.vertex_reduction_pct:.1f}%")
        print(f"  Has UVs: {result.has_uvs}")
    else:
        print(f"Failed: {result.error}")
        sys.exit(1)
