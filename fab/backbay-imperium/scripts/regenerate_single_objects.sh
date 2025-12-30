#!/bin/bash
# Regenerate with MUCH stronger single-object constraints
# Key change: Remove "game asset", add "product photo", "one object only"

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/buildings"

# Much stronger single-object prompts
# Using "3D render, product shot, centered, one object" style
PROMPTS=(
    "building_arena|3D render of a single Roman colosseum amphitheater, solid stone architecture, front view, centered on white background, one building only, studio lighting, product photography"
    "building_barracks|3D render of a single Roman military barracks building, brick and stone, rectangular structure, centered on white background, one building only, studio lighting"
    "building_cathedral|3D render of a single Gothic cathedral, stone church with two towers, solid chunky architecture, centered on white background, one building only, studio lighting"
    "building_granary|3D render of a single ancient grain silo, cylindrical stone building with dome roof, centered on white background, one building only, studio lighting"
    "building_hospital|3D render of a single Victorian hospital building, red brick with white trim, centered on white background, one building only, studio lighting"
    "building_monument|3D render of a single Egyptian obelisk, tall stone pillar with pyramid tip, centered on white background, one monument only, studio lighting"
    "building_walls|3D render of a single medieval castle gatehouse tower, stone fortification with gate, centered on white background, one tower only, studio lighting"
    "building_workshop|3D render of a single medieval blacksmith workshop, stone building with chimney, centered on white background, one building only, studio lighting"
    "wonder_machu_picchu|3D render of a single Incan temple building, stone blocks with trapezoidal door, centered on white background, one temple only, studio lighting"
    "wonder_notre_dame|3D render of Notre Dame cathedral Paris, Gothic church with twin towers and rose window, centered on white background, one cathedral only, studio lighting"
    "wonder_petra|3D render of Petra Treasury facade, ancient carved stone temple front, centered on white background, one building only, studio lighting"
    "wonder_stonehenge|3D render of a single stone trilithon, two vertical megaliths with horizontal stone on top, centered on white background, one monument only, studio lighting"
)

generate_reference() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    # Stronger negative prompt against multiple objects
    local NEG_PROMPT="multiple objects, repeating pattern, tileable, grid, array, collection, set of, several, many, group, scattered, landscape, environment, trees, grass, terrain"

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "${PROMPT}", "text_l": "single 3D object render, product photography, centered, white background", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "${NEG_PROMPT}", "text_l": "multiple, pattern, tileable, many objects, grid layout", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 35, "cfg": 8.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_ref_v3"}}
}
EOF
)

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
        sleep 5
    done
}

echo "=============================================="
echo "REGENERATING WITH SINGLE-OBJECT CONSTRAINTS"
echo "=============================================="
echo "Strategy:"
echo "  - '3D render, product photography' style"
echo "  - 'centered on white background'"
echo "  - 'one [X] only' explicit constraint"
echo "  - Strong negative: 'multiple, pattern, tileable'"
echo "  - Higher CFG (8.0) for prompt adherence"
echo "  - DPM++ 2M Karras sampler"
echo ""

SEED=90000

for entry in "${PROMPTS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)
    RESULT=$(generate_reference "$ID" "$PROMPT" $SEED)
    echo "  $ID: $RESULT"
    SEED=$((SEED + 1))
done

echo ""
echo "Waiting for generation..."
wait_for_queue

echo ""
echo "=============================================="
echo "DOWNLOADING V3 REFERENCES"
echo "=============================================="

SUCCESS=0
for entry in "${PROMPTS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_ref_v3_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}_ref_v3.png"

    if [ -s "$OUTPUT_DIR/${ID}_ref_v3.png" ]; then
        # Replace main reference
        cp "$OUTPUT_DIR/${ID}_ref_v3.png" "$OUTPUT_DIR/${ID}_ref.png"
        echo "  $ID: OK"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/12 single-object references"
echo "=============================================="
