#!/bin/bash
# Fix 9 failed unit meshes with chunkier designs
# Failed: spearman, galley, trebuchet, caravel, mangonel, conquistador, ironclad, settler, great_general

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/units"

# Chunkier redesigns - avoid thin spears, masts, etc.
FIXES=(
    "unit_spearman|single ancient hoplite warrior, chunky bronze armor, large round shield, short sword instead of spear, muscular build, solid form, isometric view, white background"
    "unit_galley|single ancient warship, chunky wooden hull, no mast, row of oars as solid block, bronze ram bow, compact design, isometric view, white background"
    "unit_trebuchet|single medieval siege tower, chunky wooden fortress on wheels, solid construction, battering ram, no thin throwing arm, isometric view, white background"
    "unit_caravel|single medieval cog ship, chunky wooden hull, single thick mast, square sail as solid shape, high sides, compact design, isometric view, white background"
    "unit_mangonel|single medieval siege wagon, chunky wooden cart, thick wheels, catapult mechanism as solid block, no thin arm, isometric view, white background"
    "unit_conquistador|single Spanish soldier standing, chunky armor, morion helmet, sword and shield, no horse, solid muscular figure, isometric view, white background"
    "unit_ironclad|single ironclad warship, chunky armored hull, USS Monitor style, rotating turret as solid dome, low profile, no thin smokestacks, isometric view, white background"
    "unit_settler|single pioneer wagon, chunky covered wagon, solid canvas top, thick wooden wheels, no oxen just wagon, compact design, isometric view, white background"
    "unit_great_general|single military commander standing, chunky uniform with cape, solid figure, hat with plume, commanding pose, no horse, isometric view, white background"
)

generate_and_convert() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    echo "Processing $ID..."

    # Generate reference
    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "3D render of ${PROMPT}, chunky solid form, game character, studio lighting, one figure only", "text_l": "single chunky 3D character, white background", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "thin, spear, mast, pole, stick, lance, multiple, blurry", "text_l": "thin pole stick lance", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 30, "cfg": 8.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_fix_ref"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" > /dev/null
    sleep 15

    # Wait for reference
    while true; do
        Q=$(curl -s "$COMFY_URL/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('queue_running',[]))+len(d.get('queue_pending',[])))" 2>/dev/null)
        if [ "$Q" = "0" ]; then break; fi
        sleep 3
    done

    # Download reference
    curl -s "$COMFY_URL/view?filename=${ID}_fix_ref_00001_.png&type=output" -o "$OUTPUT_DIR/references/${ID}_ref.png"

    # Upload for 3D conversion
    curl -s -X POST "$COMFY_URL/upload/image" -F "image=@$OUTPUT_DIR/references/${ID}_ref.png" -F "overwrite=true" > /dev/null

    # Convert to 3D
    WORKFLOW3D=$(cat << 'WFEND'
{
  "1": {"class_type": "LoadImage", "inputs": {"image": "IMAGE_PLACEHOLDER"}},
  "2": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": "hunyuan_3d_v2.1.safetensors"}},
  "3": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["2", 1], "image": ["1", 0], "crop": "center"}},
  "4": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["3", 0]}},
  "5": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 128, "batch_size": 1}},
  "6": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["5", 0], "seed": 55555, "steps": 50, "cfg": 5.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "7": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["6", 0], "vae": ["2", 2], "num_chunks": 16000, "octree_resolution": 256}},
  "8": {"class_type": "VoxelToMeshBasic", "inputs": {"voxel": ["7", 0], "threshold": 0.15}},
  "9": {"class_type": "SaveGLB", "inputs": {"mesh": ["8", 0], "filename_prefix": "OUTPUT_PLACEHOLDER"}}
}
WFEND
)

    WF=$(echo "$WORKFLOW3D" | sed "s/IMAGE_PLACEHOLDER/${ID}_ref.png/g" | sed "s/OUTPUT_PLACEHOLDER/${ID}_fix/g")
    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WF}" > /dev/null

    # Wait for 3D
    while true; do
        Q=$(curl -s "$COMFY_URL/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('queue_running',[]))+len(d.get('queue_pending',[])))" 2>/dev/null)
        if [ "$Q" = "0" ]; then break; fi
        sleep 5
    done

    # Download mesh
    curl -s "$COMFY_URL/view?filename=${ID}_fix_00001_.glb&type=output" -o "$OUTPUT_DIR/meshes/${ID}_fix.glb"

    if [ -s "$OUTPUT_DIR/meshes/${ID}_fix.glb" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/meshes/${ID}_fix.glb" 2>/dev/null)
        if [ "$SIZE" -gt 3000 ]; then
            mv "$OUTPUT_DIR/meshes/${ID}_fix.glb" "$OUTPUT_DIR/meshes/${ID}.glb"
            SIZE_KB=$((SIZE / 1024))
            echo "  $ID: SUCCESS (${SIZE_KB}KB)"
            return 0
        else
            echo "  $ID: STILL TOO SMALL (${SIZE}B)"
            rm -f "$OUTPUT_DIR/meshes/${ID}_fix.glb"
            return 1
        fi
    else
        echo "  $ID: DOWNLOAD FAILED"
        return 1
    fi
}

echo "=============================================="
echo "FIXING 9 FAILED UNIT MESHES"
echo "=============================================="
echo ""

SEED=120000
SUCCESS=0

for entry in "${FIXES[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)

    if generate_and_convert "$ID" "$PROMPT" $SEED; then
        SUCCESS=$((SUCCESS + 1))
    fi

    SEED=$((SEED + 1))
done

echo ""
echo "=============================================="
echo "FIXED: $SUCCESS/9 units"
echo "=============================================="
