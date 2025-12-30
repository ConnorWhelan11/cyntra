#!/usr/bin/env python3
"""
Blender script to render hex terrain tiles as isometric sprites.
Run with: blender -b -P render_hex_sprites.py -- <input_dir> <output_dir>
"""

import bpy
import os
import sys
import math
from pathlib import Path


def clear_scene():
    """Remove all objects from scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()


def setup_camera():
    """Create orthographic camera at isometric angle."""
    bpy.ops.object.camera_add(location=(5, -5, 5))
    camera = bpy.context.object
    camera.name = "IsometricCamera"
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.0

    # Standard isometric angle (arctan(1/sqrt(2)) ≈ 35.264°, but we use 54.736° from horizontal)
    camera.rotation_euler = (math.radians(54.736), 0, math.radians(45))

    bpy.context.scene.camera = camera
    return camera


def setup_lighting(mode='day'):
    """Set up lighting for terrain rendering."""
    # Key light (sun)
    bpy.ops.object.light_add(type='SUN', location=(10, -10, 20))
    sun = bpy.context.object
    sun.name = "KeyLight"

    if mode == 'day':
        sun.data.energy = 3.0
        sun.data.color = (1.0, 0.98, 0.95)  # Slight warm
    elif mode == 'dusk':
        sun.data.energy = 2.0
        sun.data.color = (1.0, 0.8, 0.6)  # Golden hour

    sun.rotation_euler = (math.radians(45), math.radians(15), 0)

    # Fill light
    bpy.ops.object.light_add(type='AREA', location=(-5, 5, 8))
    fill = bpy.context.object
    fill.name = "FillLight"
    fill.data.energy = 50.0
    fill.data.size = 10.0
    fill.data.color = (0.9, 0.95, 1.0)  # Slight cool

    return sun, fill


def setup_render_settings(resolution=(256, 256)):
    """Configure render settings for sprite output."""
    scene = bpy.context.scene

    # Cycles for quality
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU' if bpy.context.preferences.addons.get('cycles') else 'CPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True

    # Resolution
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100

    # Transparent background
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    # Deterministic seed
    scene.cycles.seed = 1337


def import_mesh(filepath):
    """Import a GLB/GLTF mesh."""
    bpy.ops.import_scene.gltf(filepath=str(filepath))
    imported = bpy.context.selected_objects
    if imported:
        return imported[0]
    return None


def render_rotations(mesh_obj, output_dir, base_name, rotations=8, lighting_modes=['day']):
    """Render mesh from multiple rotation angles with different lighting."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    rendered_files = []

    for light_mode in lighting_modes:
        # Update lighting
        for obj in bpy.context.scene.objects:
            if obj.type == 'LIGHT':
                bpy.data.objects.remove(obj, do_unlink=True)
        setup_lighting(light_mode)

        for i in range(rotations):
            angle = (360 / rotations) * i
            mesh_obj.rotation_euler.z = math.radians(angle)

            # Update scene
            bpy.context.view_layer.update()

            # Output path
            output_name = f"{base_name}_{light_mode}_rot{i:02d}.png"
            output_path = output_dir / output_name
            bpy.context.scene.render.filepath = str(output_path)

            # Render
            bpy.ops.render.render(write_still=True)
            rendered_files.append(output_path)

            print(f"Rendered: {output_name}")

    return rendered_files


def process_mesh_file(input_path, output_dir, rotations=8, lighting_modes=['day']):
    """Process a single mesh file."""
    input_path = Path(input_path)
    base_name = input_path.stem

    # Clear and setup scene
    clear_scene()
    setup_camera()
    setup_render_settings((256, 256))

    # Import mesh
    mesh = import_mesh(input_path)
    if not mesh:
        print(f"Failed to import: {input_path}")
        return []

    # Center and normalize
    mesh.location = (0, 0, 0)

    # Render all variants
    return render_rotations(mesh, output_dir, base_name, rotations, lighting_modes)


def batch_process(input_dir, output_dir, rotations=8, lighting_modes=['day', 'dusk']):
    """Process all mesh files in a directory."""
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)

    mesh_files = list(input_dir.glob("*.glb")) + list(input_dir.glob("*.gltf"))

    all_rendered = []
    for mesh_file in mesh_files:
        print(f"\nProcessing: {mesh_file.name}")
        rendered = process_mesh_file(mesh_file, output_dir, rotations, lighting_modes)
        all_rendered.extend(rendered)

    print(f"\nTotal rendered: {len(all_rendered)} sprites")
    return all_rendered


if __name__ == "__main__":
    # Get arguments after --
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    if len(argv) < 2:
        print("Usage: blender -b -P render_hex_sprites.py -- <input_dir> <output_dir> [rotations] [lighting]")
        sys.exit(1)

    input_dir = argv[0]
    output_dir = argv[1]
    rotations = int(argv[2]) if len(argv) > 2 else 8
    lighting = argv[3].split(',') if len(argv) > 3 else ['day', 'dusk']

    batch_process(input_dir, output_dir, rotations, lighting)
