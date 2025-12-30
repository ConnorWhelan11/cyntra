#!/usr/bin/env python3
"""
Blender script to render unit meshes as 8-direction sprite sheets.
Run with: blender -b -P render_unit_sprites.py -- <input_dir> <output_dir>
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
    """Create orthographic camera for unit sprites."""
    bpy.ops.object.camera_add(location=(0, -3, 1.5))
    camera = bpy.context.object
    camera.name = "UnitCamera"
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.2

    # Slightly elevated angle for unit readability
    camera.rotation_euler = (math.radians(70), 0, 0)

    bpy.context.scene.camera = camera
    return camera


def setup_lighting():
    """Set up lighting for unit rendering with rim light."""
    # Key light
    bpy.ops.object.light_add(type='SUN', location=(5, -5, 10))
    key = bpy.context.object
    key.name = "KeyLight"
    key.data.energy = 2.5
    key.data.color = (1.0, 0.98, 0.95)
    key.rotation_euler = (math.radians(50), math.radians(20), 0)

    # Rim light for silhouette clarity
    bpy.ops.object.light_add(type='SPOT', location=(-3, 3, 4))
    rim = bpy.context.object
    rim.name = "RimLight"
    rim.data.energy = 200.0
    rim.data.spot_size = math.radians(60)
    rim.data.color = (0.9, 0.95, 1.0)
    rim.rotation_euler = (math.radians(45), 0, math.radians(-135))

    # Soft fill
    bpy.ops.object.light_add(type='AREA', location=(3, 3, 3))
    fill = bpy.context.object
    fill.name = "FillLight"
    fill.data.energy = 30.0
    fill.data.size = 5.0

    return key, rim, fill


def setup_render_settings(resolution=(64, 64)):
    """Configure render settings for unit sprites."""
    scene = bpy.context.scene

    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True

    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100

    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    scene.cycles.seed = 1337


def import_mesh(filepath):
    """Import a GLB/GLTF mesh."""
    bpy.ops.import_scene.gltf(filepath=str(filepath))
    imported = bpy.context.selected_objects
    if imported:
        return imported[0]
    return None


def normalize_unit_mesh(mesh_obj):
    """Normalize unit mesh to standard size and position."""
    # Get bounding box
    bbox = [mesh_obj.matrix_world @ Vector(corner) for corner in mesh_obj.bound_box]
    min_z = min(v.z for v in bbox)
    max_z = max(v.z for v in bbox)
    height = max_z - min_z

    # Scale to ~1.8m height (human scale)
    if height > 0:
        scale_factor = 1.8 / height
        mesh_obj.scale = (scale_factor, scale_factor, scale_factor)

    # Apply scale
    bpy.ops.object.transform_apply(scale=True)

    # Center horizontally, feet at ground
    mesh_obj.location = (0, 0, -min_z * scale_factor if height > 0 else 0)


def render_8_directions(mesh_obj, output_dir, base_name, animation_frame=0):
    """Render unit from 8 compass directions."""
    directions = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']
    rendered_files = []

    for i, direction in enumerate(directions):
        # Rotate unit (camera is fixed, unit rotates)
        mesh_obj.rotation_euler.z = math.radians(i * 45)
        bpy.context.view_layer.update()

        # Output path
        output_name = f"{base_name}_f{animation_frame:02d}_{direction}.png"
        output_path = output_dir / output_name
        bpy.context.scene.render.filepath = str(output_path)

        # Render
        bpy.ops.render.render(write_still=True)
        rendered_files.append(output_path)

        print(f"Rendered: {output_name}")

    return rendered_files


def create_spritesheet(sprites, output_path, sprite_size=(64, 64), cols=8, rows=9):
    """Combine individual sprites into a sprite sheet."""
    from PIL import Image

    sheet_width = cols * sprite_size[0]
    sheet_height = rows * sprite_size[1]
    sheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))

    for i, sprite_path in enumerate(sprites):
        if i >= cols * rows:
            break

        col = i % cols
        row = i // cols
        x = col * sprite_size[0]
        y = row * sprite_size[1]

        sprite = Image.open(sprite_path)
        sprite = sprite.resize(sprite_size, Image.Resampling.LANCZOS)
        sheet.paste(sprite, (x, y))

    sheet.save(output_path)
    return output_path


def process_unit(input_path, output_dir, animations=['idle']):
    """Process a single unit mesh into sprite sheet."""
    from mathutils import Vector

    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    base_name = input_path.stem

    # Clear and setup scene
    clear_scene()
    setup_camera()
    setup_lighting()
    setup_render_settings((64, 64))

    # Import mesh
    mesh = import_mesh(input_path)
    if not mesh:
        print(f"Failed to import: {input_path}")
        return None

    # Normalize
    normalize_unit_mesh(mesh)

    # Render all directions for each animation frame
    all_sprites = []

    for anim_idx, anim in enumerate(animations):
        # For now, use same pose (would apply animation if rigged)
        for frame in range(3):  # 3 frames per animation
            frame_num = anim_idx * 3 + frame
            sprites = render_8_directions(mesh, output_dir / "sprites", base_name, frame_num)
            all_sprites.extend(sprites)

    # Create sprite sheet
    sheet_path = output_dir / f"{base_name}_sheet.png"
    create_spritesheet(all_sprites, sheet_path)

    return sheet_path


def batch_process(input_dir, output_dir):
    """Process all unit meshes in a directory."""
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)

    mesh_files = list(input_dir.glob("unit_*.glb")) + list(input_dir.glob("unit_*.gltf"))

    sheets = []
    for mesh_file in mesh_files:
        print(f"\nProcessing: {mesh_file.name}")
        sheet = process_unit(mesh_file, output_dir / mesh_file.stem, ['idle', 'walk', 'attack'])
        if sheet:
            sheets.append(sheet)

    print(f"\nTotal sprite sheets: {len(sheets)}")
    return sheets


if __name__ == "__main__":
    # Need mathutils for Vector
    from mathutils import Vector

    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    if len(argv) < 2:
        print("Usage: blender -b -P render_unit_sprites.py -- <input_dir> <output_dir>")
        sys.exit(1)

    batch_process(argv[0], argv[1])
