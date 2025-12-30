#!/bin/bash
# Generate terrain hex tile reference images for Backbay Imperium

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/terrain"
mkdir -p "$OUTPUT_DIR"

# Terrain definitions: id|prompt
TERRAINS=(
    # Base terrain (10 types)
    "terrain_plains|flat grassland terrain, golden wheat grass, gentle rolling hills, hexagonal tile"
    "terrain_grassland|lush green grassland, thick grass meadow, wildflowers scattered, hexagonal tile"
    "terrain_hills|elevated rocky hills terrain, grass covered slopes, stone outcrops, hexagonal tile"
    "terrain_mountains|dramatic mountain peaks, snow capped rocky summits, impassable cliffs, hexagonal tile"
    "terrain_desert|sandy desert terrain, golden dunes, arid wasteland, scattered rocks, hexagonal tile"
    "terrain_tundra|frozen tundra terrain, snow patches, sparse dead vegetation, permafrost, hexagonal tile"
    "terrain_coast|coastal beach terrain, sandy shore, gentle waves lapping, tide pools, hexagonal tile"
    "terrain_ocean|deep ocean water, dark blue waves, open sea texture, hexagonal tile"
    "terrain_marsh|swampy marsh terrain, murky water, reeds and cattails, muddy ground, hexagonal tile"
    "terrain_jungle|dense tropical jungle, thick canopy, vines and ferns, humid forest floor, hexagonal tile"
    # Features (6 types)
    "feature_forest_deciduous|deciduous forest trees, oak and maple, autumn colors, hexagonal tile overlay"
    "feature_forest_conifer|conifer forest, pine and spruce trees, evergreen, northern forest, hexagonal tile"
    "feature_oasis|desert oasis, palm trees, small pool of water, green vegetation, hexagonal tile"
    "feature_volcanic|volcanic terrain, black basalt rock, lava cracks glowing, steam vents, hexagonal tile"
    "feature_river|river segment, flowing water, riverbanks with grass, hexagonal tile"
    "feature_ice|ice sheet, frozen water, cracked ice surface, arctic, hexagonal tile"
)

generate_terrain() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "isometric view of ${PROMPT}, game asset, clean hexagonal shape, strategy game tile, top-down perspective, warm earth tones, classical style", "text_l": "${PROMPT}, isometric hex tile, game asset", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "text, watermark, blurry, distorted, realistic photo, multiple tiles", "text_l": "bad quality, photo", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 25, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id','error')[:12])" 2>/dev/null || echo "error"
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
echo "GENERATING TERRAIN HEX TILES"
echo "=============================================="

SEED=60000

for entry in "${TERRAINS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)
    RESULT=$(generate_terrain "$ID" "$PROMPT" $SEED)
    echo "  $ID: $RESULT"
    SEED=$((SEED + 1))
done

echo "  Waiting for terrain generation..."
wait_for_queue
echo "  Done!"

echo ""
echo "=============================================="
echo "DOWNLOADING TERRAIN TILES"
echo "=============================================="

SUCCESS=0
TOTAL=0

for entry in "${TERRAINS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}.png"
    if [ -s "$OUTPUT_DIR/${ID}.png" ]; then
        echo "  $ID: OK"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
    TOTAL=$((TOTAL + 1))
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/$TOTAL terrain tiles generated"
echo "=============================================="
