#!/bin/bash
# Generate ~70 technology icons for Backbay Imperium tech tree

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/tech"
mkdir -p "$OUTPUT_DIR"

# Tech definitions by era: id|era|description
TECHS=(
    # Ancient Era
    "tech_agriculture|ancient|wheat sheaf with farming tools, wooden hoe"
    "tech_pottery|ancient|clay pot and amphora vessels"
    "tech_animal_husbandry|ancient|horse head with rope bridle"
    "tech_mining|ancient|pickaxe with ore rocks"
    "tech_sailing|ancient|simple wooden boat with sail"
    "tech_archery|ancient|bow and arrows crossed"
    "tech_writing|ancient|scroll with quill pen"
    "tech_bronze_working|ancient|bronze sword and shield"
    "tech_the_wheel|ancient|wooden cart wheel"
    "tech_masonry|ancient|stone blocks stacked"

    # Classical Era
    "tech_calendar|classical|sun dial with numbers"
    "tech_iron_working|classical|iron anvil with hammer"
    "tech_mathematics|classical|compass and geometric shapes"
    "tech_construction|classical|stone arch bridge"
    "tech_philosophy|classical|greek column with scroll"
    "tech_currency|classical|gold coins stacked"
    "tech_engineering|classical|aqueduct structure"
    "tech_horseback_riding|classical|horse saddle and reins"

    # Medieval Era
    "tech_theology|medieval|cathedral window cross"
    "tech_civil_service|medieval|royal seal stamp"
    "tech_guilds|medieval|craftsman tools hammer saw"
    "tech_metal_casting|medieval|molten metal cauldron"
    "tech_compass|medieval|navigation compass rose"
    "tech_education|medieval|open book with candle"
    "tech_chivalry|medieval|knight helmet with plume"
    "tech_machinery|medieval|gear wheels cogs"
    "tech_physics|medieval|pendulum and weights"
    "tech_steel|medieval|steel sword blade"

    # Renaissance Era
    "tech_astronomy|renaissance|telescope with stars"
    "tech_acoustics|renaissance|lute musical instrument"
    "tech_banking|renaissance|money chest with ledger"
    "tech_printing_press|renaissance|printing press machine"
    "tech_gunpowder|renaissance|cannon barrel with powder"
    "tech_chemistry|renaissance|alchemist flask beakers"
    "tech_architecture|renaissance|dome building blueprint"
    "tech_economics|renaissance|trade balance scales"

    # Industrial Era
    "tech_scientific_theory|industrial|atom model structure"
    "tech_steam_power|industrial|steam engine locomotive"
    "tech_military_science|industrial|military map compass"
    "tech_fertilizer|industrial|farm field growing"
    "tech_rifling|industrial|rifle barrel spiral"
    "tech_dynamite|industrial|dynamite sticks bundle"
    "tech_electricity|industrial|lightning bolt bulb"
    "tech_railroad|industrial|train tracks rails"
    "tech_biology|industrial|microscope cells"
    "tech_industrialization|industrial|factory smokestacks"

    # Modern Era
    "tech_flight|modern|airplane propeller wings"
    "tech_radio|modern|radio tower waves"
    "tech_combustion|modern|car engine pistons"
    "tech_plastics|modern|plastic bottles items"
    "tech_refrigeration|modern|refrigerator ice crystals"
    "tech_penicillin|modern|medicine pill syringe"
    "tech_atomic_theory|modern|nuclear atom symbol"
    "tech_electronics|modern|circuit board chips"
    "tech_radar|modern|radar dish antenna"
    "tech_combined_arms|modern|tank plane ship"

    # Information Era
    "tech_computers|information|computer monitor keyboard"
    "tech_telecommunications|information|satellite phone"
    "tech_robotics|information|robot arm mechanical"
    "tech_lasers|information|laser beam lens"
    "tech_internet|information|network globe connections"
    "tech_nanotechnology|information|nano particles microscopic"
    "tech_particle_physics|information|hadron collider ring"
    "tech_nuclear_fusion|information|fusion reactor sun"
    "tech_stealth|information|stealth fighter jet"
    "tech_future_tech|information|hologram futuristic"
)

generate_icon() {
    local ID=$1
    local ERA=$2
    local DESC=$3
    local SEED=$4

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "technology icon of ${DESC}, game UI icon style, circular badge design, metallic frame, glowing center, ${ERA} era aesthetic, centered on dark background, single icon, clean design", "text_l": "game tech icon, circular badge, ${ERA}", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "multiple icons, blurry, text, watermark, realistic photo, people", "text_l": "multiple blurry text", "width": 512, "height": 512, "crop_w": 0, "crop_h": 0, "target_width": 512, "target_height": 512, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 25, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
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
echo "GENERATING ${#TECHS[@]} TECH ICONS"
echo "=============================================="
echo ""

SEED=500000
BATCH_SIZE=10
COUNT=0

for entry in "${TECHS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    ERA=$(echo "$entry" | cut -d'|' -f2)
    DESC=$(echo "$entry" | cut -d'|' -f3)

    generate_icon "$ID" "$ERA" "$DESC" $SEED
    echo "  $ID ($ERA)"

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
for entry in "${TECHS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_00001_.png&type=output" -o "$OUTPUT_DIR/${ID}.png"
    if [ -s "$OUTPUT_DIR/${ID}.png" ]; then
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "TECH ICONS COMPLETE: $SUCCESS/${#TECHS[@]}"
echo "=============================================="
