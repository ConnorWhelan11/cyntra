#!/usr/bin/env python3
"""
Material Batch Generator - Generate PBR materials from world.yaml definitions.

Iterates through material definitions in a world.yaml file, generates PBR maps
using ComfyUI CHORD workflow, and organizes outputs into the material library.

Usage:
    # Generate all materials from starter_pack
    python -m cyntra.fab.material_batch --world starter_pack

    # Generate specific materials
    python -m cyntra.fab.material_batch --world starter_pack --materials grass_meadow,brick_red

    # Dry run (show what would be generated)
    python -m cyntra.fab.material_batch --world starter_pack --dry-run

    # Use turbo mode (faster, 2048x2048)
    python -m cyntra.fab.material_batch --world starter_pack --turbo

    # Custom output directory
    python -m cyntra.fab.material_batch --world starter_pack --output ./my_materials
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
import yaml

from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig
from cyntra.fab.critics.material import MaterialCritic, MaterialCriticResult
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
        # Check for multiple distinctive markers
        if (parent / "fab" / "worlds").exists() and (parent / "CLAUDE.md").exists():
            return parent
        if (parent / ".beads").exists() and (parent / "fab").exists():
            return parent
    # Fallback: check cwd
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
    negative_prompt: str = "blurry, watermark, text, low quality, artifacts"


@dataclass
class BatchConfig:
    """Configuration for batch generation."""

    world_id: str
    workflow_path: Path
    output_dir: Path
    library_root: Path
    host: str = "localhost"
    port: int = 8188
    timeout_seconds: float = 120.0
    seed: int = 42
    steps: int = 9  # Turbo default
    cfg: float = 3.5  # Turbo default
    turbo: bool = True
    dry_run: bool = False
    materials_filter: list[str] | None = None
    parallel: int = 1  # Number of parallel generations
    # Validation options
    validate: bool = True
    max_retries: int = 3
    min_score: float = 0.6  # Minimum overall score to pass
    use_clip: bool = True
    use_aesthetic: bool = True


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
                negative_prompt=mat.get("negative_prompt", "blurry, watermark, text, low quality"),
            )
        )
    return materials


def convert_web_to_api_format(web_workflow: dict[str, Any]) -> dict[str, Any]:
    """
    Convert ComfyUI web format to API format.

    Web format: {"nodes": [...], "links": [...], ...}
    API format: {"node_id": {"class_type": ..., "inputs": {...}}, ...}
    """
    if "nodes" not in web_workflow:
        # Already in API format or invalid
        return web_workflow

    nodes = web_workflow.get("nodes", [])
    links = web_workflow.get("links", [])

    # Build link map: link_id -> (source_node_id, source_slot, ...)
    link_map = {}
    for link in links:
        # link format: [link_id, source_node, source_slot, dest_node, dest_slot, type]
        if len(link) >= 6:
            link_id, src_node, src_slot, _, _, _ = link[:6]
            link_map[link_id] = (src_node, src_slot)

    api_workflow = {}

    for node in nodes:
        node_id = str(node.get("id"))
        node_type = node.get("type")

        if not node_type:
            continue

        # Build inputs dict
        inputs = {}
        node_inputs = node.get("inputs", [])
        widgets_values = node.get("widgets_values", [])

        # Map input connections
        for inp in node_inputs:
            inp_name = inp.get("name")
            link_id = inp.get("link")
            if inp_name and link_id and link_id in link_map:
                src_node, src_slot = link_map[link_id]
                inputs[inp_name] = [str(src_node), src_slot]

        # Map widget values based on node type
        if node_type == "CLIPTextEncode" and widgets_values:
            inputs["text"] = widgets_values[0] if widgets_values else ""
        elif node_type == "KSampler" and len(widgets_values) >= 7:
            # KSampler widgets: seed, control_after_generate, steps, cfg, sampler_name, scheduler, denoise
            inputs["seed"] = widgets_values[0]
            inputs["control_after_generate"] = widgets_values[1]
            inputs["steps"] = widgets_values[2]
            inputs["cfg"] = widgets_values[3]
            inputs["sampler_name"] = widgets_values[4]
            inputs["scheduler"] = widgets_values[5]
            inputs["denoise"] = widgets_values[6]
        elif node_type == "EmptySD3LatentImage" and len(widgets_values) >= 3:
            inputs["width"] = widgets_values[0]
            inputs["height"] = widgets_values[1]
            inputs["batch_size"] = widgets_values[2]
        elif node_type == "CLIPLoader" and widgets_values:
            inputs["clip_name"] = widgets_values[0] if widgets_values else ""
            if len(widgets_values) > 1:
                inputs["type"] = widgets_values[1]
        elif node_type == "UNETLoader" and widgets_values:
            inputs["unet_name"] = widgets_values[0] if widgets_values else ""
        elif node_type == "VAELoader" and widgets_values:
            inputs["vae_name"] = widgets_values[0] if widgets_values else ""
        elif node_type == "SaveImage" and widgets_values:
            inputs["filename_prefix"] = widgets_values[0] if widgets_values else "output"
        elif node_type == "ChordLoadModel" and widgets_values:
            inputs["model_name"] = widgets_values[0] if widgets_values else ""
        elif node_type == "ModelSamplingAuraFlow" and widgets_values:
            inputs["shift"] = widgets_values[0] if widgets_values else 1.73
        elif node_type == "ResizeAndPadImage" and len(widgets_values) >= 4:
            inputs["width"] = widgets_values[0]
            inputs["height"] = widgets_values[1]
            inputs["pad_color"] = widgets_values[2]
            inputs["interpolation"] = widgets_values[3]

        api_workflow[node_id] = {
            "class_type": node_type,
            "inputs": inputs,
        }

        # Preserve _meta if present
        if "_meta" in node:
            api_workflow[node_id]["_meta"] = node["_meta"]

    return api_workflow


def load_workflow(turbo: bool = True) -> dict[str, Any]:
    """Load the appropriate CHORD workflow and convert to API format."""
    if turbo:
        workflow_path = (
            PROJECT_ROOT / "fab" / "workflows" / "comfyui" / "chord_turbo_image_to_material.json"
        )
    else:
        workflow_path = (
            PROJECT_ROOT / "fab" / "workflows" / "comfyui" / "chord_image_to_material.json"
        )

    if not workflow_path.exists():
        raise FileNotFoundError(f"Workflow not found: {workflow_path}")

    with open(workflow_path) as f:
        raw_workflow = json.load(f)

    # Convert to API format if needed
    return convert_web_to_api_format(raw_workflow)


def inject_prompt(
    workflow: dict[str, Any], prompt: str, negative_prompt: str = ""
) -> dict[str, Any]:
    """Inject prompt into workflow nodes."""
    import copy

    modified = copy.deepcopy(workflow)

    for node_id, node in modified.items():
        if not isinstance(node, dict):
            continue

        class_type = node.get("class_type", "")
        inputs = node.get("inputs", {})

        # Get node title from _meta
        meta = node.get("_meta", {})
        title = meta.get("title", "").lower() if isinstance(meta, dict) else ""

        # CLIPTextEncode nodes
        if class_type == "CLIPTextEncode":
            if "positive" in title or "positive" in str(node_id).lower():
                inputs["text"] = prompt
            elif ("negative" in title or "negative" in str(node_id).lower()) and negative_prompt:
                inputs["text"] = negative_prompt

        # Also check for text input nodes commonly used
        if class_type in ("TextMultiline", "String", "Text") and (
            "prompt" in title or "positive" in title
        ):
            if "text" in inputs:
                inputs["text"] = prompt
            elif "string" in inputs:
                inputs["string"] = prompt

    return modified


async def generate_material(
    client: ComfyUIClient,
    material: MaterialDefinition,
    workflow: dict[str, Any],
    output_dir: Path,
    seed: int,
) -> tuple[MaterialDefinition, PBRMaps | None, str | None]:
    """
    Generate a single material using ComfyUI.

    Returns:
        Tuple of (material, maps, error)
    """
    mat_output_dir = output_dir / material.id
    mat_output_dir.mkdir(parents=True, exist_ok=True)

    # Inject prompt and seed
    modified_workflow = inject_prompt(workflow, material.prompt, material.negative_prompt)
    modified_workflow = ComfyUIClient.inject_seed(modified_workflow, seed)

    logger.info(
        "Generating material",
        material_id=material.id,
        category=material.category,
        seed=seed,
    )

    start_time = time.time()

    try:
        # Queue the prompt
        prompt_id = await client.queue_prompt(modified_workflow)

        # Wait for completion
        result = await client.wait_for_completion(prompt_id)

        elapsed = time.time() - start_time

        if result.status != "completed":
            error_msg = result.error or f"Generation failed with status: {result.status}"
            logger.error(
                "Material generation failed",
                material_id=material.id,
                error=error_msg,
                elapsed_s=round(elapsed, 1),
            )
            return (material, None, error_msg)

        # Download outputs
        downloaded = await client.download_outputs(result, mat_output_dir)

        logger.info(
            "Material generated",
            material_id=material.id,
            elapsed_s=round(elapsed, 1),
            files=sum(len(files) for files in downloaded.values()),
        )

        # Rename outputs to standard PBR names
        maps = await _organize_outputs(mat_output_dir, downloaded)

        return (material, maps, None)

    except Exception as e:
        elapsed = time.time() - start_time
        error_msg = str(e)
        logger.error(
            "Material generation error",
            material_id=material.id,
            error=error_msg,
            elapsed_s=round(elapsed, 1),
        )
        return (material, None, error_msg)


async def _organize_outputs(output_dir: Path, downloaded: dict[str, list[Path]]) -> PBRMaps:
    """
    Organize downloaded ComfyUI outputs into standard PBR map names.

    CHORD outputs are named by node, need to rename to standard names.
    """
    maps = PBRMaps()

    # Flatten all downloaded files
    all_files = []
    for files in downloaded.values():
        all_files.extend(files)

    # Map patterns to PBR types
    patterns = {
        "basecolor": ["basecolor", "albedo", "diffuse", "color", "base"],
        "normal": ["normal", "norm", "nrm"],
        "roughness": ["roughness", "rough"],
        "metalness": ["metalness", "metallic", "metal"],
        "height": ["height", "displacement", "disp", "bump"],
        "ao": ["ao", "ambient", "occlusion"],
        "emission": ["emission", "emissive", "emit"],
    }

    for file in all_files:
        name_lower = file.stem.lower()

        for map_type, keywords in patterns.items():
            if any(kw in name_lower for kw in keywords):
                # Rename to standard name
                new_name = f"{map_type}{file.suffix}"
                new_path = output_dir / new_name

                if file != new_path:
                    file.rename(new_path)

                setattr(maps, map_type, new_path)
                break

    return maps


async def validate_material(
    critic: MaterialCritic,
    material: MaterialDefinition,
    material_path: Path,
    min_score: float,
) -> tuple[MaterialCriticResult, bool]:
    """
    Validate a generated material.

    Returns:
        Tuple of (result, passed)
    """
    result = critic.evaluate(
        material_dir=material_path,
        prompt=material.prompt,
        material_id=material.id,
    )

    # Check if passes overall threshold
    passed = result.passed and result.score >= min_score

    return result, passed


async def run_batch(config: BatchConfig) -> dict[str, Any]:
    """
    Run batch material generation with validation and auto-retry.

    Returns:
        Results dict with processed/failed/skipped counts
    """
    results = {
        "processed": [],
        "failed": [],
        "skipped": [],
        "retried": [],  # Track materials that required retries
        "started_at": datetime.now(UTC).isoformat(),
        "config": {
            "world_id": config.world_id,
            "turbo": config.turbo,
            "seed": config.seed,
            "validate": config.validate,
            "max_retries": config.max_retries,
            "min_score": config.min_score,
        },
    }

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

    logger.info(
        "Starting batch generation",
        total_materials=len(materials),
        turbo=config.turbo,
        seed=config.seed,
        validate=config.validate,
    )

    if config.dry_run:
        for mat in materials:
            print(f"  [{mat.category}] {mat.id}: {mat.prompt[:60]}...")
            results["skipped"].append({"id": mat.id, "reason": "dry_run"})
        return results

    # Load workflow
    workflow = load_workflow(config.turbo)

    # Initialize library
    library = MaterialLibrary(config.library_root)

    # Initialize critic if validation enabled
    critic = None
    if config.validate:
        print("Initializing MaterialCritic (loading models on first use)...")
        critic = MaterialCritic(
            use_clip=config.use_clip,
            use_aesthetic=config.use_aesthetic,
        )

    # Create ComfyUI client
    client_config = ComfyUIConfig(
        host=config.host,
        port=config.port,
        timeout_seconds=config.timeout_seconds,
    )

    async with ComfyUIClient(client_config) as client:
        # Check connection
        if not await client.health_check():
            raise ConnectionError(f"Cannot connect to ComfyUI at {config.host}:{config.port}")

        stats = await client.get_system_stats()
        gpu_name = stats.get("devices", [{}])[0].get("name", "Unknown GPU")
        logger.info("Connected to ComfyUI", gpu=gpu_name)

        # Generate materials with retry support
        for i, material in enumerate(materials, 1):
            print(f"\n[{i}/{len(materials)}] Generating {material.id}...")

            # Retry loop
            attempt = 0
            best_result = None
            best_maps = None
            best_seed = None
            final_error = None

            while attempt <= config.max_retries:
                # Use different seed for each attempt
                mat_seed = config.seed + hash(material.id) % 10000 + (attempt * 1000)

                if attempt > 0:
                    print(f"    Retry #{attempt} with seed {mat_seed}...")

                mat_def, maps, error = await generate_material(
                    client=client,
                    material=material,
                    workflow=workflow,
                    output_dir=config.output_dir / f"attempt_{attempt}"
                    if attempt > 0
                    else config.output_dir,
                    seed=mat_seed,
                )

                if error:
                    final_error = error
                    attempt += 1
                    continue

                if maps is None:
                    final_error = "No maps generated"
                    attempt += 1
                    continue

                # Get the output path for validation
                mat_output_dir = config.output_dir / material.id
                if attempt > 0:
                    mat_output_dir = config.output_dir / f"attempt_{attempt}" / material.id

                # Validate if critic is available
                if critic is not None:
                    validation_result, passed = await validate_material(
                        critic=critic,
                        material=material,
                        material_path=mat_output_dir,
                        min_score=config.min_score,
                    )

                    score_str = f"{validation_result.score:.2f}"
                    align_str = (
                        f"{validation_result.alignment_score:.2f}"
                        if validation_result.alignment_score
                        else "N/A"
                    )
                    aesth_str = (
                        f"{validation_result.aesthetic_score:.2f}"
                        if validation_result.aesthetic_score
                        else "N/A"
                    )
                    tile_str = f"{validation_result.tileability.overall:.2f}"

                    print(
                        f"    Validation: score={score_str} align={align_str} aesth={aesth_str} tile={tile_str}"
                    )

                    if passed:
                        print("    ✓ Passed validation")
                        best_result = validation_result
                        best_maps = maps
                        best_seed = mat_seed
                        break
                    else:
                        print(
                            f"    ✗ Failed: {validation_result.fail_codes + validation_result.warnings}"
                        )
                        # Keep track of best attempt so far
                        if best_result is None or validation_result.score > best_result.score:
                            best_result = validation_result
                            best_maps = maps
                            best_seed = mat_seed

                        attempt += 1
                        continue
                else:
                    # No validation, accept first successful generation
                    best_maps = maps
                    best_seed = mat_seed
                    break

            # After retry loop - check if we have any valid result
            if best_maps is None:
                results["failed"].append(
                    {
                        "id": material.id,
                        "error": final_error or "All attempts failed",
                        "attempts": attempt,
                    }
                )
                continue

            # Record if retries were needed
            if attempt > 0 and best_result is not None:
                results["retried"].append(
                    {
                        "id": material.id,
                        "attempts": attempt,
                        "final_score": best_result.score,
                    }
                )

            # Add to library (use best attempt)
            try:
                lib_material = Material(
                    id=material.id,
                    metadata=MaterialMetadata(
                        name=material.id.replace("_", " ").title(),
                        description=f"Generated from: {material.prompt[:100]}",
                        category=material.category,
                        tags=material.tags,
                        prompt=material.prompt,
                        seed=best_seed,
                        workflow="chord_turbo" if config.turbo else "chord_pbr",
                        resolution=(2048, 2048) if config.turbo else (1024, 1024),
                        source="comfyui",
                    ),
                    maps=best_maps,
                )

                mat_path = library.add_material(
                    lib_material,
                    category=material.category,
                    generate_godot=True,
                )

                result_entry = {
                    "id": material.id,
                    "category": material.category,
                    "path": str(mat_path),
                    "seed": best_seed,
                    "attempts": attempt + 1,
                }

                if best_result:
                    result_entry["validation"] = {
                        "score": best_result.score,
                        "passed": best_result.passed,
                        "alignment_score": best_result.alignment_score,
                        "aesthetic_score": best_result.aesthetic_score,
                        "tileability": best_result.tileability.overall,
                        "warnings": best_result.warnings,
                    }

                results["processed"].append(result_entry)

                print(f"    -> Saved to {mat_path}")

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
        "total": len(materials),
        "processed": len(results["processed"]),
        "failed": len(results["failed"]),
        "skipped": len(results["skipped"]),
        "retried": len(results["retried"]),
    }

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Generate PBR materials from world.yaml definitions",
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
        help="Comma-separated list of material IDs to generate (default: all)",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output directory for raw ComfyUI outputs (default: .cyntra/runs/materials_<timestamp>)",
    )

    parser.add_argument(
        "--library",
        "-l",
        type=Path,
        default=PROJECT_ROOT / "fab" / "materials",
        help="Material library root (default: fab/materials)",
    )

    parser.add_argument(
        "--host",
        default="localhost",
        help="ComfyUI host (default: localhost)",
    )

    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=8188,
        help="ComfyUI port (default: 8188)",
    )

    parser.add_argument(
        "--seed",
        "-s",
        type=int,
        default=42,
        help="Base random seed (default: 42)",
    )

    parser.add_argument(
        "--turbo",
        action="store_true",
        default=True,
        help="Use CHORD Turbo (2048x2048, 9 steps, faster) - default",
    )

    parser.add_argument(
        "--no-turbo",
        action="store_true",
        help="Use standard CHORD (1024x1024, 30 steps, higher quality)",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without running",
    )

    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Timeout per material in seconds (default: 120)",
    )

    # Validation options
    parser.add_argument(
        "--validate",
        action="store_true",
        default=True,
        help="Enable quality validation with MaterialCritic (default: enabled)",
    )

    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Disable quality validation",
    )

    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Maximum retries for failed validation (default: 3)",
    )

    parser.add_argument(
        "--min-score",
        type=float,
        default=0.6,
        help="Minimum overall score to pass validation (default: 0.6)",
    )

    parser.add_argument(
        "--no-clip",
        action="store_true",
        help="Disable CLIP alignment checking",
    )

    parser.add_argument(
        "--no-aesthetic",
        action="store_true",
        help="Disable LAION aesthetic scoring",
    )

    args = parser.parse_args()

    # Determine output directory
    if args.output:
        output_dir = args.output
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = PROJECT_ROOT / ".cyntra" / "runs" / f"materials_{timestamp}"

    output_dir.mkdir(parents=True, exist_ok=True)

    # Parse materials filter
    materials_filter = None
    if args.materials:
        materials_filter = [m.strip() for m in args.materials.split(",")]

    # Build config
    config = BatchConfig(
        world_id=args.world,
        workflow_path=PROJECT_ROOT / "fab" / "workflows" / "comfyui",
        output_dir=output_dir,
        library_root=args.library,
        host=args.host,
        port=args.port,
        timeout_seconds=args.timeout,
        seed=args.seed,
        turbo=not args.no_turbo,
        dry_run=args.dry_run,
        materials_filter=materials_filter,
        validate=not args.no_validate,
        max_retries=args.max_retries,
        min_score=args.min_score,
        use_clip=not args.no_clip,
        use_aesthetic=not args.no_aesthetic,
    )

    # Run batch
    print("\nMaterial Batch Generator")
    print("========================")
    print(f"World: {config.world_id}")
    print(f"Mode: {'CHORD Turbo (2048x2048)' if config.turbo else 'CHORD Standard (1024x1024)'}")
    print(f"Output: {output_dir}")
    print(f"Library: {config.library_root}")
    print(f"ComfyUI: {config.host}:{config.port}")
    if config.validate:
        features = []
        if config.use_clip:
            features.append("CLIP")
        if config.use_aesthetic:
            features.append("Aesthetic")
        print(
            f"Validation: ON ({', '.join(features)}) min_score={config.min_score} max_retries={config.max_retries}"
        )
    else:
        print("Validation: OFF")
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
    if summary.get("retried", 0) > 0:
        print(f"Retried:   {summary.get('retried', 0)}")

    if results.get("failed"):
        print("\nFailed materials:")
        for fail in results["failed"]:
            print(f"  - {fail['id']}: {fail['error']}")

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
