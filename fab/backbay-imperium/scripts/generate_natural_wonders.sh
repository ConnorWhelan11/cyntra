#!/bin/bash
# Generate 10 natural wonder meshes for Backbay Imperium

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/natural_wonders"
mkdir -p "$OUTPUT_DIR/references" "$OUTPUT_DIR/meshes"

# Natural wonder definitions: id|description
WONDERS=(
    "wonder_grand_canyon|chunky red rock canyon with layered cliff walls, deep gorge, desert terrain, miniature diorama"
    "wonder_mt_everest|chunky snow-capped mountain peak, rocky slopes, ice glacier, highest mountain, miniature diorama"
    "wonder_great_barrier_reef|chunky coral reef formation, colorful coral blocks, tropical fish, ocean floor, miniature diorama"
    "wonder_victoria_falls|chunky waterfall cliff, cascading water, rocky cliff edge, mist spray, miniature diorama"
    "wonder_mt_fuji|chunky conical volcano mountain, snow cap, cherry blossom trees at base, miniature diorama"
    "wonder_uluru|chunky massive red rock monolith, Australian outback, orange sandstone, miniature diorama"
    "wonder_old_faithful|chunky geyser eruption, hot spring pool, steam clouds, rocky basin, miniature diorama"
    "wonder_krakatoa|chunky volcanic island, smoking crater, lava glow, ocean waves, miniature diorama"
    "wonder_rock_of_gibraltar|chunky limestone rock promontory, cliff face, fortress on top, miniature diorama"
    "wonder_dead_sea|chunky salt lake basin, white salt crystals, desert shore, blue water, miniature diorama"
)

generate_reference() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "3D render of ${PROMPT}, isometric view, centered on pure white background, one object only, studio lighting, game terrain asset, stylized chunky design", "text_l": "single natural landmark, 3D miniature, white background", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "multiple objects, people, blurry, text, watermark, realistic photo, thin details", "text_l": "multiple blurry photo", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 30, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_ref"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" > /dev/null
}

convert_to_3d() {
    local ID=$1
    local SEED=$2

    WORKFLOW="{\"1\":{\"class_type\":\"LoadImage\",\"inputs\":{\"image\":\"${ID}_ref.png\"}},\"2\":{\"class_type\":\"ImageOnlyCheckpointLoader\",\"inputs\":{\"ckpt_name\":\"hunyuan_3d_v2.1.safetensors\"}},\"3\":{\"class_type\":\"CLIPVisionEncode\",\"inputs\":{\"clip_vision\":[\"2\",1],\"image\":[\"1\",0],\"crop\":\"center\"}},\"4\":{\"class_type\":\"Hunyuan3Dv2Conditioning\",\"inputs\":{\"clip_vision_output\":[\"3\",0]}},\"5\":{\"class_type\":\"EmptyLatentHunyuan3Dv2\",\"inputs\":{\"resolution\":128,\"batch_size\":1}},\"6\":{\"class_type\":\"KSampler\",\"inputs\":{\"model\":[\"2\",0],\"positive\":[\"4\",0],\"negative\":[\"4\",1],\"latent_image\":[\"5\",0],\"seed\":${SEED},\"steps\":50,\"cfg\":5.0,\"sampler_name\":\"euler\",\"scheduler\":\"normal\",\"denoise\":1.0}},\"7\":{\"class_type\":\"VAEDecodeHunyuan3D\",\"inputs\":{\"samples\":[\"6\",0],\"vae\":[\"2\",2],\"num_chunks\":18000,\"octree_resolution\":256}},\"8\":{\"class_type\":\"VoxelToMeshBasic\",\"inputs\":{\"voxel\":[\"7\",0],\"threshold\":0.10}},\"9\":{\"class_type\":\"SaveGLB\",\"inputs\":{\"mesh\":[\"8\",0],\"filename_prefix\":\"${ID}\"}}}"

    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" > /dev/null
}

wait_for_queue() {
    while true; do
        QUEUE=$(curl -s "$COMFY_URL/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{len(d.get('queue_running',[]))} {len(d.get('queue_pending',[]))}\")" 2>/dev/null)
        RUNNING=$(echo $QUEUE | cut -d' ' -f1)
        PENDING=$(echo $QUEUE | cut -d' ' -f2)
        if [ "$RUNNING" = "0" ] && [ "$PENDING" = "0" ]; then break; fi
        echo "    Queue: $RUNNING running, $PENDING pending..."
        sleep 5
    done
}

echo "=============================================="
echo "GENERATING 10 NATURAL WONDERS"
echo "=============================================="
echo ""

# Phase 1: References
echo "=== PHASE 1: REFERENCES ==="
SEED=600000
for entry in "${WONDERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)
    generate_reference "$ID" "$PROMPT" $SEED
    echo "  $ID"
    SEED=$((SEED + 1))
done

echo "  Waiting..."
wait_for_queue

echo ""
echo "=== DOWNLOADING REFERENCES ==="
for entry in "${WONDERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_ref_00001_.png&type=output" -o "$OUTPUT_DIR/references/${ID}_ref.png"
    curl -s -X POST "$COMFY_URL/upload/image" -F "image=@$OUTPUT_DIR/references/${ID}_ref.png" -F "overwrite=true" > /dev/null
done
echo "  Done"

echo ""
echo "=== PHASE 2: 3D CONVERSION ==="
SEED=610000
for entry in "${WONDERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    echo "  Converting $ID..."
    convert_to_3d "$ID" $SEED
    SEED=$((SEED + 1))
    wait_for_queue
done

echo ""
echo "=== DOWNLOADING MESHES ==="
SUCCESS=0
for entry in "${WONDERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_00001_.glb&type=output" -o "$OUTPUT_DIR/meshes/${ID}.glb"
    if [ -s "$OUTPUT_DIR/meshes/${ID}.glb" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/meshes/${ID}.glb" 2>/dev/null)
        if [ "$SIZE" -gt 3000 ]; then
            echo "  $ID: OK ($((SIZE/1024))KB)"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "  $ID: TOO SMALL"
            rm -f "$OUTPUT_DIR/meshes/${ID}.glb"
        fi
    else
        echo "  $ID: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "NATURAL WONDERS COMPLETE: $SUCCESS/10"
echo "=============================================="
