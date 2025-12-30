#!/bin/bash
# Regenerate failed building references with improved prompts
# Key fixes: single solid objects, no hollow centers, simplified geometry

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/buildings"

# Improved prompts that address the failure modes:
# - Emphasize SINGLE object
# - Avoid hollow/ring shapes
# - Simplify complex structures
# - Request solid, chunky forms

declare -A IMPROVED_PROMPTS

# Arena: Make it a SOLID amphitheater, not hollow ring
IMPROVED_PROMPTS["building_arena"]="single solid Roman amphitheater building, stone stadium with solid base, chunky architectural mass, isometric view, game asset, white background"

# Barracks: Simple solid building
IMPROVED_PROMPTS["building_barracks"]="single solid military barracks building, rectangular stone block structure with tiled roof, Roman army quarters, isometric view, game asset, white background"

# Cathedral: Romanesque instead of Gothic, less spires
IMPROVED_PROMPTS["building_cathedral"]="single solid Romanesque cathedral, chunky stone church with round arches and dome, thick walls, simplified architecture, isometric view, game asset, white background"

# Granary: Simple solid storage building
IMPROVED_PROMPTS["building_granary"]="single solid ancient granary building, cylindrical stone grain silo with conical roof, chunky proportions, isometric view, game asset, white background"

# Hospital: Solid Victorian building
IMPROVED_PROMPTS["building_hospital"]="single solid Victorian hospital building, rectangular brick structure with cross symbol, chunky architectural block, isometric view, game asset, white background"

# Monument: ONE obelisk only
IMPROVED_PROMPTS["building_monument"]="single Egyptian obelisk monument, tall stone pillar with pyramid top on square base, solid chunky form, isometric view, game asset, white background, one object only"

# Walls: Solid gatehouse tower, not hollow walls
IMPROVED_PROMPTS["building_walls"]="single solid medieval gatehouse tower, stone fortification block with crenellations, chunky defensive structure, isometric view, game asset, white background"

# Workshop: Simple solid workshop building
IMPROVED_PROMPTS["building_workshop"]="single solid medieval workshop building, stone and timber craftsman house with chimney, chunky architectural block, isometric view, game asset, white background"

# Machu Picchu: Single temple building, not whole citadel
IMPROVED_PROMPTS["wonder_machu_picchu"]="single solid Incan stone temple, trapezoidal doorway, chunky stone block construction, Machu Picchu style, isometric view, game asset, white background"

# Notre Dame: Simplified, chunkier version
IMPROVED_PROMPTS["wonder_notre_dame"]="single solid Notre Dame cathedral, simplified Gothic church with two square towers and rose window, chunky stone mass, isometric view, game asset, white background"

# Petra: Front facade as solid block
IMPROVED_PROMPTS["wonder_petra"]="single solid Petra Treasury facade, Nabataean temple front carved in rock, thick columned structure, chunky sandstone block, isometric view, game asset, white background"

# Stonehenge: Single trilithon (two uprights + lintel)
IMPROVED_PROMPTS["wonder_stonehenge"]="single solid stone trilithon monument, two upright megaliths with horizontal lintel on top, ancient standing stones, chunky solid form, isometric view, game asset, white background"

generate_reference() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "${PROMPT}", "text_l": "single solid building, isometric game asset, clean design", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "multiple objects, hollow center, thin spires, scattered elements, ring shape, text, watermark, blurry", "text_l": "bad quality, multiple buildings, hollow", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 30, "cfg": 7.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_ref_v2"}}
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
echo "REGENERATING FAILED BUILDING REFERENCES"
echo "=============================================="
echo "Using improved prompts to fix:"
echo "  - Single solid objects (not multiple)"
echo "  - No hollow centers"
echo "  - Simplified chunky geometry"
echo ""

SEED=85000

# Generate improved references
for ID in building_arena building_barracks building_cathedral building_granary building_hospital building_monument building_walls building_workshop wonder_machu_picchu wonder_notre_dame wonder_petra wonder_stonehenge; do
    PROMPT="${IMPROVED_PROMPTS[$ID]}"
    if [ -n "$PROMPT" ]; then
        RESULT=$(generate_reference "$ID" "$PROMPT" $SEED)
        echo "  $ID: $RESULT"
        SEED=$((SEED + 1))
    else
        echo "  $ID: NO PROMPT DEFINED"
    fi
done

echo ""
echo "Waiting for generation..."
wait_for_queue

echo ""
echo "=============================================="
echo "DOWNLOADING IMPROVED REFERENCES"
echo "=============================================="

SUCCESS=0
for ID in building_arena building_barracks building_cathedral building_granary building_hospital building_monument building_walls building_workshop wonder_machu_picchu wonder_notre_dame wonder_petra wonder_stonehenge; do
    # Download new reference (v2)
    curl -s "$COMFY_URL/view?filename=${ID}_ref_v2_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}_ref_v2.png"

    if [ -s "$OUTPUT_DIR/${ID}_ref_v2.png" ]; then
        # Backup old reference and replace
        if [ -f "$OUTPUT_DIR/${ID}_ref.png" ]; then
            mv "$OUTPUT_DIR/${ID}_ref.png" "$OUTPUT_DIR/${ID}_ref_old.png"
        fi
        cp "$OUTPUT_DIR/${ID}_ref_v2.png" "$OUTPUT_DIR/${ID}_ref.png"
        echo "  $ID: OK"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "SUMMARY: $SUCCESS/12 improved references generated"
echo "=============================================="
