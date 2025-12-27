#!/usr/bin/env python3
"""
Procedural Material Batch Generator

Generates PBR materials using Blender procedural nodes.
Falls back from ComfyUI CHORD when models aren't available.

Usage:
    # Generate all materials from starter_pack
    python -m cyntra.fab.procedural_material_batch --world starter_pack

    # Generate specific materials
    python -m cyntra.fab.procedural_material_batch --world starter_pack --materials grass_meadow,brick_red

    # Custom resolution
    python -m cyntra.fab.procedural_material_batch --world starter_pack --resolution 2048
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
import yaml

from cyntra.fab.material_library import (
    Material,
    MaterialLibrary,
    MaterialMetadata,
    PBRMaps,
)

logger = structlog.get_logger()


# Project root detection
def find_project_root() -> Path:
    """Find the glia-fab project root."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "fab" / "worlds").exists() and (parent / "CLAUDE.md").exists():
            return parent
        if (parent / ".beads").exists() and (parent / "fab").exists():
            return parent
    cwd = Path.cwd()
    if (cwd / "fab" / "worlds").exists():
        return cwd
    return cwd


PROJECT_ROOT = find_project_root()


@dataclass
class MaterialDefinition:
    """A material definition from world.yaml."""

    id: str
    prompt: str
    category: str
    tags: list[str]


@dataclass
class BatchConfig:
    """Configuration for batch generation."""

    world_id: str
    output_dir: Path
    library_root: Path
    resolution: int = 2048
    seed: int = 42
    dry_run: bool = False
    materials_filter: list[str] | None = None
    blender_path: Path | None = None
    skip_existing: bool = True


def find_blender() -> Path | None:
    """Find Blender executable."""
    # macOS default location
    mac_path = Path("/Applications/Blender.app/Contents/MacOS/Blender")
    if mac_path.exists():
        return mac_path

    # Try PATH
    result = shutil.which("blender")
    if result:
        return Path(result)

    return None


def load_world_config(world_id: str) -> dict[str, Any]:
    """Load world.yaml configuration."""
    world_path = PROJECT_ROOT / "fab" / "worlds" / world_id / "world.yaml"
    if not world_path.exists():
        raise FileNotFoundError(f"World config not found: {world_path}")

    with open(world_path) as f:
        return yaml.safe_load(f)


def parse_materials(config: dict[str, Any]) -> list[MaterialDefinition]:
    """Parse material definitions from world config."""
    materials = []
    for mat in config.get("materials", []):
        materials.append(
            MaterialDefinition(
                id=mat["id"],
                prompt=mat["prompt"],
                category=mat.get("category", "uncategorized"),
                tags=mat.get("tags", []),
            )
        )
    return materials


