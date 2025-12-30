#!/bin/bash
# Generate 15 tile improvement meshes for Backbay Imperium
# Each improvement: reference image (SDXL) → 3D mesh (Hunyuan3D)

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/improvements"
mkdir -p "$OUTPUT_DIR/references" "$OUTPUT_DIR/meshes"

# Improvement definitions: id|description
IMPROVEMENTS=(
    "improvement_farm|small farm plot with golden wheat crops, wooden fence, scarecrow, chunky simple design, game asset"
    "improvement_mine|mine entrance in hillside, wooden support beams, minecart with ore, chunky simple design, game asset"
    "improvement_plantation|tropical plantation with rows of crops, small hut, palm trees, chunky simple design, game asset"
    "improvement_trading_post|small wooden market stall with goods, crates and barrels, merchant tent, chunky simple design, game asset"
    "improvement_quarry|stone quarry pit with cut stone blocks, wooden crane, pile of rocks, chunky simple design, game asset"
    "improvement_pasture|fenced pasture with wooden fence posts, hay bale, water trough, chunky simple design, game asset"
    "improvement_camp|hunting camp with tent, campfire, drying rack with pelts, chunky simple design, game asset"
    "improvement_fishing_boats|small wooden fishing boat with nets, dock pier, fish basket, chunky simple design, game asset"
    "improvement_oil_well|oil derrick tower, wooden frame, oil barrel, industrial pump, chunky simple design, game asset"
    "improvement_lumber_mill|sawmill building with log pile, water wheel, cut lumber stack, chunky simple design, game asset"
    "improvement_fort|small wooden fort with walls, watchtower, gate, defensive palisade, chunky simple design, game asset"
    "improvement_academy|small classical building with columns, scroll and book, scholar statue, chunky simple design, game asset"
    "improvement_customs_house|small harbor building with dock, trade goods crates, scale balance, chunky simple design, game asset"
    "improvement_manufactory|workshop building with chimney, anvil, gear wheels, smoke stack, chunky simple design, game asset"
    "improvement_citadel|stone fortress with thick walls, tower, flag, military outpost, chunky simple design, game asset"
)

generate_reference() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "3D render of ${PROMPT}, isometric view, centered on pure white background, one object only, studio lighting, tile improvement for strategy game, miniature diorama style", "text_l": "single game tile improvement, 3D miniature, white background, isometric", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "multiple objects, people, blurry, text, watermark, realistic photo, thin poles, wires", "text_l": "multiple blurry photo thin", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 30, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_ref"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WORKFLOW}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id','error')[:8])" 2>/dev/null || echo "error"
}

convert_to_3d() {
    local ID=$1
    local SEED=$2

    WORKFLOW=$(cat << 'WFEND'
{
  "1": {"class_type": "LoadImage", "inputs": {"image": "IMAGE_PLACEHOLDER"}},
  "2": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": "hunyuan_3d_v2.1.safetensors"}},
  "3": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["2", 1], "image": ["1", 0], "crop": "center"}},
  "4": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["3", 0]}},
  "5": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 128, "batch_size": 1}},
  "6": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["5", 0], "seed": SEED_PLACEHOLDER, "steps": 50, "cfg": 5.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "7": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["6", 0], "vae": ["2", 2], "num_chunks": 16000, "octree_resolution": 256}},
  "8": {"class_type": "VoxelToMeshBasic", "inputs": {"voxel": ["7", 0], "threshold": 0.12}},
  "9": {"class_type": "SaveGLB", "inputs": {"mesh": ["8", 0], "filename_prefix": "OUTPUT_PLACEHOLDER"}}
}
WFEND
)

    WF=$(echo "$WORKFLOW" | sed "s/IMAGE_PLACEHOLDER/${ID}_ref.png/g" | sed "s/SEED_PLACEHOLDER/$SEED/g" | sed "s/OUTPUT_PLACEHOLDER/$ID/g")

    curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WF}" > /dev/null
}

