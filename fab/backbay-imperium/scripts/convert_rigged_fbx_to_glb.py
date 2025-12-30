#!/usr/bin/env python3
"""
Batch convert Mixamo-rigged FBX files to GLB for Godot.

For each unit:
1. Import the _rigged.fbx (mesh + skeleton + T-pose)
2. Import _idle.fbx and _walk.fbx animations
3. Merge all animations
4. Export as single GLB file

Usage:
    blender --background --python convert_rigged_fbx_to_glb.py
"""

import bpy
import os
from pathlib import Path

# Paths
RIGGED_DIR = Path("/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/units/rigged")
OUTPUT_DIR = Path("/Users/connor/Medica/glia-fab/research/backbay-imperium/client/assets/units/models")

def clear_scene():
    """Clear all objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Clear orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.armatures:
        if block.users == 0:
            bpy.data.armatures.remove(block)
    for block in bpy.data.actions:
        if block.users == 0:
            bpy.data.actions.remove(block)

def import_fbx(filepath: Path):
    """Import FBX file."""
    bpy.ops.import_scene.fbx(
        filepath=str(filepath),
        use_anim=True,
        ignore_leaf_bones=True,
        automatic_bone_orientation=True
    )

def get_armature():
    """Get the armature object in the scene."""
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None

def rename_action(action, new_name: str):
    """Rename an action."""
    if action:
        action.name = new_name

def export_glb(filepath: Path):
    """Export scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format='GLB',
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_nla_strips=False,
        export_current_frame=False,
        use_selection=False,
        export_apply=True  # Apply modifiers
    )

def convert_unit(unit_name: str):
    """Convert a single unit's FBX files to GLB."""
    unit_dir = RIGGED_DIR / unit_name

    if not unit_dir.exists():
        print(f"[SKIP] Unit directory not found: {unit_dir}")
        return False

    rigged_fbx = unit_dir / f"{unit_name}_rigged.fbx"
    idle_fbx = unit_dir / f"{unit_name}_idle.fbx"
    walk_fbx = unit_dir / f"{unit_name}_walk.fbx"

    if not rigged_fbx.exists():
        print(f"[SKIP] Rigged FBX not found: {rigged_fbx}")
        return False

    print(f"[CONVERT] {unit_name}")

    # Clear scene
    clear_scene()

    # Import rigged model (mesh + skeleton)
    import_fbx(rigged_fbx)
    armature = get_armature()

    if not armature:
        print(f"[ERROR] No armature found in {rigged_fbx}")
        return False

    # Rename any existing action to "tpose" or similar
    if armature.animation_data and armature.animation_data.action:
        rename_action(armature.animation_data.action, "tpose")

    # Store imported actions
    actions = {}

    # Import idle animation
    if idle_fbx.exists():
        # Clear existing animation
        if armature.animation_data:
            armature.animation_data.action = None

        # Import idle
        bpy.ops.import_scene.fbx(
            filepath=str(idle_fbx),
            use_anim=True,
            ignore_leaf_bones=True,
            automatic_bone_orientation=True
        )

        # Find and rename the new action
        for action in bpy.data.actions:
            if action.name not in ["tpose"] and "idle" not in action.name.lower():
                rename_action(action, "idle")
                actions["idle"] = action
                break

    # Import walk animation
    if walk_fbx.exists():
        if armature.animation_data:
            armature.animation_data.action = None

        bpy.ops.import_scene.fbx(
            filepath=str(walk_fbx),
            use_anim=True,
            ignore_leaf_bones=True,
            automatic_bone_orientation=True
        )

        for action in bpy.data.actions:
            if action.name not in ["tpose", "idle"] and "walk" not in action.name.lower():
                rename_action(action, "walk")
                actions["walk"] = action
                break

    # Clean up duplicate armatures/meshes from animation imports
    # Keep only the original armature and its children
    objects_to_delete = []
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE' and obj != armature:
            objects_to_delete.append(obj)
        elif obj.type == 'MESH' and obj.parent != armature:
            # Check if it's a duplicate
            if any(c.type == 'MESH' for c in armature.children):
                objects_to_delete.append(obj)

    for obj in objects_to_delete:
        bpy.data.objects.remove(obj, do_unlink=True)

    # Set idle as the active action for export
    if "idle" in actions and armature.animation_data:
        armature.animation_data.action = actions["idle"]

    # Output filename (remove unit_ prefix for cleaner names)
    output_name = unit_name.replace("unit_", "") + ".glb"
    output_path = OUTPUT_DIR / output_name

    # Export as GLB
    export_glb(output_path)

    print(f"[OK] Exported: {output_path}")
    return True

def main():
    """Main conversion function."""
    print("=" * 60)
    print("Batch FBX to GLB Converter for Backbay Imperium Units")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find all unit directories
    unit_dirs = [d for d in RIGGED_DIR.iterdir() if d.is_dir() and d.name.startswith("unit_")]

    print(f"Found {len(unit_dirs)} unit directories")
    print()

    converted = 0
    failed = 0

    for unit_dir in sorted(unit_dirs):
        unit_name = unit_dir.name
        try:
            if convert_unit(unit_name):
                converted += 1
            else:
                failed += 1
        except Exception as e:
            print(f"[ERROR] {unit_name}: {e}")
            failed += 1

    print()
    print("=" * 60)
    print(f"Conversion complete: {converted} success, {failed} failed")
    print("=" * 60)

if __name__ == "__main__":
    main()
