#!/usr/bin/env python3
"""
Mesh Batch Generator - Generate 3D meshes using Hunyuan3D via ComfyUI.

Supports two modes:
1. Image-to-3D: Provide reference images to generate meshes
2. Text-to-3D: Generate reference images from prompts, then create meshes

Usage:
    # Generate from images
    python -m cyntra.fab.mesh_batch --world props_pack --mode image

    # Generate from text prompts (image gen + mesh gen)
    python -m cyntra.fab.mesh_batch --world props_pack --mode text

    # Specific meshes only
    python -m cyntra.fab.mesh_batch --world props_pack --meshes chair,table
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
from cyntra.fab.lod_generator import LOD_PRESETS, generate_lods
from cyntra.fab.material_generator import MaterialConfig, generate_materials
from cyntra.fab.mesh_library import (
    Mesh,
    MeshFiles,
    MeshLibrary,
    MeshMetadata,
    get_mesh_stats,
)
from cyntra.fab.mesh_optimizer import MeshOptimizeConfig, optimize_mesh

logger = structlog.get_logger()


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
class MeshOptimizeSettings:
    """Per-mesh optimization settings from world.yaml."""

    enabled: bool = True
    target_vertices: int = 25000
    target_faces: int = 12500
    generate_uvs: bool = True
    uv_method: str = "smart_project"


@dataclass
class MeshDefinition:
    """A mesh definition from world.yaml."""

    id: str
    prompt: str
    category: str
    tags: list[str]
    reference_image: str | None = None  # Path to reference image if using image-to-3D
    negative_prompt: str = "blurry, low quality, distorted, ugly"
    optimize: MeshOptimizeSettings | None = None  # Per-mesh optimization settings


@dataclass
class MeshBatchConfig:
    """Configuration for batch mesh generation."""

    world_id: str
    output_dir: Path
    library_root: Path
    host: str = "localhost"
    port: int = 8188
    timeout_seconds: float = 300.0  # Mesh gen takes longer
    seed: int = 42
    mode: str = "text"  # "text" or "image"
    dry_run: bool = False
    meshes_filter: list[str] | None = None
    # Hunyuan3D settings
    guidance_scale: float = 5.5
    steps: int = 50
    hunyuan3d_model: str | None = None  # Auto-detect if None
    # Image generation settings (for text mode)
    image_steps: int = 25
    sdxl_checkpoint: str | None = None  # Auto-detect if None
    fallback_to_image: bool = True  # Fall back to image mode if SDXL unavailable
    # Optimization settings (defaults for meshes without per-mesh config)
    optimize_enabled: bool = True
    optimize_target_vertices: int = 25000
    optimize_target_faces: int = 12500
    optimize_generate_uvs: bool = True
    optimize_uv_method: str = "smart_project"
    # Material generation settings
    generate_materials: bool = False  # Generate PBR textures using Chord
    material_texture_size: int = 1024
    # LOD generation settings
    generate_lods: bool = False  # Generate LOD meshes
    lod_preset: str = "desktop"  # desktop, mobile, or vr


def load_world_config(world_id: str) -> dict[str, Any]:
    """Load world.yaml configuration."""
    world_path = PROJECT_ROOT / "fab" / "worlds" / world_id / "world.yaml"
    if not world_path.exists():
        raise FileNotFoundError(f"World config not found: {world_path}")

    with open(world_path) as f:
        return yaml.safe_load(f)


def parse_meshes(config: dict[str, Any]) -> list[MeshDefinition]:
    """Parse mesh definitions from world config."""
    meshes = []
    for mesh in config.get("meshes", []):
        # Parse per-mesh optimization settings if present
        optimize_settings = None
        if "optimize" in mesh:
            opt = mesh["optimize"]
            optimize_settings = MeshOptimizeSettings(
                enabled=opt.get("enabled", True),
                target_vertices=opt.get("target_vertices", 25000),
                target_faces=opt.get("target_faces", 12500),
                generate_uvs=opt.get("generate_uvs", True),
                uv_method=opt.get("uv_method", "smart_project"),
            )

        meshes.append(
            MeshDefinition(
                id=mesh["id"],
                prompt=mesh["prompt"],
                category=mesh.get("category", "props"),
                tags=mesh.get("tags", []),
                reference_image=mesh.get("reference_image"),
                negative_prompt=mesh.get("negative_prompt", "blurry, low quality, distorted"),
                optimize=optimize_settings,
            )
        )
    return meshes


def build_hunyuan3d_workflow(
    image_path: str,
    output_prefix: str,
    guidance_scale: float = 5.5,
    steps: int = 50,
    seed: int = 42,
    model: str = "hunyuan_3d_v2.1.safetensors",
    octree_resolution: int = 256,
    num_chunks: int = 8000,
    mesh_threshold: float = 0.6,
) -> dict[str, Any]:
    """
    Build a Hunyuan3D v2.1 workflow using native ComfyUI nodes.

    Node chain:
    1. ImageOnlyCheckpointLoader → MODEL, CLIP_VISION, VAE
    2. LoadImage → IMAGE
    3. CLIPVisionEncode (clip_vision + image) → CLIP_VISION_OUTPUT
    4. Hunyuan3Dv2Conditioning (clip_vision_output) → positive/negative CONDITIONING
    5. EmptyLatentHunyuan3Dv2 (resolution) → LATENT
    6. KSampler → sampled LATENT
    7. VAEDecodeHunyuan3D → VOXEL data
    8. VoxelToMeshBasic → MESH
    9. SaveGLB → output/mesh/{prefix}_00001.glb
    """
    workflow = {
        # Node 1: Load Hunyuan3D checkpoint
        "1": {
            "class_type": "ImageOnlyCheckpointLoader",
            "inputs": {"ckpt_name": model},
            # Outputs: [0]=MODEL, [1]=CLIP_VISION, [2]=VAE
        },
        # Node 2: Load the reference image
        "2": {
            "class_type": "LoadImage",
            "inputs": {"image": image_path},
            # Outputs: [0]=IMAGE, [1]=MASK
        },
        # Node 3: Encode image with CLIP Vision
        "3": {
            "class_type": "CLIPVisionEncode",
            "inputs": {
                "clip_vision": ["1", 1],  # CLIP_VISION from checkpoint
                "image": ["2", 0],  # IMAGE from LoadImage
                "crop": "center",  # center crop for best results
            },
            # Outputs: [0]=CLIP_VISION_OUTPUT
        },
        # Node 4: Create conditioning from CLIP vision output
        "4": {
            "class_type": "Hunyuan3Dv2Conditioning",
            "inputs": {
                "clip_vision_output": ["3", 0]  # CLIP_VISION_OUTPUT
            },
            # Outputs: [0]=positive CONDITIONING, [1]=negative CONDITIONING
        },
        # Node 5: Create empty latent for 3D generation
        "5": {
            "class_type": "EmptyLatentHunyuan3Dv2",
            "inputs": {
                "resolution": 3072,  # Standard resolution for Hunyuan3D
                "batch_size": 1,
            },
            # Outputs: [0]=LATENT
        },
        # Node 6: Sample the latent space
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],  # MODEL from checkpoint
                "positive": ["4", 0],  # positive CONDITIONING
                "negative": ["4", 1],  # negative CONDITIONING
                "latent_image": ["5", 0],  # LATENT
                "seed": seed,
                "steps": steps,
                "cfg": guidance_scale,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
            },
            # Outputs: [0]=LATENT (sampled)
        },
        # Node 7: Decode latent to voxels
        "7": {
            "class_type": "VAEDecodeHunyuan3D",
            "inputs": {
                "samples": ["6", 0],  # sampled LATENT
                "vae": ["1", 2],  # VAE from checkpoint
                "num_chunks": num_chunks,  # Memory optimization
                "octree_resolution": octree_resolution,  # Voxel resolution
            },
            # Outputs: [0]=VOXEL
        },
        # Node 8: Convert voxels to mesh
        "8": {
            "class_type": "VoxelToMeshBasic",
            "inputs": {
                "voxel": ["7", 0],  # VOXEL data
                "threshold": mesh_threshold,  # Surface extraction threshold
            },
            # Outputs: [0]=MESH
        },
        # Node 9: Save mesh as GLB
        "9": {
            "class_type": "SaveGLB",
            "inputs": {
                "mesh": ["8", 0],  # MESH
                "filename_prefix": output_prefix,
            },
            # Saves to: output/mesh/{prefix}_00001.glb
        },
    }
    return workflow


def enhance_prompt_for_3d(prompt: str) -> str:
    """
    Add keywords that improve 3D reconstruction from generated images.

    Enhances prompts with terms that produce cleaner reference images.
    """
    suffix = (
        ", white background, centered object, "
        "product photography, studio lighting, "
        "single object, clean edges, high detail, "
        "no shadows on background"
    )
    return prompt + suffix


def build_image_gen_workflow(
    prompt: str,
    negative_prompt: str,
    output_prefix: str,
    steps: int = 25,
    seed: int = 42,
    checkpoint: str = "sd_xl_base_1.0.safetensors",
) -> dict[str, Any]:
    """
    Build an image generation workflow for creating reference images.

    Generates a clean product shot suitable for 3D reconstruction.

    Args:
        prompt: Text description of the object
        negative_prompt: Things to avoid in the image
        output_prefix: Filename prefix for output
        steps: Number of sampling steps
        seed: Random seed for reproducibility
        checkpoint: SDXL checkpoint name to use
    """
    # Enhance prompt for better 3D reconstruction
    enhanced_prompt = enhance_prompt_for_3d(prompt)

    # SDXL workflow for generating reference images
    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": checkpoint}},
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": enhanced_prompt, "clip": ["1", 1]},
            "_meta": {"title": "Positive Prompt"},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": f"{negative_prompt}, complex background, multiple objects, text, watermark",
                "clip": ["1", 1],
            },
            "_meta": {"title": "Negative Prompt"},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
                "seed": seed,
                "steps": steps,
                "cfg": 7.5,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "denoise": 1.0,
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["6", 0], "filename_prefix": output_prefix},
        },
    }
    return workflow


async def generate_reference_image(
    client: ComfyUIClient,
    mesh: MeshDefinition,
    output_dir: Path,
    config: MeshBatchConfig,
    checkpoint: str,
) -> Path | None:
    """Generate a reference image from a text prompt."""
    workflow = build_image_gen_workflow(
        prompt=mesh.prompt,
        negative_prompt=mesh.negative_prompt,
        output_prefix=f"ref_{mesh.id}",
        steps=config.image_steps,
        seed=config.seed + hash(mesh.id) % 10000,
        checkpoint=checkpoint,
    )

    logger.info("Generating reference image", mesh_id=mesh.id)

    try:
        prompt_id = await client.queue_prompt(workflow)
        result = await client.wait_for_completion(prompt_id)

        if result.status != "completed":
            logger.error("Image generation failed", mesh_id=mesh.id, error=result.error)
            return None

        # Download the generated image
        downloaded = await client.download_outputs(result, output_dir)

        # Find the generated image
        for files in downloaded.values():
            for f in files:
                if f.suffix.lower() in [".png", ".jpg", ".jpeg"]:
                    return f

        return None

    except Exception as e:
        logger.error("Reference image generation failed", mesh_id=mesh.id, error=str(e))
        return None


async def generate_mesh(
    client: ComfyUIClient,
    mesh: MeshDefinition,
    image_path: Path,
    output_dir: Path,
    config: MeshBatchConfig,
    hunyuan3d_model: str = "hunyuan_3d_v2.1.safetensors",
) -> tuple[MeshDefinition, MeshFiles | None, str | None]:
    """Generate a 3D mesh from an image using Hunyuan3D."""
    mesh_output_dir = output_dir / mesh.id
    mesh_output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Upload image to ComfyUI's input folder
        image_name = await client.upload_image(image_path)
        if not image_name:
            return (mesh, None, f"Failed to upload image: {image_path}")

        logger.debug("Uploaded image for mesh generation", mesh_id=mesh.id, image_name=image_name)

        workflow = build_hunyuan3d_workflow(
            image_path=image_name,
            output_prefix=f"mesh_{mesh.id}",
            guidance_scale=config.guidance_scale,
            steps=config.steps,
            seed=config.seed + hash(mesh.id) % 10000,
            model=hunyuan3d_model,
        )

        logger.info(
            "Generating mesh",
            mesh_id=mesh.id,
            image=str(image_path),
        )

        start_time = time.time()

        prompt_id = await client.queue_prompt(workflow)
        result = await client.wait_for_completion(prompt_id, timeout=config.timeout_seconds)

        elapsed = time.time() - start_time

        if result.status != "completed":
            error_msg = result.error or f"Mesh generation failed: {result.status}"
            logger.error(
                "Mesh generation failed",
                mesh_id=mesh.id,
                error=error_msg,
                elapsed_s=round(elapsed, 1),
            )
            return (mesh, None, error_msg)

        # Download mesh outputs
        downloaded = await client.download_outputs(result, mesh_output_dir)

        logger.info(
            "Mesh generated",
            mesh_id=mesh.id,
            elapsed_s=round(elapsed, 1),
            files=sum(len(files) for files in downloaded.values()),
        )

        # Organize outputs
        files = MeshFiles()
        for node_files in downloaded.values():
            for f in node_files:
                if f.suffix.lower() in [".glb", ".gltf"]:
                    if "textured" in f.stem.lower() or files.glb is None:
                        files.glb = f
                    else:
                        files.glb_untextured = f
                elif f.suffix.lower() in [".png", ".jpg"] and (
                    "thumb" in f.stem.lower() or "preview" in f.stem.lower()
                ):
                    files.thumbnail = f

        return (mesh, files, None)

    except Exception as e:
        error_msg = str(e)
        logger.error(
            "Mesh generation error",
            mesh_id=mesh.id,
            error=error_msg,
        )
        return (mesh, None, error_msg)


async def run_batch(config: MeshBatchConfig) -> dict[str, Any]:
    """Run batch mesh generation."""
    results = {
        "processed": [],
        "failed": [],
        "skipped": [],
        "started_at": datetime.now(UTC).isoformat(),
        "config": {
            "world_id": config.world_id,
            "mode": config.mode,
            "seed": config.seed,
        },
    }

    # Load world config
    world_config = load_world_config(config.world_id)
    meshes = parse_meshes(world_config)

    if config.meshes_filter:
        filter_set = set(config.meshes_filter)
        meshes = [m for m in meshes if m.id in filter_set]

    if not meshes:
        logger.warning("No meshes to generate")
        return results

    logger.info(
        "Starting mesh batch generation",
        total_meshes=len(meshes),
        mode=config.mode,
        seed=config.seed,
    )

    if config.dry_run:
        for mesh in meshes:
            print(f"  [{mesh.category}] {mesh.id}: {mesh.prompt[:60]}...")
            results["skipped"].append({"id": mesh.id, "reason": "dry_run"})
        return results

    # Initialize library
    library = MeshLibrary(config.library_root)

    # Create ComfyUI client
    client_config = ComfyUIConfig(
        host=config.host,
        port=config.port,
        timeout_seconds=config.timeout_seconds,
    )

    async with ComfyUIClient(client_config) as client:
        if not await client.health_check():
            raise ConnectionError(f"Cannot connect to ComfyUI at {config.host}:{config.port}")

        stats = await client.get_system_stats()
        gpu_name = stats.get("devices", [{}])[0].get("name", "Unknown GPU")
        logger.info("Connected to ComfyUI", gpu=gpu_name)

        # Validate models for text mode
        sdxl_checkpoint = config.sdxl_checkpoint
        hunyuan3d_model = config.hunyuan3d_model

        if config.mode == "text" and not sdxl_checkpoint:
            # Auto-detect SDXL checkpoint
            is_valid, found_sdxl, found_hunyuan = await client.validate_models_for_text_mode()

            if found_sdxl:
                sdxl_checkpoint = found_sdxl
                print(f"  Using SDXL checkpoint: {sdxl_checkpoint}")
            else:
                if config.fallback_to_image:
                    logger.warning(
                        "SDXL not available, falling back to image mode",
                        hint="Provide reference_image in world.yaml for each mesh",
                    )
                    print("\n⚠️  SDXL checkpoint not found on server.")
                    print(
                        "   Falling back to image mode. Meshes without reference_image will be skipped."
                    )
                    config.mode = "image"
                    results["config"]["mode"] = "image"
                    results["config"]["fallback_reason"] = "SDXL checkpoint not available"
                else:
                    raise RuntimeError(
                        "Text-to-3D requires SDXL checkpoint. Install a model or use --mode image.\n"
                        "See: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0"
                    )

            if found_hunyuan:
                hunyuan3d_model = found_hunyuan
                print(f"  Using Hunyuan3D model: {hunyuan3d_model}")

        # Verify Hunyuan3D model if not already set
        if not hunyuan3d_model:
            hunyuan_models = await client.list_hunyuan3d_models()
            if hunyuan_models:
                hunyuan3d_model = hunyuan_models[0]
                print(f"  Using Hunyuan3D model: {hunyuan3d_model}")
            else:
                # Use default model name
                hunyuan3d_model = "hunyuan_3d_v2.1.safetensors"
                logger.warning("Using default Hunyuan3D model name", model=hunyuan3d_model)

        for i, mesh in enumerate(meshes, 1):
            print(f"\n[{i}/{len(meshes)}] Generating {mesh.id}...")

            # Get reference image
            if config.mode == "text" and not mesh.reference_image:
                # Generate reference image from prompt
                ref_image = await generate_reference_image(
                    client,
                    mesh,
                    config.output_dir / "references",
                    config,
                    checkpoint=sdxl_checkpoint or "sd_xl_base_1.0.safetensors",
                )
                if not ref_image:
                    results["failed"].append(
                        {
                            "id": mesh.id,
                            "error": "Failed to generate reference image",
                        }
                    )
                    continue
            elif mesh.reference_image:
                ref_image = Path(mesh.reference_image)
                if not ref_image.exists():
                    results["failed"].append(
                        {
                            "id": mesh.id,
                            "error": f"Reference image not found: {ref_image}",
                        }
                    )
                    continue
            else:
                results["failed"].append(
                    {
                        "id": mesh.id,
                        "error": "No reference image and mode is not 'text'",
                    }
                )
                continue

            # Generate mesh from image
            mesh_def, files, error = await generate_mesh(
                client,
                mesh,
                ref_image,
                config.output_dir,
                config,
                hunyuan3d_model=hunyuan3d_model or "hunyuan_3d_v2.1.safetensors",
            )

            if error:
                results["failed"].append({"id": mesh.id, "error": error})
                continue

            if files is None or files.glb is None:
                results["failed"].append(
                    {
                        "id": mesh.id,
                        "error": "No mesh file generated",
                    }
                )
                continue

            # Get mesh stats
            mesh_stats = get_mesh_stats(files.glb)

            # Optimize mesh if enabled
            opt_settings = mesh.optimize or MeshOptimizeSettings(
                enabled=config.optimize_enabled,
                target_vertices=config.optimize_target_vertices,
                target_faces=config.optimize_target_faces,
                generate_uvs=config.optimize_generate_uvs,
                uv_method=config.optimize_uv_method,
            )

            if opt_settings.enabled:
                print(f"    Optimizing mesh (target: {opt_settings.target_vertices} verts)...")
                original_glb = files.glb
                optimized_glb = files.glb.with_stem(f"{files.glb.stem}_optimized")

                opt_config = MeshOptimizeConfig(
                    target_vertices=opt_settings.target_vertices,
                    target_faces=opt_settings.target_faces,
                    generate_uvs=opt_settings.generate_uvs,
                    uv_method=opt_settings.uv_method,
                )

                opt_result = await optimize_mesh(original_glb, optimized_glb, opt_config)

                if opt_result.success and opt_result.output_path:
                    # Use optimized mesh, keep original as untextured reference
                    files.glb = opt_result.output_path
                    files.glb_untextured = original_glb
                    # Update stats with optimized values
                    mesh_stats = get_mesh_stats(files.glb)
                    print(
                        f"    Optimized: {opt_result.initial_vertices:,} → {opt_result.final_vertices:,} verts "
                        f"({opt_result.vertex_reduction_pct:.1f}% reduction)"
                    )
                else:
                    print(f"    Optimization failed: {opt_result.error}")
                    logger.warning(
                        "Mesh optimization failed, using original",
                        mesh_id=mesh.id,
                        error=opt_result.error,
                    )

            # Generate PBR materials if enabled
            if config.generate_materials and ref_image:
                print("    Generating PBR materials...")
                texture_dir = files.glb.parent / "textures"
                mat_config = MaterialConfig(
                    texture_size=config.material_texture_size,
                )
                mat_result = await generate_materials(
                    client=client,
                    reference_image=ref_image,
                    output_dir=texture_dir,
                    mesh_id=mesh.id,
                    config=mat_config,
                )
                if mat_result.success:
                    # Store texture paths in files
                    files.textures = texture_dir
                    tex_count = sum(
                        1
                        for p in [
                            mat_result.basecolor,
                            mat_result.normal,
                            mat_result.roughness,
                            mat_result.metalness,
                        ]
                        if p
                    )
                    print(f"    Generated {tex_count} PBR textures")
                else:
                    print(f"    Material generation failed: {mat_result.error}")
                    logger.warning(
                        "Material generation failed",
                        mesh_id=mesh.id,
                        error=mat_result.error,
                    )

            # Generate LODs if enabled
            if config.generate_lods:
                print(f"    Generating LODs ({config.lod_preset} preset)...")
                lod_dir = files.glb.parent / "lods"
                lod_config = LOD_PRESETS.get(config.lod_preset, LOD_PRESETS["desktop"])
                lod_result = await generate_lods(
                    source_mesh=files.glb,
                    output_dir=lod_dir,
                    config=lod_config,
                )
                if lod_result.success:
                    files.lods = lod_dir
                    print(f"    Generated {len(lod_result.lod_meshes)} LOD levels:")
                    for lod_name, _lod_path in sorted(lod_result.lod_meshes.items()):
                        stats = lod_result.lod_stats.get(lod_name, {})
                        print(f"      {lod_name}: {stats.get('final_vertices', 0):,} verts")
                else:
                    print("    LOD generation failed")
                    for error in lod_result.errors:
                        logger.warning("LOD generation error", mesh_id=mesh.id, error=error)

            # Add to library
            try:
                mat_seed = config.seed + hash(mesh.id) % 10000
                lib_mesh = Mesh(
                    id=mesh.id,
                    metadata=MeshMetadata(
                        name=mesh.id.replace("_", " ").title(),
                        description=f"Generated from: {mesh.prompt[:100]}",
                        category=mesh.category,
                        tags=mesh.tags,
                        prompt=mesh.prompt,
                        seed=mat_seed,
                        workflow="hunyuan3d_v2",
                        source="comfyui",
                        vertices=mesh_stats.get("vertices"),
                        faces=mesh_stats.get("faces"),
                        file_size_bytes=mesh_stats.get("file_size_bytes"),
                        has_textures=mesh_stats.get("has_textures", False),
                        has_uvs=mesh_stats.get("has_uvs", False),
                    ),
                    files=files,
                )

                mesh_path = library.add_mesh(
                    lib_mesh,
                    category=mesh.category,
                    generate_godot=True,
                )

                results["processed"].append(
                    {
                        "id": mesh.id,
                        "category": mesh.category,
                        "path": str(mesh_path),
                        "vertices": mesh_stats.get("vertices"),
                        "faces": mesh_stats.get("faces"),
                    }
                )

                print(f"    -> Saved to {mesh_path}")

            except Exception as e:
                logger.error("Failed to add to library", mesh_id=mesh.id, error=str(e))
                results["failed"].append(
                    {
                        "id": mesh.id,
                        "error": f"Library error: {e}",
                    }
                )

    results["finished_at"] = datetime.now(UTC).isoformat()
    results["summary"] = {
        "total": len(meshes),
        "processed": len(results["processed"]),
        "failed": len(results["failed"]),
        "skipped": len(results["skipped"]),
    }

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Generate 3D meshes using Hunyuan3D via ComfyUI",
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
        "--meshes",
        "-m",
        help="Comma-separated list of mesh IDs to generate (default: all)",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output directory (default: .cyntra/runs/meshes_<timestamp>)",
    )

    parser.add_argument(
        "--library",
        "-l",
        type=Path,
        default=PROJECT_ROOT / "fab" / "meshes",
        help="Mesh library root (default: fab/meshes)",
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
        "--mode",
        choices=["text", "image"],
        default="text",
        help="Generation mode: 'text' (prompt→image→mesh) or 'image' (image→mesh)",
    )

    parser.add_argument(
        "--steps",
        type=int,
        default=50,
        help="Hunyuan3D sampling steps (default: 50)",
    )

    parser.add_argument(
        "--guidance",
        type=float,
        default=5.5,
        help="Guidance scale (default: 5.5)",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without running",
    )

    parser.add_argument(
        "--timeout",
        type=float,
        default=300.0,
        help="Timeout per mesh in seconds (default: 300)",
    )

    parser.add_argument(
        "--materials",
        action="store_true",
        help="Generate PBR textures using Chord model",
    )

    parser.add_argument(
        "--lods",
        action="store_true",
        help="Generate LOD meshes (lod0/lod1/lod2)",
    )

    parser.add_argument(
        "--lod-preset",
        choices=["desktop", "mobile", "vr"],
        default="desktop",
        help="LOD preset configuration (default: desktop)",
    )

    args = parser.parse_args()

    # Determine output directory
    if args.output:
        output_dir = args.output
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = PROJECT_ROOT / ".cyntra" / "runs" / f"meshes_{timestamp}"

    output_dir.mkdir(parents=True, exist_ok=True)

    # Parse meshes filter
    meshes_filter = None
    if args.meshes:
        meshes_filter = [m.strip() for m in args.meshes.split(",")]

    # Build config
    config = MeshBatchConfig(
        world_id=args.world,
        output_dir=output_dir,
        library_root=args.library,
        host=args.host,
        port=args.port,
        timeout_seconds=args.timeout,
        seed=args.seed,
        mode=args.mode,
        dry_run=args.dry_run,
        meshes_filter=meshes_filter,
        guidance_scale=args.guidance,
        steps=args.steps,
        generate_materials=args.materials,
        generate_lods=args.lods,
        lod_preset=args.lod_preset,
    )

    print("\nMesh Batch Generator")
    print("====================")
    print(f"World: {config.world_id}")
    print(
        f"Mode: {config.mode} (text→image→mesh)"
        if config.mode == "text"
        else f"Mode: {config.mode} (image→mesh)"
    )
    print(f"Output: {output_dir}")
    print(f"Library: {config.library_root}")
    print(f"ComfyUI: {config.host}:{config.port}")
    print(f"Hunyuan3D: steps={config.steps} guidance={config.guidance_scale}")
    if config.generate_materials:
        print("Materials: enabled (Chord PBR)")
    if config.generate_lods:
        print(f"LODs: enabled ({config.lod_preset} preset)")
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
        print("\nFailed meshes:")
        for fail in results["failed"]:
            print(f"  - {fail['id']}: {fail['error']}")

    # Save results
    results_path = output_dir / "batch_results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to: {results_path}")

    if results.get("failed"):
        sys.exit(1)


if __name__ == "__main__":
    main()
