#!/bin/bash
# Render terrain hex tiles from 8 angles for game sprites
# Uses SDXL on RTX 4090

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
INPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/terrain"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/terrain/sprites"
mkdir -p "$OUTPUT_DIR"

# 8 rotation angles for isometric view (N, NE, E, SE, S, SW, W, NW)
ANGLES=("north" "northeast" "east" "southeast" "south" "southwest" "west" "northwest")
ANGLE_DEGREES=(0 45 90 135 180 225 270 315)

# Terrain definitions
TERRAINS=(
    "terrain_plains|flat grassland, golden wheat"
    "terrain_grassland|lush green meadow"
    "terrain_hills|rocky hills with grass"
    "terrain_mountains|dramatic mountain peaks, snow"
    "terrain_desert|sandy desert dunes"
    "terrain_tundra|frozen tundra, snow patches"
    "terrain_coast|sandy beach, waves"
    "terrain_ocean|deep blue ocean water"
    "terrain_marsh|swampy marsh, reeds"
    "terrain_jungle|dense tropical jungle"
    "feature_forest_deciduous|deciduous forest, oak maple"
    "feature_forest_conifer|evergreen pine forest"
    "feature_oasis|desert oasis, palm trees"
    "feature_volcanic|volcanic terrain, lava"
    "feature_river|flowing river, banks"
    "feature_ice|arctic ice sheet"
)

generate_sprite() {
    local ID=$1
    local PROMPT=$2
    local ANGLE=$3
    local ANGLE_DEG=$4
    local SEED=$5

    local WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "isometric hexagonal game tile of ${PROMPT}, viewed from ${ANGLE} direction, rotated ${ANGLE_DEG} degrees, clean hexagon shape, strategy game asset, warm classical tones, top-down perspective", "text_l": "${PROMPT}, hex tile, isometric ${ANGLE} view, game sprite", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "text, watermark, blurry, multiple tiles, photo, realistic", "text_l": "bad quality", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 20, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_${ANGLE}"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WORKFLOW}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id','error')[:8])" 2>/dev/null || echo "error"
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
        sleep 5
    done
}

echo "=============================================="
echo "GENERATING TERRAIN SPRITES (8 ANGLES)"
echo "=============================================="
echo "Terrains: ${#TERRAINS[@]}"
echo "Angles: 8 (N, NE, E, SE, S, SW, W, NW)"
echo "Total sprites: $((${#TERRAINS[@]} * 8))"
echo ""

SEED=90000
BATCH_SIZE=16
COUNT=0

for entry in "${TERRAINS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)

    echo "=== $ID ==="

    for i in 0 1 2 3 4 5 6 7; do
        ANGLE=${ANGLES[$i]}
        ANGLE_DEG=${ANGLE_DEGREES[$i]}

        RESULT=$(generate_sprite "$ID" "$PROMPT" "$ANGLE" "$ANGLE_DEG" $SEED)
        echo "  $ANGLE: $RESULT"

        SEED=$((SEED + 1))
        COUNT=$((COUNT + 1))

        if [ $((COUNT % BATCH_SIZE)) -eq 0 ]; then
            echo "  Waiting for batch..."
            wait_for_queue
        fi
    done
done

echo ""
echo "Waiting for final batch..."
wait_for_queue
echo ""

echo "=============================================="
echo "DOWNLOADING SPRITES"
echo "=============================================="

SUCCESS=0
TOTAL=0

for entry in "${TERRAINS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)

    for i in 0 1 2 3 4 5 6 7; do
        ANGLE=${ANGLES[$i]}

        curl -s "$COMFY_URL/view?filename=${ID}_${ANGLE}_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}_${ANGLE}.png"

        if [ -s "$OUTPUT_DIR/${ID}_${ANGLE}.png" ]; then
            SUCCESS=$((SUCCESS + 1))
        fi
        TOTAL=$((TOTAL + 1))
    done

    echo "  $ID: downloaded"
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/$TOTAL terrain sprites generated"
echo "=============================================="
