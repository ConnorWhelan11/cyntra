#!/usr/bin/env python3
"""
Convert Mixamo-rigged FBX files to GLB for Godot.

This script:
1. Imports the base rigged FBX
2. Imports animation FBX files and extracts animations
3. Combines everything into a single GLB with named animation tracks

Usage:
    blender --background --python convert_fbx_to_glb.py -- --unit warrior
    blender --background --python convert_fbx_to_glb.py -- --all
"""

import bpy
import sys
import os
from pathlib import Path

# Get script arguments after "--"
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

# Paths
SCRIPT_DIR = Path(__file__).parent
RIGGED_DIR = SCRIPT_DIR.parent / "assets" / "units" / "rigged"
OUTPUT_DIR = Path("/Users/connor/Medica/glia-fab/research/backbay-imperium/client/assets/units/models")


def clear_scene():
    """Remove all objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

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


def import_fbx(filepath: Path) -> list:
    """Import FBX and return imported objects."""
    bpy.ops.import_scene.fbx(
        filepath=str(filepath),
        use_anim=True,
        ignore_leaf_bones=True,
        automatic_bone_orientation=True,
    )
    return list(bpy.context.selected_objects)


def get_armature():
    """Find the armature in the scene."""
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None


def rename_action(action, new_name: str):
    """Rename an action."""
    if action:
        action.name = new_name


def convert_unit(unit_name: str):
    """Convert a single unit's FBX files to GLB."""
    unit_dir = RIGGED_DIR / unit_name

    if not unit_dir.exists():
        print(f"Unit directory not found: {unit_dir}")
        return False

    rigged_fbx = unit_dir / f"{unit_name}_rigged.fbx"
    idle_fbx = unit_dir / f"{unit_name}_idle.fbx"
    walk_fbx = unit_dir / f"{unit_name}_walk.fbx"

    if not rigged_fbx.exists():
        print(f"Rigged FBX not found: {rigged_fbx}")
        return False

    print(f"\n{'='*50}")
    print(f"Converting: {unit_name}")
    print('='*50)

    # Clear scene
    clear_scene()

    # Import base rigged model
    print(f"  Importing rigged model...")
    import_fbx(rigged_fbx)

    armature = get_armature()
    if not armature:
        print(f"  ERROR: No armature found in rigged FBX")
        return False

    # Store the base mesh objects
    base_objects = list(bpy.data.objects)

    # Rename the default action to "idle" if it exists (T-pose or default)
    if armature.animation_data and armature.animation_data.action:
        rename_action(armature.animation_data.action, "tpose")

    # Import idle animation
    if idle_fbx.exists():
        print(f"  Importing idle animation...")
        # Clear selection
        bpy.ops.object.select_all(action='DESELECT')

        # Import idle FBX
        import_fbx(idle_fbx)

        # Find the newly imported armature's action
        for obj in bpy.data.objects:
            if obj.type == 'ARMATURE' and obj not in base_objects:
                if obj.animation_data and obj.animation_data.action:
                    # Copy action to our main armature
                    idle_action = obj.animation_data.action.copy()
                    idle_action.name = "idle"

                    # Assign to main armature
                    if not armature.animation_data:
                        armature.animation_data_create()

                    # Store in NLA or just keep as action
                    print(f"    Created action: {idle_action.name}")

                # Delete the temporary armature
                bpy.data.objects.remove(obj)

    # Import walk animation
    if walk_fbx.exists():
        print(f"  Importing walk animation...")
        bpy.ops.object.select_all(action='DESELECT')

        import_fbx(walk_fbx)

        for obj in bpy.data.objects:
            if obj.type == 'ARMATURE' and obj not in base_objects and obj != armature:
                if obj.animation_data and obj.animation_data.action:
                    walk_action = obj.animation_data.action.copy()
                    walk_action.name = "walk"
                    print(f"    Created action: {walk_action.name}")

                bpy.data.objects.remove(obj)

    # Clean up any extra meshes from animation imports
    for obj in list(bpy.data.objects):
        if obj not in base_objects and obj.type == 'MESH':
            bpy.data.objects.remove(obj)

    # Select all objects for export
    bpy.ops.object.select_all(action='SELECT')

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Export as GLB
    # Extract just the unit type name (e.g., "warrior" from "unit_warrior")
    short_name = unit_name.replace("unit_", "")
    output_path = OUTPUT_DIR / f"{short_name}.glb"

    print(f"  Exporting to: {output_path}")

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format='GLB',
        export_animations=True,
        export_animation_mode='ACTIONS',  # Export all actions
        export_nla_strips=False,
        export_apply=False,  # Don't apply modifiers (keep armature)
        export_skins=True,  # Export skeletal animation
        export_all_influences=False,
        export_yup=True,  # Y-up for Godot
    )

    # Verify output
    if output_path.exists():
        size_kb = output_path.stat().st_size / 1024
        print(f"  SUCCESS: {output_path.name} ({size_kb:.1f} KB)")
        return True
    else:
        print(f"  FAILED: Output not created")
        return False


def get_all_units():
    """Get list of all unit directories."""
    units = []
    for d in RIGGED_DIR.iterdir():
        if d.is_dir() and d.name.startswith("unit_"):
            units.append(d.name)
    return sorted(units)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--unit", type=str, help="Convert single unit (e.g., 'warrior' or 'unit_warrior')")
    parser.add_argument("--all", action="store_true", help="Convert all units")
    args = parser.parse_args(argv)

    if args.all:
        units = get_all_units()
        print(f"Converting {len(units)} units...")

        success = 0
        failed = 0
        for unit_name in units:
            if convert_unit(unit_name):
                success += 1
            else:
                failed += 1

        print(f"\n{'='*50}")
        print(f"COMPLETE: {success} succeeded, {failed} failed")
        print('='*50)

    elif args.unit:
        unit_name = args.unit
        if not unit_name.startswith("unit_"):
            unit_name = f"unit_{unit_name}"
        convert_unit(unit_name)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
