#!/bin/bash
# Convert improved reference images to 3D with better Hunyuan3D settings
# Key improvements:
# - Higher octree resolution (256)
# - More sampling steps (40)
# - Lower mesh threshold (0.3)
# - More VAE chunks for detail

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
INPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/buildings"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/buildings/meshes"
mkdir -p "$OUTPUT_DIR"

BUILDINGS="building_arena building_barracks building_cathedral building_granary building_hospital building_monument building_walls building_workshop wonder_machu_picchu wonder_notre_dame wonder_petra wonder_stonehenge"

upload_image() {
    local FILE=$1
    local FILENAME=$(basename "$FILE")
    curl -s -X POST "$COMFY_URL/upload/image" \
        -F "image=@$FILE" \
        -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name','error'))" 2>/dev/null
}

generate_3d() {
    local IMAGE_NAME=$1
    local OUTPUT_PREFIX=$2
    local SEED=$3

    # Improved workflow with higher quality settings
    WORKFLOW=$(cat << 'WORKFLOW_END'
{
  "1": {"class_type": "LoadImage", "inputs": {"image": "IMAGE_NAME_PLACEHOLDER"}},
  "2": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": "hunyuan_3d_v2.1.safetensors"}},
  "3": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["2", 1], "image": ["1", 0], "crop": "center"}},
  "4": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["3", 0]}},
  "5": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 128, "batch_size": 1}},
  "6": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["5", 0], "seed": SEED_PLACEHOLDER, "steps": 40, "cfg": 5.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "7": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["6", 0], "vae": ["2", 2], "num_chunks": 12000, "octree_resolution": 256}},
  "8": {"class_type": "VoxelToMeshBasic", "inputs": {"voxel": ["7", 0], "threshold": 0.3}},
  "9": {"class_type": "SaveGLB", "inputs": {"mesh": ["8", 0], "filename_prefix": "OUTPUT_PREFIX_PLACEHOLDER"}}
}
WORKFLOW_END
)

    WORKFLOW=$(echo "$WORKFLOW" | sed "s/IMAGE_NAME_PLACEHOLDER/$IMAGE_NAME/g")
    WORKFLOW=$(echo "$WORKFLOW" | sed "s/SEED_PLACEHOLDER/$SEED/g")
    WORKFLOW=$(echo "$WORKFLOW" | sed "s/OUTPUT_PREFIX_PLACEHOLDER/$OUTPUT_PREFIX/g")

    curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WORKFLOW}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id','error')[:12])" 2>/dev/null || echo "error"
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
        sleep 15
    done
}

echo "=============================================="
echo "CONVERTING TO 3D WITH IMPROVED SETTINGS"
echo "=============================================="
echo "Settings:"
echo "  - Octree resolution: 256 (was default)"
echo "  - Sampling steps: 40 (was 30)"
echo "  - Mesh threshold: 0.3 (was 0.5)"
echo "  - VAE chunks: 12000 (was 8000)"
echo ""

echo "=== UPLOADING IMPROVED REFERENCES ==="
for ID in $BUILDINGS; do
    REF="$INPUT_DIR/${ID}_ref.png"
    if [ -f "$REF" ]; then
        RESULT=$(upload_image "$REF")
        echo "  $ID: $RESULT"
    fi
done

echo ""
echo "=== GENERATING 3D MESHES ==="
SEED=95000

for ID in $BUILDINGS; do
    FILENAME="${ID}_ref.png"
    RESULT=$(generate_3d "$FILENAME" "${ID}_v2" $SEED)
    echo "  $ID: $RESULT"
    SEED=$((SEED + 1))

    # Process one at a time for these complex models
    echo "    Waiting for completion..."
    wait_for_queue
done

echo ""
echo "=== DOWNLOADING IMPROVED MESHES ==="
SUCCESS=0
TOTAL=0

for ID in $BUILDINGS; do
    curl -s "$COMFY_URL/view?filename=${ID}_v2_00001_.glb&type=output" -o "$OUTPUT_DIR/${ID}_new.glb"

    if [ -s "$OUTPUT_DIR/${ID}_new.glb" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/${ID}_new.glb")
        if [ "$SIZE" -gt 3000 ]; then
            # Replace old mesh
            mv "$OUTPUT_DIR/${ID}_new.glb" "$OUTPUT_DIR/${ID}.glb"
            SIZE_KB=$((SIZE / 1024))
            echo "  $ID: OK (${SIZE_KB}KB)"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "  $ID: TOO SMALL (${SIZE}B)"
            rm -f "$OUTPUT_DIR/${ID}_new.glb"
        fi
    else
        echo "  $ID: FAILED"
    fi
    TOTAL=$((TOTAL + 1))
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/$TOTAL meshes improved"
echo "=============================================="
