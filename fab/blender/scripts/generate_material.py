#!/usr/bin/env python3
"""
Blender Procedural Material Generator

Runs in Blender headless mode to generate PBR material maps using
procedural shader nodes. Outputs tileable textures for game use.

Usage:
    blender --background --python generate_material.py -- \
        --output /path/to/output_dir \
        --material-id grass_meadow \
        --category terrain \
        --resolution 2048 \
        --seed 42

Supported categories and their procedural approaches:
- terrain: noise-based with color variation
- architecture: pattern-based (bricks, tiles, etc.)
- metal: reflectance + noise for wear
- wood: grain patterns
- organic: fractal noise
- fabric: weave patterns
"""

import argparse
import json
import sys
from pathlib import Path

# Blender imports
try:
    import bpy

    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False
    print("Warning: Not running in Blender context")


def parse_args():
    """Parse command line arguments after '--'."""
    try:
        idx = sys.argv.index("--")
        args = sys.argv[idx + 1 :]
    except ValueError:
        args = []

    parser = argparse.ArgumentParser(description="Generate procedural PBR materials")
    parser.add_argument("--output", "-o", required=True, help="Output directory")
    parser.add_argument("--material-id", "-m", required=True, help="Material ID")
    parser.add_argument("--category", "-c", default="terrain", help="Material category")
    parser.add_argument(
        "--prompt", "-p", default="", help="Material description prompt"
    )
    parser.add_argument(
        "--resolution", "-r", type=int, default=2048, help="Texture resolution"
    )
    parser.add_argument("--seed", "-s", type=int, default=42, help="Random seed")
    parser.add_argument("--result-file", help="JSON file to write results")

    return parser.parse_args(args)


def setup_scene():
    """Setup a clean scene for baking."""
    # Clear existing objects
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Create a plane for baking
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    plane = bpy.context.active_object
    plane.name = "BakePlane"

    # UV unwrap the plane
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.001)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Set render engine to Cycles for baking
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.device = "CPU"
    bpy.context.scene.cycles.samples = 16
    bpy.context.scene.cycles.bake_type = "DIFFUSE"

    return plane


def create_material_nodes(
    category: str, material_id: str, seed: int
) -> bpy.types.Material:
    """Create procedural material based on category."""
    mat = bpy.data.materials.new(name=material_id)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Clear default nodes
    nodes.clear()

    # Create output nodes for each map type
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (800, 0)

    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (500, 0)
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    # Category-specific node setup
    if category == "terrain":
        setup_terrain_nodes(nodes, links, principled, material_id, seed)
    elif category == "architecture":
        setup_architecture_nodes(nodes, links, principled, material_id, seed)
    elif category == "metal":
        setup_metal_nodes(nodes, links, principled, material_id, seed)
    elif category == "wood":
        setup_wood_nodes(nodes, links, principled, material_id, seed)
    elif category == "organic":
        setup_organic_nodes(nodes, links, principled, material_id, seed)
    elif category == "fabric":
        setup_fabric_nodes(nodes, links, principled, material_id, seed)
    else:
        # Default: simple noise-based
        setup_terrain_nodes(nodes, links, principled, material_id, seed)

    return mat