def run_blender_generator(
    material: MaterialDefinition,
    output_dir: Path,
    resolution: int,
    seed: int,
    blender_path: Path,
) -> tuple[dict[str, Path] | None, str | None]:
    """
    Run Blender to generate procedural material.

    Returns:
        Tuple of (maps dict, error string)
    """
    script_path = PROJECT_ROOT / "fab" / "blender" / "scripts" / "generate_material.py"
    if not script_path.exists():
        return None, f"Blender script not found: {script_path}"

    mat_output_dir = output_dir / material.id
    result_file = mat_output_dir / "result.json"

    cmd = [
        str(blender_path),
        "--background",
        "--python",
        str(script_path),
        "--",
        "--output",
        str(mat_output_dir),
        "--material-id",
        material.id,
        "--category",
        material.category,
        "--prompt",
        material.prompt,
        "--resolution",
        str(resolution),
        "--seed",
        str(seed + hash(material.id) % 10000),
        "--result-file",
        str(result_file),
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            error = result.stderr or result.stdout or "Unknown error"
            return None, f"Blender failed: {error[:500]}"

        # Read result file
        if not result_file.exists():
            return None, "No result file generated"

        with open(result_file) as f:
            gen_result = json.load(f)

        if not gen_result.get("success"):
            return None, "Generation reported failure"

        # Convert paths
        maps = {}
        for map_type, path_str in gen_result.get("maps", {}).items():
            path = Path(path_str)
            if path.exists():
                maps[map_type] = path

        if not maps:
            return None, "No maps were generated"

        return maps, None

    except subprocess.TimeoutExpired:
        return None, "Blender timed out (120s)"
    except Exception as e:
        return None, str(e)


async def run_batch(config: BatchConfig) -> dict[str, Any]:
    """Run batch material generation."""
    results = {
        "processed": [],
        "failed": [],
        "skipped": [],
        "started_at": datetime.now(UTC).isoformat(),
        "config": {
            "world_id": config.world_id,
            "resolution": config.resolution,
            "seed": config.seed,
            "method": "blender_procedural",
        },
    }

    # Find Blender
    blender_path = config.blender_path or find_blender()
    if not blender_path:
        raise RuntimeError("Blender not found. Install Blender or specify path with --blender")

    print(f"Using Blender: {blender_path}")

    # Load world config
    world_config = load_world_config(config.world_id)
    materials = parse_materials(world_config)

    # Filter materials if specified
    if config.materials_filter:
        filter_set = set(config.materials_filter)
        materials = [m for m in materials if m.id in filter_set]

    if not materials:
        logger.warning("No materials to generate")
        return results

    # Check existing materials
    library = MaterialLibrary(config.library_root)

    if config.skip_existing:
        existing = set(library.list_materials())
        to_generate = [m for m in materials if m.id not in existing]
        skipped = [m for m in materials if m.id in existing]

        for m in skipped:
            results["skipped"].append({"id": m.id, "reason": "already_exists"})

        materials = to_generate

    logger.info(
        "Starting procedural batch generation",
        total_materials=len(materials),
        resolution=config.resolution,
        seed=config.seed,
    )

    print(f"\nGenerating {len(materials)} materials...")

    if config.dry_run:
        for mat in materials:
            print(f"  [{mat.category}] {mat.id}")
            results["skipped"].append({"id": mat.id, "reason": "dry_run"})
        return results

    # Create output directory
    config.output_dir.mkdir(parents=True, exist_ok=True)

    # Generate each material
    for i, material in enumerate(materials, 1):
        print(f"\n[{i}/{len(materials)}] {material.id} ({material.category})...")

        start_time = time.time()
        maps, error = run_blender_generator(
            material=material,
            output_dir=config.output_dir,
            resolution=config.resolution,
            seed=config.seed,
            blender_path=blender_path,
        )
        elapsed = time.time() - start_time

        if error:
            print(f"    FAILED: {error}")
            results["failed"].append(
                {
                    "id": material.id,
                    "error": error,
                    "elapsed_s": round(elapsed, 1),
                }
            )
            continue

        # Convert to PBRMaps
        pbr_maps = PBRMaps(
            basecolor=maps.get("basecolor"),
            normal=maps.get("normal"),
            roughness=maps.get("roughness"),
            metalness=maps.get("metalness"),
            height=maps.get("height"),
            ao=maps.get("ao"),
        )

        # Add to library
        try:
            lib_material = Material(
                id=material.id,
                metadata=MaterialMetadata(
                    name=material.id.replace("_", " ").title(),
                    description=f"Procedural: {material.prompt[:100]}",
                    category=material.category,
                    tags=material.tags,
                    prompt=material.prompt,
                    seed=config.seed + hash(material.id) % 10000,
                    workflow="blender_procedural",
                    resolution=(config.resolution, config.resolution),
                    source="blender",
                ),
                maps=pbr_maps,
            )

            mat_path = library.add_material(
                lib_material,
                category=material.category,
                generate_godot=True,
            )

            results["processed"].append(
                {
                    "id": material.id,
                    "category": material.category,
                    "path": str(mat_path),
                    "elapsed_s": round(elapsed, 1),
                    "maps": list(maps.keys()),
                }
            )

            print(f"    OK ({elapsed:.1f}s) -> {mat_path.name}")

        except Exception as e:
            logger.error("Failed to add to library", material_id=material.id, error=str(e))
            results["failed"].append(
                {
                    "id": material.id,
                    "error": f"Library error: {e}",
                }
            )

    results["finished_at"] = datetime.now(UTC).isoformat()
    results["summary"] = {
        "total": len(materials) + len(results["skipped"]),
        "processed": len(results["processed"]),
        "failed": len(results["failed"]),
        "skipped": len(results["skipped"]),
    }

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Generate procedural PBR materials using Blender",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument(
        "--world",
        "-w",
        required=True,
        help="World ID (directory name in fab/worlds/)",
    )

    parser.add_argument(
        "--materials",
        "-m",
        help="Comma-separated list of material IDs to generate",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output directory for Blender outputs (default: .cyntra/runs/materials_proc_<timestamp>)",
    )

    parser.add_argument(
        "--library",
        "-l",
        type=Path,
        default=PROJECT_ROOT / "fab" / "materials",
        help="Material library root (default: fab/materials)",
    )

    parser.add_argument(
        "--resolution",
        "-r",
        type=int,
        default=2048,
        help="Texture resolution (default: 2048)",
    )

    parser.add_argument(
        "--seed",
        "-s",
        type=int,
        default=42,
        help="Random seed (default: 42)",
    )

    parser.add_argument(
        "--blender",
        type=Path,
        help="Path to Blender executable",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without running",
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate even if material exists in library",
    )

    args = parser.parse_args()

    # Determine output directory
    if args.output:
        output_dir = args.output
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = PROJECT_ROOT / ".cyntra" / "runs" / f"materials_proc_{timestamp}"

    output_dir.mkdir(parents=True, exist_ok=True)

    # Parse materials filter
    materials_filter = None
    if args.materials:
        materials_filter = [m.strip() for m in args.materials.split(",")]

    # Build config
    config = BatchConfig(
        world_id=args.world,
        output_dir=output_dir,
        library_root=args.library,
        resolution=args.resolution,
        seed=args.seed,
        dry_run=args.dry_run,
        materials_filter=materials_filter,
        blender_path=args.blender,
        skip_existing=not args.force,
    )

    # Print header
    print("\nProcedural Material Batch Generator")
    print("====================================")
    print(f"World: {config.world_id}")
    print(f"Resolution: {config.resolution}x{config.resolution}")
    print(f"Output: {output_dir}")
    print(f"Library: {config.library_root}")
    if config.skip_existing:
        print("Mode: Skip existing materials")
    else:
        print("Mode: Force regenerate all")
    print()

    try:
        results = asyncio.run(run_batch(config))
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.exception("Batch generation failed")
        print(f"\nError: {e}")
        sys.exit(1)

    # Print summary
    summary = results.get("summary", {})
    print(f"\n{'=' * 50}")
    print("BATCH COMPLETE")
    print(f"{'=' * 50}")
    print(f"Total:     {summary.get('total', 0)}")
    print(f"Processed: {summary.get('processed', 0)}")
    print(f"Failed:    {summary.get('failed', 0)}")
    print(f"Skipped:   {summary.get('skipped', 0)}")

    if results.get("failed"):
        print("\nFailed materials:")
        for fail in results["failed"]:
            print(f"  - {fail['id']}: {fail['error'][:60]}")

    # Save results
    results_path = output_dir / "batch_results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to: {results_path}")

    # Return exit code based on failures
    if results.get("failed"):
        sys.exit(1)


if __name__ == "__main__":
    main()
