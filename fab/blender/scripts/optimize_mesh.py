#!/usr/bin/env python3
"""
Blender Mesh Optimization Script

Runs in Blender headless mode to:
1. Decimate mesh to target vertex/face count
2. Generate UV coordinates using Smart UV Project
3. Export optimized GLB

Usage:
    blender --background --python optimize_mesh.py -- \
        --input /path/to/input.glb \
        --output /path/to/output.glb \
        --target-vertices 25000 \
        --generate-uvs \
        --uv-method smart_project
"""

import argparse
import json
import math
import sys
from pathlib import Path

# Blender imports (only available when running in Blender)
try:
    import bpy

    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False
    print("Warning: Not running in Blender context")


def parse_args():
    """Parse command line arguments after '--'."""
    # Find args after '--'
    try:
        idx = sys.argv.index("--")
        args = sys.argv[idx + 1 :]
    except ValueError:
        args = []

    parser = argparse.ArgumentParser(description="Optimize mesh for game use")
    parser.add_argument("--input", "-i", required=True, help="Input GLB/GLTF file")
    parser.add_argument("--output", "-o", required=True, help="Output GLB file")
    parser.add_argument(
        "--target-vertices", type=int, default=25000, help="Target vertex count"
    )
    parser.add_argument(
        "--target-faces", type=int, default=12500, help="Target face count"
    )
    parser.add_argument(
        "--min-ratio", type=float, default=0.05, help="Minimum decimation ratio"
    )
    parser.add_argument(
        "--generate-uvs", action="store_true", help="Generate UV coordinates"
    )
    parser.add_argument(
        "--uv-method",
        default="smart_project",
        choices=["smart_project", "cube", "lightmap"],
        help="UV unwrapping method",
    )
    parser.add_argument(
        "--uv-angle-limit",
        type=float,
        default=66.0,
        help="Angle limit for smart UV project (degrees)",
    )
    parser.add_argument(
        "--uv-island-margin", type=float, default=0.02, help="Margin between UV islands"
    )
    parser.add_argument("--stats-output", help="Path to write stats JSON")
    parser.add_argument(
        "--seed", type=int, default=42, help="Random seed for determinism"
    )

    return parser.parse_args(args)


def reset_blender():
    """Reset Blender to clean state."""
    # Delete all objects
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # Clear orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)


def import_glb(filepath: str) -> list:
    """Import GLB/GLTF file and return mesh objects."""
    bpy.ops.import_scene.gltf(filepath=filepath)

    # Get all mesh objects
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    return mesh_objects


def get_mesh_stats(objects: list) -> dict:
    """Get combined mesh statistics."""
    total_verts = 0
    total_faces = 0
    has_uvs = False

    for obj in objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        total_verts += len(mesh.vertices)
        total_faces += len(mesh.polygons)
        if mesh.uv_layers:
            has_uvs = True

    return {
        "vertices": total_verts,
        "faces": total_faces,
        "has_uvs": has_uvs,
        "object_count": len(objects),
    }


def calculate_decimate_ratio(
    current_verts: int, target_verts: int, min_ratio: float
) -> float:
    """Calculate decimation ratio to achieve target vertex count."""
    if current_verts <= target_verts:
        return 1.0  # No decimation needed

    ratio = target_verts / current_verts
    return max(ratio, min_ratio)


def join_meshes(objects: list):
    """Join all mesh objects into a single mesh for better decimation."""
    if len(objects) <= 1:
        return objects[0] if objects else None

    # Deselect all
    bpy.ops.object.select_all(action="DESELECT")

    # Select all mesh objects
    for obj in objects:
        if obj.type == "MESH":
            obj.select_set(True)

    # Set first mesh as active
    bpy.context.view_layer.objects.active = objects[0]

    # Join all selected objects
    bpy.ops.object.join()

    # Return the joined object
    joined = bpy.context.active_object
    print(f"  Joined {len(objects)} objects into: {joined.name}")
    return joined


def merge_duplicate_vertices(obj, threshold: float = 0.0001):
    """Merge vertices that are very close together.

    Hunyuan3D and similar mesh generators often create duplicate vertices
    at the same position. Merging them enables much better decimation.
    """
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    initial_verts = len(obj.data.vertices)

    # Switch to edit mode
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")

    # Merge vertices by distance
    bpy.ops.mesh.remove_doubles(threshold=threshold)

    # Return to object mode
    bpy.ops.object.mode_set(mode="OBJECT")

    final_verts = len(obj.data.vertices)
    merged = initial_verts - final_verts

    if merged > 0:
        print(
            f"  Merged {merged:,} duplicate vertices ({initial_verts:,} -> {final_verts:,})"
        )

    return merged