def setup_terrain_nodes(nodes, links, principled, material_id: str, seed: int):
    """Setup terrain material (grass, dirt, sand, rock, etc.)."""
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (4.0, 4.0, 4.0)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    # Determine colors based on material_id
    if "grass" in material_id:
        base_color = (0.15, 0.35, 0.08, 1.0)
        alt_color = (0.12, 0.28, 0.05, 1.0)
        roughness_base = 0.8
    elif "dirt" in material_id or "soil" in material_id:
        base_color = (0.25, 0.18, 0.12, 1.0)
        alt_color = (0.20, 0.14, 0.08, 1.0)
        roughness_base = 0.9
    elif "sand" in material_id:
        base_color = (0.76, 0.70, 0.50, 1.0)
        alt_color = (0.72, 0.65, 0.45, 1.0)
        roughness_base = 0.85
    elif "gravel" in material_id or "rock" in material_id:
        base_color = (0.35, 0.35, 0.35, 1.0)
        alt_color = (0.28, 0.28, 0.28, 1.0)
        roughness_base = 0.75
    else:
        base_color = (0.4, 0.35, 0.3, 1.0)
        alt_color = (0.35, 0.30, 0.25, 1.0)
        roughness_base = 0.8

    # Noise for color variation
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-400, 100)
    noise.inputs["Scale"].default_value = 8.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.6
    noise.noise_dimensions = "3D"
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    # Color ramp for base color
    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.location = (-200, 100)
    color_ramp.color_ramp.elements[0].color = base_color
    color_ramp.color_ramp.elements[1].color = alt_color
    links.new(noise.outputs["Fac"], color_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])

    # Roughness from noise
    roughness_ramp = nodes.new("ShaderNodeValToRGB")
    roughness_ramp.location = (-200, -100)
    roughness_ramp.color_ramp.elements[0].position = 0.3
    roughness_ramp.color_ramp.elements[0].color = (
        roughness_base - 0.1,
        roughness_base - 0.1,
        roughness_base - 0.1,
        1.0,
    )
    roughness_ramp.color_ramp.elements[1].color = (
        roughness_base + 0.1,
        roughness_base + 0.1,
        roughness_base + 0.1,
        1.0,
    )
    links.new(noise.outputs["Fac"], roughness_ramp.inputs["Fac"])
    links.new(roughness_ramp.outputs["Color"], principled.inputs["Roughness"])

    # Normal from noise
    bump = nodes.new("ShaderNodeBump")
    bump.location = (200, -200)
    bump.inputs["Strength"].default_value = 0.3
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])

    # No metallic for terrain
    principled.inputs["Metallic"].default_value = 0.0


def setup_architecture_nodes(nodes, links, principled, material_id: str, seed: int):
    """Setup architecture materials (brick, concrete, plaster, stone, tiles)."""
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    if "brick" in material_id:
        mapping.inputs["Scale"].default_value = (4.0, 8.0, 1.0)
        base_color = (
            (0.55, 0.25, 0.15, 1.0) if "red" in material_id else (0.45, 0.35, 0.30, 1.0)
        )

        # Brick pattern using math nodes
        brick = nodes.new("ShaderNodeTexBrick")
        brick.location = (-400, 100)
        brick.inputs["Color1"].default_value = base_color
        brick.inputs["Color2"].default_value = (0.6, 0.55, 0.5, 1.0)  # Mortar
        brick.inputs["Scale"].default_value = 3.0
        brick.inputs["Mortar Size"].default_value = 0.02
        brick.inputs["Mortar Smooth"].default_value = 0.1
        brick.inputs["Bias"].default_value = 0.0
        brick.inputs["Brick Width"].default_value = 0.5
        brick.inputs["Row Height"].default_value = 0.25
        links.new(mapping.outputs["Vector"], brick.inputs["Vector"])
        links.new(brick.outputs["Color"], principled.inputs["Base Color"])

        # Roughness
        principled.inputs["Roughness"].default_value = 0.85

        # Normal from brick fac
        bump = nodes.new("ShaderNodeBump")
        bump.location = (200, -200)
        bump.inputs["Strength"].default_value = 0.5
        links.new(brick.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])

    elif "concrete" in material_id:
        mapping.inputs["Scale"].default_value = (2.0, 2.0, 2.0)
        base_color = (
            (0.55, 0.55, 0.52, 1.0)
            if "smooth" in material_id
            else (0.48, 0.48, 0.45, 1.0)
        )

        noise = nodes.new("ShaderNodeTexNoise")
        noise.location = (-400, 100)
        noise.inputs["Scale"].default_value = 30.0
        noise.inputs["Detail"].default_value = 12.0
        noise.inputs["Roughness"].default_value = 0.5
        links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

        color_ramp = nodes.new("ShaderNodeValToRGB")
        color_ramp.location = (-200, 100)
        color_ramp.color_ramp.elements[0].color = base_color
        color_ramp.color_ramp.elements[1].color = (
            base_color[0] - 0.1,
            base_color[1] - 0.1,
            base_color[2] - 0.1,
            1.0,
        )
        links.new(noise.outputs["Fac"], color_ramp.inputs["Fac"])
        links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])

        principled.inputs["Roughness"].default_value = (
            0.9 if "smooth" not in material_id else 0.6
        )

        bump = nodes.new("ShaderNodeBump")
        bump.location = (200, -200)
        bump.inputs["Strength"].default_value = 0.2
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])

    else:
        # Generic stone/plaster
        mapping.inputs["Scale"].default_value = (3.0, 3.0, 3.0)

        noise = nodes.new("ShaderNodeTexNoise")
        noise.location = (-400, 100)
        noise.inputs["Scale"].default_value = 15.0
        noise.inputs["Detail"].default_value = 8.0
        links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

        principled.inputs["Base Color"].default_value = (0.75, 0.72, 0.68, 1.0)
        principled.inputs["Roughness"].default_value = 0.8

        bump = nodes.new("ShaderNodeBump")
        bump.location = (200, -200)
        bump.inputs["Strength"].default_value = 0.15
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])

    principled.inputs["Metallic"].default_value = 0.0


