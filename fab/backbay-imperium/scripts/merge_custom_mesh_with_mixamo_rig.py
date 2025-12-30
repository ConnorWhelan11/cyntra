#!/usr/bin/env python3
"""
Merge custom Hunyuan3D meshes with Mixamo skeletons/animations.

The problem: Mixamo auto-rigging replaces our custom mesh with their mannequin.
The solution:
1. Import Mixamo FBX to get skeleton + animations
2. Delete the Mixamo mannequin mesh
3. Import original Hunyuan3D GLB mesh
4. Parent custom mesh to Mixamo skeleton with automatic weights
5. Export as GLB

Usage:
    blender --background --python merge_custom_mesh_with_mixamo_rig.py
"""

import bpy
import os
from pathlib import Path

# Paths
CUSTOM_MESH_DIR = Path("/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/units/meshes")
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
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)

def get_armature():
    """Get the armature object."""
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None

def get_mesh_objects():
    """Get all mesh objects."""
    return [obj for obj in bpy.data.objects if obj.type == 'MESH']

def delete_mesh_objects():
    """Delete all mesh objects (Mixamo mannequin)."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.select_set(True)
    bpy.ops.object.delete()

def import_fbx(filepath: Path):
    """Import FBX file."""
    bpy.ops.import_scene.fbx(
        filepath=str(filepath),
        use_anim=True,
        ignore_leaf_bones=True,
        automatic_bone_orientation=True
    )

def import_glb(filepath: Path):
    """Import GLB file."""
    bpy.ops.import_scene.gltf(filepath=str(filepath))

def create_unit_material(unit_name: str):
    """Create a basic material for a unit."""
    mat = bpy.data.materials.new(name=f"{unit_name}_material")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    principled = nodes.get('Principled BSDF')
    if principled:
        # Set a base color based on unit type - earthy tones for warriors
        if 'settler' in unit_name or 'worker' in unit_name:
            principled.inputs['Base Color'].default_value = (0.4, 0.3, 0.2, 1.0)  # Brown
        elif 'missionary' in unit_name:
            principled.inputs['Base Color'].default_value = (0.8, 0.8, 0.7, 1.0)  # Off-white
        elif 'archer' in unit_name or 'crossbow' in unit_name or 'longbow' in unit_name:
            principled.inputs['Base Color'].default_value = (0.3, 0.4, 0.2, 1.0)  # Forest green
        else:
            principled.inputs['Base Color'].default_value = (0.5, 0.4, 0.35, 1.0)  # Tan/leather
        principled.inputs['Metallic'].default_value = 0.1
        principled.inputs['Roughness'].default_value = 0.7
    return mat


def apply_material_to_mesh(mesh_obj, material):
    """Apply material to a mesh object."""
    if mesh_obj.data.materials:
        mesh_obj.data.materials[0] = material
    else:
        mesh_obj.data.materials.append(material)


def parent_mesh_to_armature(mesh_obj, armature_obj):
    """Parent mesh to armature with automatic weights."""
    # Ensure we're in object mode
    bpy.ops.object.mode_set(mode='OBJECT')

    # Deselect all
    bpy.ops.object.select_all(action='DESELECT')

    # Select mesh first, then armature
    mesh_obj.select_set(True)
    armature_obj.select_set(True)
    bpy.context.view_layer.objects.active = armature_obj

    # Parent with automatic weights
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        print(f"  Successfully parented {mesh_obj.name} to {armature_obj.name}")
        # Verify skinning worked
        if mesh_obj.modifiers and any(m.type == 'ARMATURE' for m in mesh_obj.modifiers):
            print(f"    Armature modifier applied successfully")
        return True
    except Exception as e:
        print(f"  Warning: Auto-weight failed for {mesh_obj.name}: {e}")
        # Try without weights as fallback
        try:
            bpy.ops.object.parent_set(type='ARMATURE')
            print(f"  Fallback: Parented without weights")
            return True
        except:
            return False

def export_glb(filepath: Path):
    """Export scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format='GLB',
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_nla_strips=False,
        use_selection=False,
        export_apply=False,  # Don't apply modifiers - keep armature skinning
        export_skins=True,   # Export skeleton/skin data
    )

