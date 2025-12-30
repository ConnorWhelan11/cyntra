#!/bin/bash
# Generate 27 resource icons for Backbay Imperium
# Style: Isometric 3D icons on white background

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/resources"
mkdir -p "$OUTPUT_DIR"

# Resource definitions: id|type|description
# Types: strategic, luxury, bonus
RESOURCES=(
    # Strategic Resources (military/production)
    "resource_coal|strategic|pile of black coal chunks, shiny black rocks"
    "resource_oil|strategic|black oil barrel with oil puddle, industrial"
    "resource_uranium|strategic|glowing green uranium ore, radioactive crystal"
    "resource_aluminum|strategic|shiny silver aluminum ingots stacked"
    "resource_niter|strategic|white crystalline saltpeter chunks"

    # Luxury Resources (happiness/trade)
    "resource_gems|luxury|sparkling cut diamonds and rubies, precious gems"
    "resource_silver|luxury|shiny silver bars and coins stacked"
    "resource_silk|luxury|rolls of colorful silk fabric, asian textile"
    "resource_spices|luxury|exotic spice jars with colorful powders"
    "resource_wine|luxury|wine barrel with grapes and bottle"
    "resource_incense|luxury|burning incense sticks with smoke, brass holder"
    "resource_ivory|luxury|carved elephant ivory tusks, white"
    "resource_pearls|luxury|open oyster shell with white pearls"
    "resource_dyes|luxury|colorful dye pots with pigment powders"
    "resource_cotton|luxury|white cotton bolls on plant, fluffy"
    "resource_furs|luxury|stack of animal pelts, brown fur"
    "resource_marble|luxury|white marble blocks with veins, polished"
    "resource_porcelain|luxury|blue and white chinese porcelain vase"
    "resource_sugar|luxury|sugar cane stalks with sugar crystals"
    "resource_tea|luxury|tea leaves in wooden chest, dried leaves"
    "resource_coffee|luxury|coffee beans in burlap sack, roasted brown"

    # Bonus Resources (food/production)
    "resource_wheat|bonus|golden wheat sheaf bundle, harvest grain"
    "resource_cattle|bonus|brown cow standing, farm animal"
    "resource_sheep|bonus|white fluffy sheep standing, wool animal"
    "resource_fish|bonus|silver fish on ice, fresh catch"
    "resource_deer|bonus|brown deer standing, antlers, wild game"
    "resource_bananas|bonus|bunch of yellow bananas, tropical fruit"
)

generate_icon() {
    local ID=$1
    local TYPE=$2
    local DESC=$3
    local SEED=$4

    echo "  $ID ($TYPE)..."

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "3D render of ${DESC}, game resource icon, isometric view, centered on pure white background, studio lighting, one object only, clean design, stylized", "text_l": "single game icon, 3D render, white background", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "multiple objects, blurry, text, watermark, realistic photo, people, hands", "text_l": "multiple blurry text", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 25, "cfg": 8.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WORKFLOW}" > /dev/null
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
        sleep 3
    done
}

echo "=============================================="
echo "GENERATING 27 RESOURCE ICONS"
echo "=============================================="
echo ""

SEED=300000
BATCH_SIZE=8
COUNT=0

for entry in "${RESOURCES[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    TYPE=$(echo "$entry" | cut -d'|' -f2)
    DESC=$(echo "$entry" | cut -d'|' -f3)

    generate_icon "$ID" "$TYPE" "$DESC" $SEED

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

echo "=== DOWNLOADING ICONS ==="
SUCCESS=0
for entry in "${RESOURCES[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    TYPE=$(echo "$entry" | cut -d'|' -f2)

    curl -s "$COMFY_URL/view?filename=${ID}_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}.png"

    if [ -s "$OUTPUT_DIR/${ID}.png" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/${ID}.png" 2>/dev/null)
        SIZE_KB=$((SIZE / 1024))
        echo "  $ID: OK (${SIZE_KB}KB)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "RESOURCE GENERATION COMPLETE: $SUCCESS/27"
echo "=============================================="
