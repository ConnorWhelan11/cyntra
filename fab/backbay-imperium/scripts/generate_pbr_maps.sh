#!/bin/bash
# Generate PBR maps (normal, roughness, height) for materials

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/materials"

# Material prompts (same as basecolor but for different map types)
MATERIALS=(
    "mat_grass_lush|lush green grass meadow"
    "mat_grass_dry|dry yellow brown grass"
    "mat_grass_wild|wild meadow grass with flowers"
    "mat_dirt_forest|forest floor dirt with leaves"
    "mat_dirt_dry|dry cracked earth"
    "mat_sand_beach|fine beach sand"
    "mat_sand_desert|desert sand dunes"
    "mat_gravel_path|gravel path with pebbles"
    "mat_rock_granite|gray granite rock"
    "mat_rock_limestone|white limestone rock"
    "mat_snow_fresh|fresh white snow"
    "mat_snow_packed|packed snow"
    "mat_mud_wet|wet mud"
    "mat_water_shallow|shallow water"
    "mat_water_deep|deep ocean water"
    "mat_brick_red|red brick wall"
    "mat_brick_ancient|ancient mud brick"
    "mat_stone_castle|medieval castle stone"
    "mat_stone_roman|Roman travertine stone"
    "mat_marble_white|white Carrara marble"
    "mat_marble_green|verde antico marble"
    "mat_plaster_white|white plaster wall"
    "mat_stucco_terracotta|terracotta stucco"
    "mat_tiles_terracotta|terracotta roof tiles"
    "mat_tiles_slate|slate roof tiles"
    "mat_wood_oak|oak wood planks"
    "mat_wood_walnut|dark walnut wood"
    "mat_wood_pine|pine wood boards"
    "mat_wood_weathered|weathered wood"
    "mat_wood_painted|white painted wood"
    "mat_bamboo_woven|woven bamboo mat"
    "mat_bronze_polished|polished bronze metal"
    "mat_bronze_patina|aged bronze with patina"
    "mat_iron_forged|forged iron"
    "mat_iron_rust|rusty iron"
    "mat_gold_ornate|ornate gold surface"
    "mat_silver_tarnished|tarnished silver"
    "mat_leather_brown|brown leather"
    "mat_linen_natural|natural linen fabric"
    "mat_silk_red|red silk fabric"
    "mat_wool_rough|rough wool fabric"
    "mat_canvas_military|military canvas"
)

generate_map() {
    local MAT_ID=$1
    local BASE_PROMPT=$2
    local MAP_TYPE=$3
    local SEED=$4

    # Adjust prompt based on map type
    case $MAP_TYPE in
        normal)
            FULL_PROMPT="normal map texture of ${BASE_PROMPT}, purple and blue tones, smooth gradients, seamless tileable, 3D surface normals, bump map style"
            NEG_PROMPT="photo, realistic colors, red, green, yellow, text, watermark"
            ;;
        roughness)
            FULL_PROMPT="roughness map texture of ${BASE_PROMPT}, grayscale, white is rough black is smooth, seamless tileable, PBR material map"
            NEG_PROMPT="color, photo, text, watermark, blue, red, green"
            ;;
        height)
            FULL_PROMPT="height map displacement texture of ${BASE_PROMPT}, grayscale, white is high black is low, seamless tileable, PBR material map"
            NEG_PROMPT="color, photo, text, watermark, blue, red, green"
            ;;
    esac

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "${FULL_PROMPT}", "text_l": "${MAP_TYPE} map, PBR texture", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "${NEG_PROMPT}", "text_l": "bad quality", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 25, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${MAT_ID}_${MAP_TYPE}"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id','error')[:8])" 2>/dev/null || echo "error"
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

download_map() {
    local MAT_ID=$1
    local MAP_TYPE=$2
    curl -s "$COMFY_URL/view?filename=${MAT_ID}_${MAP_TYPE}_00001_.png&type=output" -o "$OUTPUT_DIR/${MAT_ID}_${MAP_TYPE}.png"
    if [ -s "$OUTPUT_DIR/${MAT_ID}_${MAP_TYPE}.png" ]; then
        echo "OK"
    else
        echo "FAIL"
    fi
}

echo "=============================================="
echo "GENERATING PBR MAPS"
echo "=============================================="
echo "Materials: ${#MATERIALS[@]}"
echo "Map types: normal, roughness, height"
echo ""

SEED=70000
BATCH_SIZE=10
COUNT=0

for MAP_TYPE in normal roughness height; do
    echo "=== Generating $MAP_TYPE maps ==="
    COUNT=0

    for entry in "${MATERIALS[@]}"; do
        MAT_ID=$(echo "$entry" | cut -d'|' -f1)
        PROMPT=$(echo "$entry" | cut -d'|' -f2)

        RESULT=$(generate_map "$MAT_ID" "$PROMPT" "$MAP_TYPE" $SEED)
        echo "  ${MAT_ID}_${MAP_TYPE}: $RESULT"

        SEED=$((SEED + 1))
        COUNT=$((COUNT + 1))

        if [ $((COUNT % BATCH_SIZE)) -eq 0 ]; then
            echo "  Waiting for batch..."
            wait_for_queue
        fi
    done

    echo "  Waiting for final batch..."
    wait_for_queue
    echo "  Done with $MAP_TYPE maps!"
    echo ""
done

echo "=============================================="
echo "DOWNLOADING PBR MAPS"
echo "=============================================="

for MAP_TYPE in normal roughness height; do
    echo "=== $MAP_TYPE ==="
    SUCCESS=0
    for entry in "${MATERIALS[@]}"; do
        MAT_ID=$(echo "$entry" | cut -d'|' -f1)
        RESULT=$(download_map "$MAT_ID" "$MAP_TYPE")
        if [ "$RESULT" = "OK" ]; then
            SUCCESS=$((SUCCESS + 1))
        fi
    done
    echo "  Downloaded: $SUCCESS/${#MATERIALS[@]}"
done

echo ""
echo "=============================================="
echo "PBR MAP GENERATION COMPLETE"
echo "=============================================="