def convert_unit(unit_name: str):
    """Convert a single unit by merging custom mesh with Mixamo rig."""

    # File paths
    custom_mesh_path = CUSTOM_MESH_DIR / f"{unit_name}.glb"
    rigged_dir = RIGGED_DIR / unit_name
    rigged_fbx = rigged_dir / f"{unit_name}_rigged.fbx"
    idle_fbx = rigged_dir / f"{unit_name}_idle.fbx"
    walk_fbx = rigged_dir / f"{unit_name}_walk.fbx"

    # Check if custom mesh exists
    if not custom_mesh_path.exists():
        print(f"[SKIP] Custom mesh not found: {custom_mesh_path}")
        return False

    # Check if rigged FBX exists
    if not rigged_fbx.exists():
        print(f"[SKIP] Rigged FBX not found: {rigged_fbx}")
        return False

    print(f"[CONVERT] {unit_name}")

    # Clear scene
    clear_scene()

    # Step 1: Import Mixamo rigged FBX to get skeleton
    print(f"  Importing skeleton from {rigged_fbx.name}...")
    import_fbx(rigged_fbx)

    armature = get_armature()
    if not armature:
        print(f"  [ERROR] No armature found!")
        return False

    # Store the armature name
    armature_name = armature.name

    # Step 2: Delete Mixamo mannequin meshes
    print(f"  Deleting Mixamo mannequin...")
    delete_mesh_objects()

    # Step 3: Import custom Hunyuan3D mesh
    print(f"  Importing custom mesh from {custom_mesh_path.name}...")
    import_glb(custom_mesh_path)

    # Get the imported mesh(es)
    custom_meshes = get_mesh_objects()
    if not custom_meshes:
        print(f"  [ERROR] No meshes found in custom GLB!")
        return False

    # Re-get armature (in case import changed something)
    armature = bpy.data.objects.get(armature_name)
    if not armature:
        armature = get_armature()

    if not armature:
        print(f"  [ERROR] Lost armature!")
        return False

    # Step 4: Apply material to custom mesh(es)
    print(f"  Applying material to meshes...")
    material = create_unit_material(unit_name)
    for mesh in custom_meshes:
        apply_material_to_mesh(mesh, material)

    # Step 5: Parent custom mesh to skeleton
    print(f"  Parenting {len(custom_meshes)} mesh(es) to skeleton...")
    for mesh in custom_meshes:
        parent_mesh_to_armature(mesh, armature)

    # Step 6: Import animations
    actions_imported = []

    if idle_fbx.exists():
        print(f"  Importing idle animation...")
        import_fbx(idle_fbx)
        # Find new action
        for action in bpy.data.actions:
            if action not in actions_imported and "Layer0" in action.name:
                action.name = "idle"
                actions_imported.append(action)
                break

    if walk_fbx.exists():
        print(f"  Importing walk animation...")
        import_fbx(walk_fbx)
        for action in bpy.data.actions:
            if action not in actions_imported and "Layer0" in action.name:
                action.name = "walk"
                actions_imported.append(action)
                break

    # Clean up duplicate armatures from animation imports
    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if len(armatures) > 1:
        # Keep original, delete others
        for arm in armatures:
            if arm != armature:
                bpy.data.objects.remove(arm, do_unlink=True)

    # Also clean up any Mixamo meshes that came with animations
    for obj in list(bpy.data.objects):
        if obj.type == 'MESH':
            # Check if it's a Mixamo mesh (Beta_Surface, Beta_Joints, etc.)
            if 'Beta' in obj.name or 'mixamo' in obj.name.lower():
                bpy.data.objects.remove(obj, do_unlink=True)

    # Step 7: Export
    output_name = unit_name.replace("unit_", "") + ".glb"
    output_path = OUTPUT_DIR / output_name

    print(f"  Exporting to {output_path}...")
    export_glb(output_path)

    print(f"[OK] {unit_name} -> {output_name}")
    return True

def main():
    """Main function."""
    print("=" * 60)
    print("Merging Custom Meshes with Mixamo Rigs")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find all rigged units
    rigged_units = [d.name for d in RIGGED_DIR.iterdir() if d.is_dir() and d.name.startswith("unit_")]

    print(f"Found {len(rigged_units)} rigged units")
    print()

    converted = 0
    failed = 0

    for unit_name in sorted(rigged_units):
        try:
            if convert_unit(unit_name):
                converted += 1
            else:
                failed += 1
        except Exception as e:
            print(f"[ERROR] {unit_name}: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print()
    print("=" * 60)
    print(f"Conversion complete: {converted} success, {failed} failed")
    print("=" * 60)

if __name__ == "__main__":
    main()
