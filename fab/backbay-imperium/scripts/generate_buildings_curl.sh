#!/bin/bash
# Generate all buildings and wonders for Backbay Imperium using Hunyuan3D

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/buildings"
mkdir -p "$OUTPUT_DIR"

# Building definitions: id|prompt
BUILDINGS=(
    # Ancient Era (5)
    "building_monument|stone obelisk monument, ancient Egyptian style, hieroglyphic carvings, granite"
    "building_granary|ancient grain storage building, mud brick construction, large storage jars, wooden roof"
    "building_shrine|small religious shrine, stone altar, offering bowls, sacred flame, ancient temple style"
    "building_walls|ancient city walls, stone fortification, crenellated battlements, watchtower, gate"
    "building_barracks|military barracks, training grounds, weapon racks, soldier quarters, ancient Roman style"
    # Classical Era (5)
    "building_library|ancient library, scroll shelves, reading alcoves, columns, Alexandria style, scholars"
    "building_market|ancient marketplace, covered stalls, merchant goods, columns, busy bazaar"
    "building_temple|classical Greek temple, Doric columns, triangular pediment, marble, sacred space"
    "building_arena|Roman arena colosseum, tiered seating, oval shape, gladiatorial, grand architecture"
    "building_aqueduct|Roman aqueduct, stone arches, water channel, engineering marvel, hillside"
    # Medieval Era (4)
    "building_university|medieval university, Gothic architecture, lecture halls, courtyard, Oxford style"
    "building_cathedral|Gothic cathedral, flying buttresses, rose window, tall spires, medieval grandeur"
    "building_castle|medieval stone castle, keep, curtain walls, towers, moat, drawbridge"
    "building_workshop|medieval craftsman workshop, forges, workbenches, tools, guild hall"
    # Renaissance Era (3)
    "building_bank|Renaissance bank building, ornate facade, vault, Medici style, grand entrance"
    "building_arsenal|military arsenal, cannon storage, ammunition depot, shipyard, Venice style"
    "building_theater|Renaissance theater, ornate stage, balconies, red curtains, Globe theatre style"
    # Industrial Era (3)
    "building_factory|industrial revolution factory, smokestacks, brick building, machinery, workers"
    "building_hospital|Victorian hospital, medical ward, red cross, Florence Nightingale era"
    "building_railroad|Victorian train station, platform, steam locomotive, grand hall, clock tower"
    # Modern Era (3)
    "building_research_lab|modern research laboratory, scientific equipment, computers, clean room"
    "building_stadium|modern sports stadium, seating bowl, field, floodlights, Olympic style"
    "building_airport|modern airport terminal, control tower, runway, aircraft, glass and steel"
)

WONDERS=(
    "wonder_pyramids|Great Pyramids of Giza, three massive pyramids, desert setting, Sphinx, ancient Egypt"
    "wonder_stonehenge|Stonehenge stone circle, ancient megaliths, Salisbury Plain, mystical, dawn light"
    "wonder_great_library|Great Library of Alexandria, massive building, scrolls, scholars, columns, Egyptian-Greek"
    "wonder_colosseum|Roman Colosseum, massive amphitheater, arches, gladiators, ancient Rome, dramatic"
    "wonder_oracle|Oracle of Delphi, Greek temple, mountain setting, sacred grove, priestess, mystical"
    "wonder_petra|Petra Treasury, carved rock facade, Nabataean, rose-red city, desert canyon"
    "wonder_notre_dame|Notre Dame Cathedral Paris, Gothic architecture, flying buttresses, rose window, dramatic"
    "wonder_forbidden_palace|Forbidden City Beijing, red walls, golden roofs, imperial Chinese architecture, massive"
    "wonder_machu_picchu|Machu Picchu, Incan citadel, mountain terraces, dramatic Andes peaks, ancient ruins"
    "wonder_sistine_chapel|Sistine Chapel, Michelangelo ceiling, Vatican, Renaissance art, dramatic frescoes"
    "wonder_big_ben|Big Ben clock tower, Houses of Parliament, London, Victorian Gothic, Thames river"
    "wonder_statue_liberty|Statue of Liberty, copper green, torch raised, New York harbor, freedom symbol"
)

# First generate reference images for each building using SDXL
generate_reference() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "isometric view of ${PROMPT}, game asset, clean design, white background, architectural illustration", "text_l": "${PROMPT}, isometric, game asset", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "text, watermark, blurry, distorted, multiple buildings", "text_l": "bad quality", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 25, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_ref"}}
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
echo "GENERATING BUILDING REFERENCE IMAGES"
echo "=============================================="

SEED=50000

# Generate building references
for entry in "${BUILDINGS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)
    RESULT=$(generate_reference "$ID" "$PROMPT" $SEED)
    echo "  $ID: $RESULT"
    SEED=$((SEED + 1))
done

echo "  Waiting for building references..."
wait_for_queue
echo "  Done!"

echo ""
echo "=============================================="
echo "GENERATING WONDER REFERENCE IMAGES"
echo "=============================================="

# Generate wonder references
for entry in "${WONDERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)
    RESULT=$(generate_reference "$ID" "$PROMPT" $SEED)
    echo "  $ID: $RESULT"
    SEED=$((SEED + 1))
done

echo "  Waiting for wonder references..."
wait_for_queue
echo "  Done!"

echo ""
echo "=============================================="
echo "DOWNLOADING REFERENCE IMAGES"
echo "=============================================="

SUCCESS=0
TOTAL=0

for entry in "${BUILDINGS[@]}" "${WONDERS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_ref_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}_ref.png"
    if [ -s "$OUTPUT_DIR/${ID}_ref.png" ]; then
        echo "  $ID: OK"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
    TOTAL=$((TOTAL + 1))
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/$TOTAL reference images generated"
echo "=============================================="
echo ""
echo "Note: Full 3D mesh generation requires uploading"
echo "references to ComfyUI input folder, which is not"
echo "supported in this batch script. Reference images"
echo "can be used for Hunyuan3D generation manually or"
echo "via a more advanced pipeline."