def decimate_mesh(obj, ratio: float, preserve_uvs: bool = True, mode: str = "collapse"):
    """Apply decimation modifier to mesh object.

    Args:
        obj: Blender mesh object
        ratio: Target vertex ratio (0.0 to 1.0)
        preserve_uvs: Try to preserve UV coordinates
        mode: Decimation mode - "collapse" (quality) or "planar" (aggressive)
    """
    if ratio >= 1.0:
        return  # No decimation needed

    # Ensure object is active
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    initial_verts = len(obj.data.vertices)
    target_verts = int(initial_verts * ratio)

    # For very aggressive decimation, use multi-pass approach
    # First pass: PLANAR to remove flat surfaces
    # Second pass: COLLAPSE for remaining geometry
    if ratio < 0.1:
        print(f"  Aggressive mode: target {target_verts} verts from {initial_verts}")

        # Pass 1: PLANAR decimation to remove flat areas
        planar_mod = obj.modifiers.new(name="DecimatePlanar", type="DECIMATE")
        planar_mod.decimate_type = "DISSOLVE"  # Dissolve flat faces
        planar_mod.angle_limit = math.radians(5.0)  # 5 degree threshold
        bpy.ops.object.modifier_apply(modifier=planar_mod.name)

        current_verts = len(obj.data.vertices)
        print(f"  After PLANAR pass: {current_verts} verts")

        # Pass 2: COLLAPSE to reach target
        if current_verts > target_verts:
            collapse_ratio = target_verts / current_verts
            collapse_mod = obj.modifiers.new(name="DecimateCollapse", type="DECIMATE")
            collapse_mod.decimate_type = "COLLAPSE"
            collapse_mod.ratio = max(collapse_ratio, 0.01)
            collapse_mod.use_collapse_triangulate = False
            bpy.ops.object.modifier_apply(modifier=collapse_mod.name)

            current_verts = len(obj.data.vertices)
            print(f"  After COLLAPSE pass: {current_verts} verts")

            # Pass 3: Additional collapse passes if still over target
            max_passes = 5
            pass_num = 0
            while current_verts > target_verts * 1.1 and pass_num < max_passes:
                pass_num += 1
                collapse_ratio = target_verts / current_verts
                mod = obj.modifiers.new(name=f"Decimate{pass_num}", type="DECIMATE")
                mod.decimate_type = "COLLAPSE"
                mod.ratio = max(collapse_ratio, 0.5)  # At least 50% reduction per pass
                bpy.ops.object.modifier_apply(modifier=mod.name)

                new_verts = len(obj.data.vertices)
                if new_verts >= current_verts * 0.95:  # Less than 5% reduction
                    print(
                        f"  Pass {pass_num}: minimal reduction ({current_verts} -> {new_verts}), stopping"
                    )
                    break
                current_verts = new_verts
                print(f"  Pass {pass_num}: {current_verts} verts")

        print(f"  Final: {len(obj.data.vertices)} verts")
        return

    # Standard single-pass COLLAPSE for moderate ratios
    modifier = obj.modifiers.new(name="Decimate", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = False

    if preserve_uvs:
        if hasattr(modifier, "use_symmetry"):
            modifier.use_symmetry = False

    bpy.ops.object.modifier_apply(modifier=modifier.name)

    current_verts = len(obj.data.vertices)
    print(f"  Decimated {obj.name}: ratio={ratio:.3f}, verts={current_verts}")


def unwrap_mesh(
    obj,
    method: str = "smart_project",
    angle_limit: float = 66.0,
    island_margin: float = 0.02,
):
    """Generate UV coordinates for mesh."""
    # Ensure object is active and in edit mode
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Create UV layer if needed
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")

    # Switch to edit mode
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")

    # Apply UV unwrap based on method
    if method == "smart_project":
        # Convert angle to radians
        angle_rad = math.radians(angle_limit)
        bpy.ops.uv.smart_project(
            angle_limit=angle_rad,
            island_margin=island_margin,
            correct_aspect=True,
            scale_to_bounds=True,
        )
    elif method == "cube":
        bpy.ops.uv.cube_project(cube_size=1.0)
    elif method == "lightmap":
        bpy.ops.uv.lightmap_pack(
            PREF_CONTEXT="ALL_FACES",
            PREF_PACK_IN_ONE=True,
            PREF_NEW_UVLAYER=False,
            PREF_BOX_DIV=12,
            PREF_MARGIN_DIV=0.1,
        )

    # Return to object mode
    bpy.ops.object.mode_set(mode="OBJECT")

    print(f"  UV unwrapped {obj.name}: method={method}")


def export_glb(filepath: str):
    """Export scene as GLB with optimized settings."""
    # Blender 5.0 GLTF export parameters
    # Explicitly enable UV export
    try:
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            export_format="GLB",
            export_apply=True,  # Apply modifiers
            export_texcoords=True,  # Export UVs
            export_normals=True,  # Export normals
            export_materials="NONE",  # Skip materials (we handle separately)
        )
    except TypeError:
        # Fallback for different Blender versions
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            export_format="GLB",
        )