def setup_metal_nodes(nodes, links, principled, material_id: str, seed: int):
    """Setup metal materials (steel, iron, copper, brass)."""
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (10.0, 10.0, 10.0)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    # Determine metal color
    if "steel" in material_id or "brushed" in material_id:
        base_color = (0.7, 0.7, 0.72, 1.0)
        roughness = 0.35
    elif "iron" in material_id or "rust" in material_id:
        base_color = (0.5, 0.35, 0.25, 1.0)
        roughness = 0.7
    elif "copper" in material_id:
        base_color = (0.72, 0.45, 0.20, 1.0)
        roughness = 0.4
    elif "brass" in material_id:
        base_color = (0.78, 0.57, 0.11, 1.0)
        roughness = 0.3
    else:
        base_color = (0.6, 0.6, 0.6, 1.0)
        roughness = 0.4

    # Noise for scratches/wear
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-400, 100)
    noise.inputs["Scale"].default_value = 50.0
    noise.inputs["Detail"].default_value = 10.0
    noise.inputs["Distortion"].default_value = 0.5
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    # Color with subtle variation
    mix = nodes.new("ShaderNodeMixRGB")
    mix.location = (-200, 100)
    mix.blend_type = "OVERLAY"
    mix.inputs["Fac"].default_value = 0.1
    mix.inputs["Color1"].default_value = base_color
    mix.inputs["Color2"].default_value = (0.5, 0.5, 0.5, 1.0)
    links.new(noise.outputs["Color"], mix.inputs["Color2"])
    links.new(mix.outputs["Color"], principled.inputs["Base Color"])

    # Metallic is high
    principled.inputs["Metallic"].default_value = 0.95

    # Roughness variation
    roughness_ramp = nodes.new("ShaderNodeValToRGB")
    roughness_ramp.location = (-200, -100)
    roughness_ramp.color_ramp.elements[0].color = (
        roughness - 0.1,
        roughness - 0.1,
        roughness - 0.1,
        1.0,
    )
    roughness_ramp.color_ramp.elements[1].color = (
        roughness + 0.2,
        roughness + 0.2,
        roughness + 0.2,
        1.0,
    )
    links.new(noise.outputs["Fac"], roughness_ramp.inputs["Fac"])
    links.new(roughness_ramp.outputs["Color"], principled.inputs["Roughness"])

    # Subtle bump
    bump = nodes.new("ShaderNodeBump")
    bump.location = (200, -200)
    bump.inputs["Strength"].default_value = 0.1
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])


