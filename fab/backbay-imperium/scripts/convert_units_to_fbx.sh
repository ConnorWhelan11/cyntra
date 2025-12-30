#!/bin/bash
# Convert humanoid unit GLBs to FBX for Mixamo upload

BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
INPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/units/meshes"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/units/fbx_for_mixamo"

mkdir -p "$OUTPUT_DIR"

echo "=== CONVERTING HUMANOID UNITS TO FBX ==="

convert_unit() {
    local unit=$1
    local INPUT="$INPUT_DIR/unit_${unit}.glb"
    local OUTPUT="$OUTPUT_DIR/unit_${unit}.fbx"

    if [ ! -f "$INPUT" ]; then
        echo "  $unit: NOT FOUND"
        return
    fi

    echo -n "  $unit: "

    $BLENDER --background --python-expr "
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='$INPUT')
for obj in bpy.data.objects:
    if obj.type in ['MESH', 'ARMATURE']:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.fbx(filepath='$OUTPUT', use_selection=True, apply_scale_options='FBX_SCALE_ALL', mesh_smooth_type='FACE')
" 2>/dev/null

    if [ -f "$OUTPUT" ]; then
        SIZE=$(stat -f%z "$OUTPUT" 2>/dev/null)
        echo "OK ($((SIZE/1024))KB)"
    else
        echo "FAILED"
    fi
}

# Convert each humanoid unit
convert_unit "warrior"
convert_unit "archer"
convert_unit "spearman"
convert_unit "slinger"
convert_unit "legion"
convert_unit "pikeman"
convert_unit "crossbowman"
convert_unit "longbowman"
convert_unit "landsknecht"
convert_unit "musketeer"
convert_unit "rifleman"
convert_unit "infantry"
convert_unit "settler"
convert_unit "worker"
convert_unit "missionary"
convert_unit "great_general"

echo ""
echo "=== FBX FILES READY FOR MIXAMO ==="
ls "$OUTPUT_DIR"/*.fbx 2>/dev/null | wc -l | tr -d ' '
echo " files created"
ls -lh "$OUTPUT_DIR"/*.fbx 2>/dev/null
