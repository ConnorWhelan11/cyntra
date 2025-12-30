#!/bin/bash
# Generate 11 leader portraits for Backbay Imperium
# Style: Oil painting portraits like Civ 5

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/leaders"
mkdir -p "$OUTPUT_DIR"

# Leader definitions: id|name|civilization|era|description
LEADERS=(
    "leader_washington|George Washington|America|Industrial|middle-aged man, powdered white wig, blue military coat with gold epaulettes, dignified expression"
    "leader_elizabeth|Elizabeth I|England|Renaissance|red-haired woman, elaborate white ruff collar, pearl jewelry, crown, regal expression"
    "leader_napoleon|Napoleon Bonaparte|France|Industrial|dark-haired man, bicorne hat, white military uniform, medals, stern confident expression"
    "leader_bismarck|Otto von Bismarck|Germany|Industrial|older man with white mustache, spiked prussian helmet, military uniform with medals"
    "leader_gandhi|Mahatma Gandhi|India|Modern|bald elderly man, round glasses, white dhoti, peaceful serene expression"
    "leader_montezuma|Montezuma II|Aztec|Medieval|aztec emperor, elaborate feathered headdress, jade jewelry, fierce warrior expression"
    "leader_cleopatra|Cleopatra VII|Egypt|Ancient|beautiful woman, black hair with golden headdress, kohl eyes, cobra crown"
    "leader_alexander|Alexander the Great|Greece|Classical|young man with curly hair, golden laurel wreath, purple cloak, heroic expression"
    "leader_genghis|Genghis Khan|Mongolia|Medieval|asian man with long mustache, fur-lined helmet, leather armor, fierce conqueror expression"
    "leader_caesar|Julius Caesar|Rome|Classical|roman man with laurel wreath, red toga, stern commanding expression, short hair"
    "leader_wu_zetian|Wu Zetian|China|Medieval|elegant chinese empress, elaborate hair ornaments, silk robes, wise powerful expression"
)

generate_portrait() {
    local ID=$1
    local NAME=$2
    local CIV=$3
    local ERA=$4
    local DESC=$5
    local SEED=$6

    echo "  Generating $NAME ($CIV)..."

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "oil painting portrait of ${DESC}, historical leader portrait, dark background, dramatic lighting, masterpiece quality, renaissance painting style, detailed face, noble bearing", "text_l": "oil painting portrait, historical figure, dark background", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "cartoon, anime, modern clothes, blurry, distorted, multiple people, text, watermark", "text_l": "cartoon anime blurry", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 35, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}"}}
}
EOF
)

    RESULT=$(curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WORKFLOW}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id','error')[:8])" 2>/dev/null)
    echo "    Queued: $RESULT"
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
echo "GENERATING 11 LEADER PORTRAITS"
echo "=============================================="
echo ""

SEED=200000
BATCH_SIZE=4
COUNT=0

for entry in "${LEADERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    NAME=$(echo "$entry" | cut -d'|' -f2)
    CIV=$(echo "$entry" | cut -d'|' -f3)
    ERA=$(echo "$entry" | cut -d'|' -f4)
    DESC=$(echo "$entry" | cut -d'|' -f5)

    generate_portrait "$ID" "$NAME" "$CIV" "$ERA" "$DESC" $SEED

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

echo "=== DOWNLOADING PORTRAITS ==="
SUCCESS=0
for entry in "${LEADERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    NAME=$(echo "$entry" | cut -d'|' -f2)

    curl -s "$COMFY_URL/view?filename=${ID}_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}.png"

    if [ -s "$OUTPUT_DIR/${ID}.png" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/${ID}.png" 2>/dev/null)
        SIZE_KB=$((SIZE / 1024))
        echo "  $NAME: OK (${SIZE_KB}KB)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $NAME: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "LEADER GENERATION COMPLETE: $SUCCESS/11"
echo "=============================================="
