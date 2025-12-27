"""
Material Generator - Generate PBR textures for 3D meshes.

Uses ComfyUI's Chord model for material estimation from reference images,
then bakes the textures onto mesh UVs using Blender.

Workflow:
1. Load reference image used for mesh generation
2. Run ChordMaterialEstimation to get basecolor, normal, roughness, metalness
3. Bake textures onto mesh UVs in Blender
4. Save optimized textures alongside mesh
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig

logger = structlog.get_logger()


@dataclass
class MaterialConfig:
    """Configuration for material generation."""

    # Texture resolution
    texture_size: int = 1024  # 1024x1024 textures

    # Output format
    format: str = "png"  # png or jpg
    quality: int = 95  # JPEG quality if using jpg

    # Which maps to generate
    generate_basecolor: bool = True
    generate_normal: bool = True
    generate_roughness: bool = True
    generate_metalness: bool = True
    generate_height: bool = False  # Optional height map from normal

    # Baking settings
    bake_to_uvs: bool = True  # Project textures onto mesh UVs

    # Timeout
    timeout_seconds: float = 120.0


@dataclass
class MaterialResult:
    """Result from material generation."""

    success: bool
    mesh_id: str

    # Generated texture paths
    basecolor: Path | None = None
    normal: Path | None = None
    roughness: Path | None = None
    metalness: Path | None = None
    height: Path | None = None

    # Error info
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "mesh_id": self.mesh_id,
            "textures": {
                "basecolor": str(self.basecolor) if self.basecolor else None,
                "normal": str(self.normal) if self.normal else None,
                "roughness": str(self.roughness) if self.roughness else None,
                "metalness": str(self.metalness) if self.metalness else None,
                "height": str(self.height) if self.height else None,
            },
            "error": self.error,
        }


def build_material_estimation_workflow(
    image_path: str,
    output_prefix: str,
    generate_height: bool = False,
    chord_model: str = "chord_v1.safetensors",
) -> dict[str, Any]:
    """
    Build a ComfyUI workflow for PBR material estimation using Chord.

    Outputs 4 images: basecolor, normal, roughness, metalness
    Optionally generates height map from normal.
    """
    workflow = {
        # Node 1: Load Chord model
        "1": {"class_type": "ChordLoadModel", "inputs": {"ckpt_name": chord_model}},
        # Node 2: Load reference image
        "2": {"class_type": "LoadImage", "inputs": {"image": image_path}},
        # Node 3: Estimate materials
        "3": {
            "class_type": "ChordMaterialEstimation",
            "inputs": {"chord_model": ["1", 0], "image": ["2", 0]},
            # Outputs: [0]=basecolor, [1]=normal, [2]=roughness, [3]=metalness
        },
        # Node 4: Save basecolor
        "4": {
            "class_type": "SaveImage",
            "inputs": {"images": ["3", 0], "filename_prefix": f"{output_prefix}_basecolor"},
        },
        # Node 5: Save normal
        "5": {
            "class_type": "SaveImage",
            "inputs": {"images": ["3", 1], "filename_prefix": f"{output_prefix}_normal"},
        },
        # Node 6: Save roughness
        "6": {
            "class_type": "SaveImage",
            "inputs": {"images": ["3", 2], "filename_prefix": f"{output_prefix}_roughness"},
        },
        # Node 7: Save metalness
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["3", 3], "filename_prefix": f"{output_prefix}_metalness"},
        },
    }

    if generate_height:
        # Node 8: Convert normal to height
        workflow["8"] = {"class_type": "ChordNormalToHeight", "inputs": {"normal_map": ["3", 1]}}
        # Node 9: Save height
        workflow["9"] = {
            "class_type": "SaveImage",
            "inputs": {"images": ["8", 0], "filename_prefix": f"{output_prefix}_height"},
        }

    return workflow


async def generate_materials(
    client: ComfyUIClient,
    reference_image: Path,
    output_dir: Path,
    mesh_id: str,
    config: MaterialConfig | None = None,
) -> MaterialResult:
    """
    Generate PBR materials from a reference image.

    Args:
        client: ComfyUI client
        reference_image: Path to the reference image used for mesh generation
        output_dir: Directory to save textures
        mesh_id: Mesh identifier for naming
        config: Material generation configuration

    Returns:
        MaterialResult with texture paths
    """
    config = config or MaterialConfig()
    result = MaterialResult(success=False, mesh_id=mesh_id)

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Upload image to ComfyUI
        image_name = await client.upload_image(reference_image)
        if not image_name:
            result.error = f"Failed to upload reference image: {reference_image}"
            return result

        # Build workflow
        workflow = build_material_estimation_workflow(
            image_path=image_name,
            output_prefix=f"mat_{mesh_id}",
            generate_height=config.generate_height,
        )

        logger.info(
            "Generating materials",
            mesh_id=mesh_id,
            reference_image=str(reference_image),
        )

        # Queue and wait
        prompt_id = await client.queue_prompt(workflow)
        comfy_result = await client.wait_for_completion(prompt_id, timeout=config.timeout_seconds)

        if comfy_result.status != "completed":
            result.error = (
                comfy_result.error or f"Material generation failed: {comfy_result.status}"
            )
            return result

        # Download outputs
        downloaded = await client.download_outputs(comfy_result, output_dir)

        # Map outputs to texture types
        # Node 4 = basecolor, Node 5 = normal, Node 6 = roughness, Node 7 = metalness
        for _node_id, files in downloaded.items():
            for f in files:
                if "basecolor" in f.stem.lower():
                    result.basecolor = f
                elif "normal" in f.stem.lower():
                    result.normal = f
                elif "roughness" in f.stem.lower():
                    result.roughness = f
                elif "metalness" in f.stem.lower() or "metallic" in f.stem.lower():
                    result.metalness = f
                elif "height" in f.stem.lower():
                    result.height = f

        result.success = True

        logger.info(
            "Materials generated",
            mesh_id=mesh_id,
            basecolor=result.basecolor is not None,
            normal=result.normal is not None,
            roughness=result.roughness is not None,
            metalness=result.metalness is not None,
        )

    except Exception as e:
        result.error = str(e)
        logger.error("Material generation failed", mesh_id=mesh_id, error=str(e))

    return result


async def generate_materials_for_mesh(
    mesh_path: Path,
    reference_image: Path,
    output_dir: Path | None = None,
    config: MaterialConfig | None = None,
    comfyui_host: str = "localhost",
    comfyui_port: int = 8188,
) -> MaterialResult:
    """
    Convenience function to generate materials for a single mesh.

    Args:
        mesh_path: Path to the mesh GLB file
        reference_image: Path to the reference image
        output_dir: Output directory (defaults to mesh directory)
        config: Material configuration
        comfyui_host: ComfyUI server host
        comfyui_port: ComfyUI server port

    Returns:
        MaterialResult with texture paths
    """
    mesh_id = mesh_path.stem
    output_dir = output_dir or mesh_path.parent / "textures"

    client_config = ComfyUIConfig(host=comfyui_host, port=comfyui_port)

    async with ComfyUIClient(client_config) as client:
        if not await client.health_check():
            return MaterialResult(
                success=False,
                mesh_id=mesh_id,
                error=f"Cannot connect to ComfyUI at {comfyui_host}:{comfyui_port}",
            )

        return await generate_materials(
            client=client,
            reference_image=reference_image,
            output_dir=output_dir,
            mesh_id=mesh_id,
            config=config,
        )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate PBR materials from reference image")
    parser.add_argument("mesh", type=Path, help="Path to mesh GLB file")
    parser.add_argument("reference", type=Path, help="Path to reference image")
    parser.add_argument("--output", "-o", type=Path, help="Output directory")
    parser.add_argument("--host", default="localhost", help="ComfyUI host")
    parser.add_argument("--port", type=int, default=8188, help="ComfyUI port")
    parser.add_argument("--height", action="store_true", help="Generate height map")

    args = parser.parse_args()

    config = MaterialConfig(generate_height=args.height)

    result = asyncio.run(
        generate_materials_for_mesh(
            mesh_path=args.mesh,
            reference_image=args.reference,
            output_dir=args.output,
            config=config,
            comfyui_host=args.host,
            comfyui_port=args.port,
        )
    )

    if result.success:
        print(f"Materials generated for {result.mesh_id}:")
        print(f"  Basecolor: {result.basecolor}")
        print(f"  Normal: {result.normal}")
        print(f"  Roughness: {result.roughness}")
        print(f"  Metalness: {result.metalness}")
        if result.height:
            print(f"  Height: {result.height}")
    else:
        print(f"Failed: {result.error}")