def setup_wood_nodes(nodes, links, principled, material_id: str, seed: int):
    """Setup wood materials (oak, pine, walnut, weathered)."""
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (1.0, 4.0, 1.0)  # Stretched for grain
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    # Determine wood color
    if "oak" in material_id:
        base_color = (0.45, 0.30, 0.18, 1.0)
        alt_color = (0.38, 0.25, 0.12, 1.0)
    elif "pine" in material_id:
        base_color = (0.72, 0.55, 0.35, 1.0)
        alt_color = (0.65, 0.48, 0.28, 1.0)
    elif "walnut" in material_id:
        base_color = (0.28, 0.18, 0.10, 1.0)
        alt_color = (0.22, 0.14, 0.08, 1.0)
    elif "weathered" in material_id:
        base_color = (0.50, 0.48, 0.45, 1.0)
        alt_color = (0.42, 0.40, 0.38, 1.0)
    else:
        base_color = (0.5, 0.35, 0.2, 1.0)
        alt_color = (0.42, 0.28, 0.15, 1.0)

    # Wood grain using wave texture
    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-400, 200)
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 3.0
    wave.inputs["Distortion"].default_value = 8.0
    wave.inputs["Detail"].default_value = 3.0
    wave.inputs["Detail Scale"].default_value = 1.0
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])

    # Noise for variation
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-400, 0)
    noise.inputs["Scale"].default_value = 20.0
    noise.inputs["Detail"].default_value = 5.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    # Mix wave and noise
    mix_fac = nodes.new("ShaderNodeMixRGB")
    mix_fac.location = (-200, 100)
    mix_fac.blend_type = "OVERLAY"
    mix_fac.inputs["Fac"].default_value = 0.3
    links.new(wave.outputs["Color"], mix_fac.inputs["Color1"])
    links.new(noise.outputs["Color"], mix_fac.inputs["Color2"])

    # Color ramp
    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.location = (0, 100)
    color_ramp.color_ramp.elements[0].color = base_color
    color_ramp.color_ramp.elements[1].color = alt_color
    links.new(mix_fac.outputs["Color"], color_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])

    # Wood is not metallic
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.7

    # Normal from grain
    bump = nodes.new("ShaderNodeBump")
    bump.location = (200, -200)
    bump.inputs["Strength"].default_value = 0.2
    links.new(wave.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])


def setup_organic_nodes(nodes, links, principled, material_id: str, seed: int):
    """Setup organic materials (bark, moss, leaves)."""
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (3.0, 3.0, 3.0)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    if "bark" in material_id:
        base_color = (0.25, 0.18, 0.12, 1.0)
        alt_color = (0.18, 0.12, 0.08, 1.0)
        roughness = 0.95
    elif "moss" in material_id:
        base_color = (0.15, 0.30, 0.10, 1.0)
        alt_color = (0.10, 0.22, 0.06, 1.0)
        roughness = 0.9
    elif "leaves" in material_id:
        base_color = (
            (0.35, 0.45, 0.15, 1.0)
            if "autumn" not in material_id
            else (0.65, 0.35, 0.12, 1.0)
        )
        alt_color = (
            (0.28, 0.38, 0.10, 1.0)
            if "autumn" not in material_id
            else (0.55, 0.28, 0.08, 1.0)
        )
        roughness = 0.6
    else:
        base_color = (0.3, 0.4, 0.2, 1.0)
        alt_color = (0.25, 0.35, 0.15, 1.0)
        roughness = 0.8

    # Voronoi for organic cell patterns
    voronoi = nodes.new("ShaderNodeTexVoronoi")
    voronoi.location = (-400, 100)
    voronoi.feature = "F1"
    voronoi.inputs["Scale"].default_value = 5.0
    links.new(mapping.outputs["Vector"], voronoi.inputs["Vector"])

    # Noise layer
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-400, -100)
    noise.inputs["Scale"].default_value = 15.0
    noise.inputs["Detail"].default_value = 10.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    # Mix patterns
    mix_fac = nodes.new("ShaderNodeMixRGB")
    mix_fac.location = (-200, 0)
    mix_fac.inputs["Fac"].default_value = 0.5
    links.new(voronoi.outputs["Distance"], mix_fac.inputs["Color1"])
    links.new(noise.outputs["Fac"], mix_fac.inputs["Color2"])

    # Color
    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.location = (0, 100)
    color_ramp.color_ramp.elements[0].color = base_color
    color_ramp.color_ramp.elements[1].color = alt_color
    links.new(mix_fac.outputs["Color"], color_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])

    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = roughness

    # Strong bump
    bump = nodes.new("ShaderNodeBump")
    bump.location = (200, -200)
    bump.inputs["Strength"].default_value = 0.4
    links.new(mix_fac.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])


