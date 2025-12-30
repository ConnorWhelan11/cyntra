#!/bin/bash
# Generate 12 civilization emblems matching our leaders

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/civs"
mkdir -p "$OUTPUT_DIR"

# Civ definitions: id|name|emblem description
CIVS=(
    "civ_america|America|bald eagle with spread wings, stars and stripes banner, red white blue colors"
    "civ_england|England|royal lion rampant, red and gold colors, crown, Tudor rose"
    "civ_france|France|fleur-de-lis golden lily, blue and gold colors, royal crest"
    "civ_germany|Germany|black eagle imperial symbol, iron cross, black red gold colors"
    "civ_india|India|ashoka chakra wheel, lotus flower, saffron white green colors"
    "civ_aztec|Aztec|feathered serpent Quetzalcoatl, sun stone calendar, turquoise gold"
    "civ_egypt|Egypt|eye of Horus, ankh symbol, golden pharaoh mask, blue gold"
    "civ_greece|Greece|owl of Athena, olive wreath, blue white colors, Greek key pattern"
    "civ_mongolia|Mongolia|soyombo symbol, horse archer, blue and red colors"
    "civ_rome|Rome|SPQR eagle standard, laurel wreath, red and gold, Roman numerals"
    "civ_china|China|dragon symbol, red and gold colors, yin yang, imperial seal"
    "civ_japan|Japan|rising sun, cherry blossom, red and white, samurai mon crest"
)

generate_emblem() {
    local ID=$1
    local NAME=$2
    local DESC=$3
    local SEED=$4

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "civilization emblem coat of arms for ${NAME}, ${DESC}, heraldic shield design, ornate frame, medieval banner style, game icon, centered on dark background, single emblem", "text_l": "heraldic emblem, coat of arms, game icon", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "multiple emblems, blurry, text, watermark, realistic photo, people, flag waving", "text_l": "multiple blurry text photo", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 30, "cfg": 8.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}"}}
}
EOF
)

    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" > /dev/null
}

wait_for_queue() {
    while true; do
        QUEUE=$(curl -s "$COMFY_URL/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{len(d.get('queue_running',[]))} {len(d.get('queue_pending',[]))}\")" 2>/dev/null)
        RUNNING=$(echo $QUEUE | cut -d' ' -f1)
        PENDING=$(echo $QUEUE | cut -d' ' -f2)
        if [ "$RUNNING" = "0" ] && [ "$PENDING" = "0" ]; then break; fi
        echo "    Queue: $RUNNING running, $PENDING pending..."
        sleep 3
    done
}

echo "=============================================="
echo "GENERATING 12 CIVILIZATION EMBLEMS"
echo "=============================================="
echo ""

SEED=700000
for entry in "${CIVS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    NAME=$(echo "$entry" | cut -d'|' -f2)
    DESC=$(echo "$entry" | cut -d'|' -f3)

    generate_emblem "$ID" "$NAME" "$DESC" $SEED
    echo "  $ID ($NAME)"
    SEED=$((SEED + 1))
done

echo "  Waiting..."
wait_for_queue
echo ""

echo "=== DOWNLOADING EMBLEMS ==="
SUCCESS=0
for entry in "${CIVS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    NAME=$(echo "$entry" | cut -d'|' -f2)
    curl -s "$COMFY_URL/view?filename=${ID}_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}.png"
    if [ -s "$OUTPUT_DIR/${ID}.png" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/${ID}.png" 2>/dev/null)
        echo "  $NAME: OK ($((SIZE/1024))KB)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $NAME: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "CIV EMBLEMS COMPLETE: $SUCCESS/12"
echo "=============================================="
