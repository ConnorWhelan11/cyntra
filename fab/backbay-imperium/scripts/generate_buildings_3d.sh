#!/bin/bash
# Convert building reference images to 3D meshes using Hunyuan3D v2

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
INPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/buildings"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/buildings/meshes"
mkdir -p "$OUTPUT_DIR"

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

    WORKFLOW=$(cat << 'WORKFLOW_END'
{
  "1": {"class_type": "LoadImage", "inputs": {"image": "IMAGE_NAME_PLACEHOLDER"}},
  "2": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": "hunyuan_3d_v2.1.safetensors"}},
  "3": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["2", 1], "image": ["1", 0], "crop": "center"}},
  "4": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["3", 0]}},
  "5": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 128, "batch_size": 1}},
  "6": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["5", 0], "seed": SEED_PLACEHOLDER, "steps": 30, "cfg": 5.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "7": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["6", 0], "vae": ["2", 2], "num_chunks": 8000, "octree_resolution": 256}},
  "8": {"class_type": "VoxelToMeshBasic", "inputs": {"voxel": ["7", 0], "threshold": 0.5}},
  "9": {"class_type": "SaveGLB", "inputs": {"mesh": ["8", 0], "filename_prefix": "OUTPUT_PREFIX_PLACEHOLDER"}}
}
WORKFLOW_END
)

    # Replace placeholders
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
        echo "  Queue: $RUNNING running, $PENDING pending..."
        sleep 10
    done
}

echo "=============================================="
echo "CONVERTING BUILDINGS TO 3D MESHES"
echo "=============================================="
echo ""

# Get list of reference images
REFS=$(ls "$INPUT_DIR"/*_ref.png 2>/dev/null)
TOTAL=$(echo "$REFS" | wc -l | tr -d ' ')
echo "Found $TOTAL reference images"
echo ""

echo "=== UPLOADING IMAGES ==="
for REF in $REFS; do
    FILENAME=$(basename "$REF")
    RESULT=$(upload_image "$REF")
    echo "  $FILENAME: $RESULT"
done

echo ""
echo "=== GENERATING 3D MESHES ==="
SEED=80000
COUNT=0
BATCH_SIZE=3  # Hunyuan3D is GPU intensive, smaller batches

for REF in $REFS; do
    FILENAME=$(basename "$REF")
    # Extract building ID (e.g., building_monument from building_monument_ref.png)
    ID=$(echo "$FILENAME" | sed 's/_ref\.png$//')

    RESULT=$(generate_3d "$FILENAME" "$ID" $SEED)
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

echo "=== DOWNLOADING MESHES ==="
SUCCESS=0
for REF in $REFS; do
    FILENAME=$(basename "$REF")
    ID=$(echo "$FILENAME" | sed 's/_ref\.png$//')

    # GLB files are saved with _00001_ suffix
    curl -s "$COMFY_URL/view?filename=${ID}_00001_.glb&type=output&subfolder=mesh" -o "$OUTPUT_DIR/${ID}.glb"

    if [ -s "$OUTPUT_DIR/${ID}.glb" ]; then
        SIZE=$(ls -lh "$OUTPUT_DIR/${ID}.glb" | awk '{print $5}')
        echo "  $ID: OK ($SIZE)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
        rm -f "$OUTPUT_DIR/${ID}.glb"
    fi
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/$TOTAL buildings converted to 3D"
echo "=============================================="