def setup_fabric_nodes(nodes, links, principled, material_id: str, seed: int):
    """Setup fabric materials (leather, canvas, linen, denim)."""
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (5.0, 5.0, 5.0)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    if "leather" in material_id:
        base_color = (0.35, 0.22, 0.12, 1.0)
        roughness = 0.6
        use_weave = False
    elif "canvas" in material_id:
        base_color = (0.65, 0.60, 0.50, 1.0)
        roughness = 0.85
        use_weave = True
    elif "linen" in material_id:
        base_color = (0.85, 0.82, 0.78, 1.0)
        roughness = 0.75
        use_weave = True
    elif "denim" in material_id:
        base_color = (0.15, 0.22, 0.40, 1.0)
        roughness = 0.7
        use_weave = True
    else:
        base_color = (0.5, 0.5, 0.5, 1.0)
        roughness = 0.8
        use_weave = False

    if use_weave:
        # Create weave pattern
        checker = nodes.new("ShaderNodeTexChecker")
        checker.location = (-400, 100)
        checker.inputs["Scale"].default_value = 50.0
        links.new(mapping.outputs["Vector"], checker.inputs["Vector"])

        noise = nodes.new("ShaderNodeTexNoise")
        noise.location = (-400, -100)
        noise.inputs["Scale"].default_value = 100.0
        noise.inputs["Detail"].default_value = 5.0
        links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

        mix = nodes.new("ShaderNodeMixRGB")
        mix.location = (-200, 0)
        mix.inputs["Fac"].default_value = 0.2
        mix.inputs["Color1"].default_value = base_color
        links.new(checker.outputs["Fac"], mix.inputs["Color2"])
        links.new(mix.outputs["Color"], principled.inputs["Base Color"])

        bump = nodes.new("ShaderNodeBump")
        bump.location = (200, -200)
        bump.inputs["Strength"].default_value = 0.15
        links.new(checker.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    else:
        # Leather - noise only
        noise = nodes.new("ShaderNodeTexNoise")
        noise.location = (-400, 100)
        noise.inputs["Scale"].default_value = 25.0
        noise.inputs["Detail"].default_value = 8.0
        links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

        color_ramp = nodes.new("ShaderNodeValToRGB")
        color_ramp.location = (-200, 100)
        color_ramp.color_ramp.elements[0].color = base_color
        color_ramp.color_ramp.elements[1].color = (
            base_color[0] * 0.8,
            base_color[1] * 0.8,
            base_color[2] * 0.8,
            1.0,
        )
        links.new(noise.outputs["Fac"], color_ramp.inputs["Fac"])
        links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])

        bump = nodes.new("ShaderNodeBump")
        bump.location = (200, -200)
        bump.inputs["Strength"].default_value = 0.25
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])

    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = roughness


def bake_map(obj, mat, map_type: str, resolution: int, output_path: Path) -> Path:
    """Bake a single PBR map to an image file."""
    # Create image for baking
    img_name = f"{map_type}_bake"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])

    img = bpy.data.images.new(
        name=img_name,
        width=resolution,
        height=resolution,
        alpha=False,
        float_buffer=map_type == "normal",
    )

    # Create image texture node for baking target
    nodes = mat.node_tree.nodes
    img_node = nodes.new("ShaderNodeTexImage")
    img_node.image = img
    img_node.location = (900, 0)

    # Select the image node (required for baking)
    for node in nodes:
        node.select = False
    img_node.select = True
    nodes.active = img_node

    # Configure bake settings
    scene = bpy.context.scene
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 4

    if map_type == "basecolor":
        scene.cycles.bake_type = "DIFFUSE"
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
    elif map_type == "normal":
        scene.cycles.bake_type = "NORMAL"
    elif map_type == "roughness":
        scene.cycles.bake_type = "ROUGHNESS"
    elif map_type == "metalness":
        scene.cycles.bake_type = "EMIT"  # Hack: we'll setup emit to show metallic
        # Temporarily connect metallic to emission
        links = mat.node_tree.links
        principled = None
        for node in nodes:
            if node.type == "BSDF_PRINCIPLED":
                principled = node
                break
        if principled:
            output = None
            for node in nodes:
                if node.type == "OUTPUT_MATERIAL":
                    output = node
                    break
            # Save metallic value
            metallic_val = principled.inputs["Metallic"].default_value
            emit_node = nodes.new("ShaderNodeEmission")
            emit_node.location = (600, -300)
            emit_node.inputs["Color"].default_value = (
                metallic_val,
                metallic_val,
                metallic_val,
                1.0,
            )
            # Connect to output
            if output:
                # Temporarily replace connection
                for link in list(links):
                    if link.to_node == output:
                        links.remove(link)
                links.new(emit_node.outputs["Emission"], output.inputs["Surface"])
    elif map_type == "height":
        scene.cycles.bake_type = "EMIT"  # Use displacement as emit
    else:
        scene.cycles.bake_type = "COMBINED"

    # Perform bake
    try:
        bpy.ops.object.bake(type=scene.cycles.bake_type)
    except Exception as e:
        print(f"Bake error for {map_type}: {e}")
        return None

    # Save image
    output_file = output_path / f"{map_type}.png"
    img.filepath_raw = str(output_file)
    img.file_format = "PNG"
    img.save()

    # Cleanup
    nodes.remove(img_node)
    bpy.data.images.remove(img)

    # Restore metallic node connections if we modified them
    if map_type == "metalness":
        for node in list(nodes):
            if node.type == "EMISSION" and node.location[1] == -300:
                nodes.remove(node)
        # Reconnect principled
        for node in nodes:
            if node.type == "BSDF_PRINCIPLED":
                for out_node in nodes:
                    if out_node.type == "OUTPUT_MATERIAL":
                        mat.node_tree.links.new(
                            node.outputs["BSDF"], out_node.inputs["Surface"]
                        )
                break

    return output_file