wait_for_queue() {
    while true; do
        QUEUE=$(curl -s "$COMFY_URL/queue" | python3 -c "
import sys, json
data = json.load(sys.stdin)
running = len(data.get('queue_running', []))
pending = len(data.get('queue_pending', []))
print(f'{running} {pending}')
" 2>/dev/null)
        RUNNING=$(echo $QUEUE | cut -d' ' -f1)
        PENDING=$(echo $QUEUE | cut -d' ' -f2)
        if [ "$RUNNING" = "0" ] && [ "$PENDING" = "0" ]; then
            break
        fi
        echo "    Queue: $RUNNING running, $PENDING pending..."
        sleep 5
    done
}

echo "=============================================="
echo "GENERATING 15 TILE IMPROVEMENTS"
echo "=============================================="
echo ""

# Phase 1: Generate reference images
echo "=== PHASE 1: REFERENCE IMAGES ==="
SEED=400000
BATCH_SIZE=5
COUNT=0

for entry in "${IMPROVEMENTS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)

    RESULT=$(generate_reference "$ID" "$PROMPT" $SEED)
    echo "  $ID: $RESULT"

    SEED=$((SEED + 1))
    COUNT=$((COUNT + 1))

    if [ $((COUNT % BATCH_SIZE)) -eq 0 ]; then
        echo "  Waiting for batch..."
        wait_for_queue
    fi
done

echo "  Waiting for final batch..."
wait_for_queue
echo ""

# Download references
echo "=== DOWNLOADING REFERENCES ==="
REF_SUCCESS=0
for entry in "${IMPROVEMENTS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_ref_00001_.png&type=output" -o "$OUTPUT_DIR/references/${ID}_ref.png"
    if [ -s "$OUTPUT_DIR/references/${ID}_ref.png" ]; then
        REF_SUCCESS=$((REF_SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
done
echo "  Downloaded: $REF_SUCCESS/15 references"
echo ""

# Phase 2: Convert to 3D
echo "=== PHASE 2: 3D MESH CONVERSION ==="

# Upload all references first
echo "  Uploading references..."
for entry in "${IMPROVEMENTS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    if [ -f "$OUTPUT_DIR/references/${ID}_ref.png" ]; then
        curl -s -X POST "$COMFY_URL/upload/image" \
            -F "image=@$OUTPUT_DIR/references/${ID}_ref.png" \
            -F "overwrite=true" > /dev/null
    fi
done
echo "  Upload complete"
echo ""

# Convert to 3D (one at a time - GPU intensive)
SEED=410000

for entry in "${IMPROVEMENTS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)

    if [ ! -f "$OUTPUT_DIR/references/${ID}_ref.png" ]; then
        echo "  $ID: No reference, skipping"
        continue
    fi

    echo "  Converting $ID..."
    convert_to_3d "$ID" $SEED
    SEED=$((SEED + 1))

    # Wait for this one to complete
    wait_for_queue
done

echo ""
echo "=== DOWNLOADING MESHES ==="
MESH_SUCCESS=0
for entry in "${IMPROVEMENTS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)

    curl -s "$COMFY_URL/view?filename=${ID}_00001_.glb&type=output" -o "$OUTPUT_DIR/meshes/${ID}.glb"

    if [ -s "$OUTPUT_DIR/meshes/${ID}.glb" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/meshes/${ID}.glb" 2>/dev/null || stat -c%s "$OUTPUT_DIR/meshes/${ID}.glb" 2>/dev/null)
        if [ "$SIZE" -gt 3000 ]; then
            SIZE_KB=$((SIZE / 1024))
            echo "  $ID: OK (${SIZE_KB}KB)"
            MESH_SUCCESS=$((MESH_SUCCESS + 1))
        else
            echo "  $ID: TOO SMALL (${SIZE}B)"
            rm -f "$OUTPUT_DIR/meshes/${ID}.glb"
        fi
    else
        echo "  $ID: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "TILE IMPROVEMENT GENERATION COMPLETE"
echo "=============================================="
echo "References: $REF_SUCCESS/15"
echo "3D Meshes: $MESH_SUCCESS/15"
echo "=============================================="