def main():
    if not IN_BLENDER:
        print("Error: This script must be run in Blender")
        print("Usage: blender --background --python optimize_mesh.py -- --input ...")
        sys.exit(1)

    args = parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print("\nMesh Optimization")
    print("=================")
    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Target: {args.target_vertices} vertices, {args.target_faces} faces")

    # Reset Blender
    reset_blender()

    # Import mesh
    print("\nImporting mesh...")
    objects = import_glb(str(input_path))

    if not objects:
        print("Error: No mesh objects found in file")
        sys.exit(1)

    # Get initial stats
    initial_stats = get_mesh_stats(objects)
    print(
        f"Initial: {initial_stats['vertices']} verts, {initial_stats['faces']} faces, "
        f"UVs: {initial_stats['has_uvs']}, objects: {initial_stats['object_count']}"
    )

    # Join all mesh objects for better decimation
    # (works better than decimating each object separately)
    if len(objects) > 1:
        print("\nJoining mesh objects...")
        mesh_obj = join_meshes(objects)
        objects = [mesh_obj]
    else:
        mesh_obj = objects[0]

    # Merge duplicate vertices (Hunyuan3D creates many duplicates)
    print("\nMerging duplicate vertices...")
    merge_duplicate_vertices(mesh_obj)

    # Update vertex count after merge
    post_merge_verts = len(mesh_obj.data.vertices)

    # Calculate decimation ratio based on POST-MERGE vertex count
    ratio = calculate_decimate_ratio(
        post_merge_verts, args.target_vertices, args.min_ratio
    )

    # Decimate the mesh
    if ratio < 1.0:
        print(f"\nDecimating mesh (target ratio: {ratio:.4f})...")
        decimate_mesh(mesh_obj, ratio)
    else:
        print("\nSkipping decimation (already under budget)")

    # Generate UVs if requested
    if args.generate_uvs:
        print(f"\nGenerating UVs (method: {args.uv_method})...")
        unwrap_mesh(
            mesh_obj,
            method=args.uv_method,
            angle_limit=args.uv_angle_limit,
            island_margin=args.uv_island_margin,
        )

    # Get final stats
    final_stats = get_mesh_stats(objects)
    print(
        f"\nFinal: {final_stats['vertices']} verts, {final_stats['faces']} faces, "
        f"UVs: {final_stats['has_uvs']}"
    )

    # Calculate reduction
    vert_reduction = (1 - final_stats["vertices"] / initial_stats["vertices"]) * 100
    face_reduction = (1 - final_stats["faces"] / initial_stats["faces"]) * 100
    print(f"Reduction: {vert_reduction:.1f}% vertices, {face_reduction:.1f}% faces")

    # Export optimized mesh
    print(f"\nExporting to {output_path}...")
    export_glb(str(output_path))

    # Write stats JSON if requested
    if args.stats_output:
        stats = {
            "input": str(input_path),
            "output": str(output_path),
            "initial": initial_stats,
            "final": final_stats,
            "settings": {
                "target_vertices": args.target_vertices,
                "target_faces": args.target_faces,
                "decimate_ratio": ratio,
                "generate_uvs": args.generate_uvs,
                "uv_method": args.uv_method if args.generate_uvs else None,
            },
            "reduction": {
                "vertices_percent": round(vert_reduction, 2),
                "faces_percent": round(face_reduction, 2),
            },
        }
        with open(args.stats_output, "w") as f:
            json.dump(stats, f, indent=2)
        print(f"Stats written to: {args.stats_output}")

    print("\nOptimization complete!")


if __name__ == "__main__":
    main()