def generate_pbr_maps(obj, mat, resolution: int, output_dir: Path) -> dict[str, Path]:
    """Generate all PBR maps for a material."""
    output_dir.mkdir(parents=True, exist_ok=True)

    maps = {}

    # Bake each map type
    for map_type in ["basecolor", "normal", "roughness"]:
        print(f"  Baking {map_type}...")
        path = bake_map(obj, mat, map_type, resolution, output_dir)
        if path and path.exists():
            maps[map_type] = path

    # For metalness, create a simple grayscale image based on material metallic value
    # (Baking metalness is complex, use a simpler approach)
    nodes = mat.node_tree.nodes
    metallic_val = 0.0
    for node in nodes:
        if node.type == "BSDF_PRINCIPLED":
            metallic_val = node.inputs["Metallic"].default_value
            break

    # Create metalness image
    metalness_path = output_dir / "metalness.png"
    metalness_img = bpy.data.images.new(
        name="metalness_gen", width=resolution, height=resolution, alpha=False
    )
    # Fill with metallic value
    pixels = [metallic_val] * (resolution * resolution * 4)
    for i in range(0, len(pixels), 4):
        pixels[i] = metallic_val
        pixels[i + 1] = metallic_val
        pixels[i + 2] = metallic_val
        pixels[i + 3] = 1.0
    metalness_img.pixels = pixels
    metalness_img.filepath_raw = str(metalness_path)
    metalness_img.file_format = "PNG"
    metalness_img.save()
    bpy.data.images.remove(metalness_img)
    maps["metalness"] = metalness_path

    return maps


def main():
    if not IN_BLENDER:
        print("This script must be run inside Blender")
        sys.exit(1)

    args = parse_args()

    print("\nProcedural Material Generator")
    print("==============================")
    print(f"Material: {args.material_id}")
    print(f"Category: {args.category}")
    print(f"Resolution: {args.resolution}")
    print(f"Seed: {args.seed}")
    print(f"Output: {args.output}")
    print()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Setup scene
    print("Setting up scene...")
    plane = setup_scene()

    # Create material
    print("Creating procedural material...")
    mat = create_material_nodes(args.category, args.material_id, args.seed)

    # Assign to plane
    if plane.data.materials:
        plane.data.materials[0] = mat
    else:
        plane.data.materials.append(mat)

    # Generate PBR maps
    print("Generating PBR maps...")
    maps = generate_pbr_maps(plane, mat, args.resolution, output_dir)

    # Write results
    result = {
        "material_id": args.material_id,
        "category": args.category,
        "resolution": args.resolution,
        "seed": args.seed,
        "maps": {k: str(v) for k, v in maps.items()},
        "success": len(maps) >= 3,
    }

    if args.result_file:
        result_path = Path(args.result_file)
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2)
        print(f"\nResults written to: {result_path}")

    print(f"\nGenerated {len(maps)} maps:")
    for map_type, path in maps.items():
        print(f"  - {map_type}: {path}")

    print("\nDone!")


if __name__ == "__main__":
    main()
