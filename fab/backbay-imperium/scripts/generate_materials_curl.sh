#!/bin/bash
# Generate all 45 PBR materials for Backbay Imperium

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/materials"
mkdir -p "$OUTPUT_DIR"

# Material definitions: id|prompt
MATERIALS=(
    # Terrain Materials (15)
    "mat_grass_lush|lush green grass meadow, thick blades, natural color variation, some clovers"
    "mat_grass_dry|dry yellow brown grass, autumn prairie, dead patches, hay-like"
    "mat_grass_wild|wild meadow grass, mixed flowers, dandelions, natural overgrown"
    "mat_dirt_forest|forest floor dirt, scattered leaves and twigs, dark brown humus"
    "mat_dirt_dry|dry cracked earth, drought soil, parched ground, cracks"
    "mat_sand_beach|fine beach sand, golden yellow, subtle ripples, wave patterns"
    "mat_sand_desert|desert sand, golden dunes texture, windswept patterns, Sahara"
    "mat_gravel_path|gravel path, mixed pebbles, gray and brown stones, pathway"
    "mat_rock_granite|gray granite rock surface, natural cracks, rough texture"
    "mat_rock_limestone|white limestone rock, sedimentary layers, fossil imprints"
    "mat_snow_fresh|fresh white snow, powder texture, sparkly, pristine winter"
    "mat_snow_packed|packed snow, compressed, ice crystals visible, footprint texture"
    "mat_mud_wet|wet mud, dark brown, puddles, waterlogged soil"
    "mat_water_shallow|shallow water surface, clear, sandy bottom visible, caustics"
    "mat_water_deep|deep ocean water, dark blue, wave patterns, mysterious depths"
    # Architecture Materials (10)
    "mat_brick_red|classic red brick wall, white mortar lines, slightly weathered"
    "mat_brick_ancient|ancient mud brick, sun-baked clay, crumbling edges, Mesopotamian"
    "mat_stone_castle|medieval castle stone blocks, large cut stones, moss in cracks"
    "mat_stone_roman|Roman travertine stone, warm cream color, ancient architecture"
    "mat_marble_white|white Carrara marble, elegant veining, polished, classical"
    "mat_marble_green|verde antico marble, dark green with white veins, Roman"
    "mat_plaster_white|white painted plaster wall, subtle texture, Mediterranean"
    "mat_stucco_terracotta|terracotta stucco exterior, warm orange, Italian villa style"
    "mat_tiles_terracotta|terracotta roof tiles, overlapping pattern, warm orange red"
    "mat_tiles_slate|slate roof tiles, dark gray, layered pattern, traditional"
    # Wood Materials (6)
    "mat_wood_oak|oak wood floor planks, warm honey tone, visible grain pattern"
    "mat_wood_walnut|dark walnut wood, rich brown, elegant grain, furniture quality"
    "mat_wood_pine|fresh pine wood boards, light blonde color, visible knots"
    "mat_wood_weathered|old weathered wood, gray patina, cracked and worn, driftwood"
    "mat_wood_painted|white painted wood boards, slightly chipped, farmhouse style"
    "mat_bamboo_woven|woven bamboo mat texture, natural tan color, tight weave"
    # Metal Materials (6)
    "mat_bronze_polished|polished bronze metal, warm golden tone, ancient metalwork"
    "mat_bronze_patina|aged bronze with green patina, verdigris oxidation, antique"
    "mat_iron_forged|forged iron, dark gray, hammer marks, blacksmith work"
    "mat_iron_rust|rusty corroded iron, orange and brown patina, industrial decay"
    "mat_gold_ornate|ornate gold surface, engraved patterns, royal luxury, shiny"
    "mat_silver_tarnished|tarnished silver, slightly oxidized, antique silverware look"
    # Fabric Materials (5)
    "mat_leather_brown|brown leather texture, subtle grain, worn, saddle leather"
    "mat_linen_natural|natural linen fabric, cream color, visible weave"
    "mat_silk_red|red silk fabric, luxurious sheen, subtle folds, Chinese"
    "mat_wool_rough|rough wool fabric, natural gray, handwoven texture"
    "mat_canvas_military|military canvas, olive drab, heavy duty, tent material"
)

submit_material() {
    local MAT_ID=$1
    local PROMPT=$2
    local SEED=$3

    local WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "${PROMPT}, seamless tileable PBR material texture, top-down orthographic view, highly detailed, 8k", "text_l": "${PROMPT}, seamless tileable texture, photorealistic", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "text, watermark, logo, seams visible, repetitive pattern, low quality, blurry, grainy", "text_l": "bad quality, distorted", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 25, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${MAT_ID}"}}
}
EOF
)

    RESP=$(curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WORKFLOW}")

    echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id','error')[:12])" 2>/dev/null || echo "error"
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

download_material() {
    local MAT_ID=$1
    curl -s "$COMFY_URL/view?filename=${MAT_ID}_00001_.png&type=output" -o "$OUTPUT_DIR/${MAT_ID}_basecolor.png"
    if [ -s "$OUTPUT_DIR/${MAT_ID}_basecolor.png" ]; then
        echo "OK"
    else
        echo "FAILED"
    fi
}

echo "=============================================="
echo "GENERATING ${#MATERIALS[@]} MATERIALS"
echo "=============================================="
echo ""

SEED=42000
BATCH_SIZE=10
COUNT=0
BATCH=1

for entry in "${MATERIALS[@]}"; do
    MAT_ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)

    RESULT=$(submit_material "$MAT_ID" "$PROMPT" $SEED)
    echo "  $MAT_ID: $RESULT"

    SEED=$((SEED + 1))
    COUNT=$((COUNT + 1))

    if [ $((COUNT % BATCH_SIZE)) -eq 0 ]; then
        echo "  Waiting for batch $BATCH..."
        wait_for_queue
        echo "  Batch $BATCH complete!"
        BATCH=$((BATCH + 1))
    fi
done

# Wait for final batch
echo "  Waiting for final batch..."
wait_for_queue
echo "  Complete!"

echo ""
echo "=============================================="
echo "DOWNLOADING MATERIALS"
echo "=============================================="

SUCCESS=0
for entry in "${MATERIALS[@]}"; do
    MAT_ID=$(echo "$entry" | cut -d'|' -f1)
    RESULT=$(download_material "$MAT_ID")
    echo "  $MAT_ID: $RESULT"
    if [ "$RESULT" = "OK" ]; then
        SUCCESS=$((SUCCESS + 1))
    fi
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/${#MATERIALS[@]} materials generated"
echo "=============================================="
