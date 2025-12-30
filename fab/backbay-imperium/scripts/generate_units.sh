#!/bin/bash
# Generate 32 unit types for Backbay Imperium
# Each unit: reference image (SDXL) → 3D mesh (Hunyuan3D)

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/units"
mkdir -p "$OUTPUT_DIR/references" "$OUTPUT_DIR/meshes"

# Unit definitions: id|era|prompt
# Organized by era for historical accuracy
UNITS=(
    # === ANCIENT ERA (6 units) ===
    "unit_warrior|ancient|single ancient warrior soldier, bronze age infantry, leather armor, wooden shield, bronze sword, standing pose, muscular build"
    "unit_archer|ancient|single ancient archer, bronze age bowman, simple tunic, wooden longbow, quiver of arrows, aiming pose"
    "unit_spearman|ancient|single ancient spearman, bronze age hoplite, round shield, long spear, bronze helmet, defensive stance"
    "unit_chariot|ancient|single ancient war chariot, Egyptian style, two horses, archer platform, wooden wheels, gold trim"
    "unit_galley|ancient|single ancient galley ship, Greek trireme, wooden hull, single sail, row of oars, ram bow"
    "unit_slinger|ancient|single ancient slinger, primitive warrior, cloth wrap, leather sling, pouch of stones, throwing pose"

    # === CLASSICAL ERA (6 units) ===
    "unit_legion|classical|single Roman legionary soldier, lorica segmentata armor, rectangular scutum shield, gladius sword, red cape, plumed helmet"
    "unit_horseman|classical|single classical cavalry rider on horse, chainmail armor, cavalry sword, round shield, horse with saddle"
    "unit_catapult|classical|single Roman catapult siege weapon, wooden frame, twisted rope mechanism, large throwing arm, wheeled base"
    "unit_trireme|classical|single classical trireme warship, three rows of oars, bronze ram, large square sail, ornate bow"
    "unit_pikeman|classical|single Macedonian pikeman, sarissa long pike, small round shield, bronze cuirass, Corinthian helmet"

    # === MEDIEVAL ERA (6 units) ===
    "unit_knight|medieval|single medieval knight in full plate armor, great helm, kite shield with heraldry, longsword, mounted on armored horse"
    "unit_crossbowman|medieval|single medieval crossbowman, padded armor, steel crossbow, bolt quiver, aiming pose, pavise shield"
    "unit_trebuchet|medieval|single medieval trebuchet siege engine, massive wooden frame, counterweight, sling arm, wheeled platform"
    "unit_caravel|medieval|single medieval caravel sailing ship, three masts, lateen sails, wooden hull, raised stern castle"
    "unit_longbowman|medieval|single English longbowman, leather jerkin, tall longbow, arrow bag, drawing bow pose"
    "unit_mangonel|medieval|single medieval mangonel catapult, torsion powered, wooden frame, cup sling, siege weapon"

    # === RENAISSANCE ERA (5 units) ===
    "unit_musketeer|renaissance|single Renaissance musketeer soldier, matchlock musket, wide brim hat with feather, buff coat, bandolier"
    "unit_cannon|renaissance|single Renaissance bronze cannon, wheeled carriage, long barrel, ornate decorations, with cannonballs"
    "unit_frigate|renaissance|single Age of Sail frigate warship, three masts, square rigged sails, gun deck with cannons, wooden hull"
    "unit_conquistador|renaissance|single Spanish conquistador, morion helmet, steel cuirass, sword and buckler, mounted on horse"
    "unit_landsknecht|renaissance|single German Landsknecht mercenary, slashed colorful clothing, zweihander great sword, plumed hat"

    # === INDUSTRIAL ERA (5 units) ===
    "unit_rifleman|industrial|single Victorian era rifleman soldier, red coat uniform, rifle with bayonet, shako hat, standing at attention"
    "unit_artillery|industrial|single field artillery cannon, Civil War era, bronze barrel, wooden spoke wheels, limber"
    "unit_ironclad|industrial|single ironclad warship, USS Monitor style, rotating gun turret, iron plated hull, low profile, smokestack"
    "unit_cavalry|industrial|single industrial age cavalry, saber and pistol, kepi hat, blue uniform, horse with military saddle"

    # === MODERN ERA (4 units) ===
    "unit_infantry|modern|single modern infantry soldier, camouflage uniform, assault rifle, tactical helmet, body armor, combat boots"
    "unit_tank|modern|single modern main battle tank, M1 Abrams style, rotating turret, long cannon, tracked wheels, desert camo"
    "unit_fighter|modern|single modern fighter jet aircraft, F-22 style, twin engines, swept wings, missiles, sleek design"
    "unit_battleship|modern|single modern battleship warship, Iowa class style, large gun turrets, gray hull, radar arrays, massive"

    # === CIVILIAN UNITS (4 units) ===
    "unit_settler|civilian|single settler wagon, covered wagon with canvas top, wooden wheels, oxen pulling, supplies and barrels"
    "unit_worker|civilian|single worker laborer, simple clothes, pickaxe and shovel, tool belt, building pose"
    "unit_great_general|civilian|single military general on horseback, ornate uniform with medals, sword raised, commanding pose, white horse"
    "unit_missionary|civilian|single religious missionary, monk robes, holy book, cross staff, humble pose, sandals"
)

generate_reference() {
    local ID=$1
    local ERA=$2
    local PROMPT=$3
    local SEED=$4

    # Era-specific style modifiers
    case $ERA in
        ancient)
            STYLE="bronze age aesthetic, warm earth tones, Mediterranean style"
            ;;
        classical)
            STYLE="Greco-Roman aesthetic, marble and bronze, classical antiquity"
            ;;
        medieval)
            STYLE="medieval European aesthetic, iron and leather, feudal era"
            ;;
        renaissance)
            STYLE="Renaissance aesthetic, ornate details, early modern period"
            ;;
        industrial)
            STYLE="Victorian aesthetic, brass and steel, 19th century military"
            ;;
        modern)
            STYLE="modern military aesthetic, tactical gear, contemporary warfare"
            ;;
        civilian)
            STYLE="historical civilian aesthetic, practical clothing, utilitarian"
            ;;
    esac

    WORKFLOW=$(cat << EOF
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "3D render of ${PROMPT}, ${STYLE}, isometric view, game unit character, centered on pure white background, one character only, studio lighting, clean design, high detail", "text_l": "single game unit, 3D character model, isometric, white background", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "multiple figures, crowd, blurry, distorted, text, watermark, realistic photo, environment background", "text_l": "multiple, blurry, photo", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 30, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_ref"}}
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
        echo "    Queue: $RUNNING running, $PENDING pending..."
        sleep 5
    done
}

echo "=============================================="
echo "GENERATING 32 UNIT TYPES"
echo "=============================================="
echo "Units: ${#UNITS[@]}"
echo ""

# Phase 1: Generate reference images
echo "=== PHASE 1: REFERENCE IMAGES ==="
SEED=100000
BATCH_SIZE=8
COUNT=0

for entry in "${UNITS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    ERA=$(echo "$entry" | cut -d'|' -f2)
    PROMPT=$(echo "$entry" | cut -d'|' -f3)

    RESULT=$(generate_reference "$ID" "$ERA" "$PROMPT" $SEED)
    echo "  $ID ($ERA): $RESULT"

    SEED=$((SEED + 1))
    COUNT=$((COUNT + 1))

    if [ $((COUNT % BATCH_SIZE)) -eq 0 ]; then
        echo "  Waiting for batch..."
        wait_for_queue
    fi
done

echo "  Waiting for final batch..."
wait_for_queue
echo "  Reference generation complete!"
echo ""

# Download references
echo "=== DOWNLOADING REFERENCES ==="
SUCCESS=0
for entry in "${UNITS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    curl -s "$COMFY_URL/view?filename=${ID}_ref_00001_.png&type=output" -o "$OUTPUT_DIR/references/${ID}_ref.png"
    if [ -s "$OUTPUT_DIR/references/${ID}_ref.png" ]; then
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  $ID: FAILED"
    fi
done
echo "  Downloaded: $SUCCESS/${#UNITS[@]} references"
echo ""

# Phase 2: Convert to 3D
echo "=== PHASE 2: 3D MESH CONVERSION ==="

# Upload all references first
echo "  Uploading references..."
for entry in "${UNITS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    if [ -f "$OUTPUT_DIR/references/${ID}_ref.png" ]; then
        curl -s -X POST "$COMFY_URL/upload/image" \
            -F "image=@$OUTPUT_DIR/references/${ID}_ref.png" \
            -F "overwrite=true" > /dev/null
    fi
done
echo "  Upload complete"
echo ""

# Convert to 3D (one at a time - GPU intensive)
SEED=110000
MESH_SUCCESS=0

for entry in "${UNITS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)

    if [ ! -f "$OUTPUT_DIR/references/${ID}_ref.png" ]; then
        echo "  $ID: No reference, skipping"
        continue
    fi

    echo "  Converting $ID..."

    WORKFLOW=$(cat << 'WFEND'
{
  "1": {"class_type": "LoadImage", "inputs": {"image": "IMAGE_PLACEHOLDER"}},
  "2": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": "hunyuan_3d_v2.1.safetensors"}},
  "3": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["2", 1], "image": ["1", 0], "crop": "center"}},
  "4": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["3", 0]}},
  "5": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 128, "batch_size": 1}},
  "6": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["5", 0], "seed": SEED_PLACEHOLDER, "steps": 40, "cfg": 5.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "7": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["6", 0], "vae": ["2", 2], "num_chunks": 12000, "octree_resolution": 256}},
  "8": {"class_type": "VoxelToMeshBasic", "inputs": {"voxel": ["7", 0], "threshold": 0.25}},
  "9": {"class_type": "SaveGLB", "inputs": {"mesh": ["8", 0], "filename_prefix": "OUTPUT_PLACEHOLDER"}}
}
WFEND
)

    WF=$(echo "$WORKFLOW" | sed "s/IMAGE_PLACEHOLDER/${ID}_ref.png/g" | sed "s/SEED_PLACEHOLDER/$SEED/g" | sed "s/OUTPUT_PLACEHOLDER/$ID/g")

    curl -s -X POST "$COMFY_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": $WF}" > /dev/null

    SEED=$((SEED + 1))

    # Wait for this one to complete
    wait_for_queue
done

echo ""
echo "=== DOWNLOADING MESHES ==="
for entry in "${UNITS[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)

    curl -s "$COMFY_URL/view?filename=${ID}_00001_.glb&type=output" -o "$OUTPUT_DIR/meshes/${ID}.glb"

    if [ -s "$OUTPUT_DIR/meshes/${ID}.glb" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/meshes/${ID}.glb" 2>/dev/null || stat -c%s "$OUTPUT_DIR/meshes/${ID}.glb" 2>/dev/null)
        if [ "$SIZE" -gt 3000 ]; then
            SIZE_KB=$((SIZE / 1024))
            echo "  $ID: OK (${SIZE_KB}KB)"
            MESH_SUCCESS=$((MESH_SUCCESS + 1))
        else
            echo "  $ID: TOO SMALL (${SIZE}B)"
            rm -f "$OUTPUT_DIR/meshes/${ID}.glb"
        fi
    else
        echo "  $ID: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "UNIT GENERATION COMPLETE"
echo "=============================================="
echo "References: $SUCCESS/${#UNITS[@]}"
echo "3D Meshes: $MESH_SUCCESS/${#UNITS[@]}"
echo "=============================================="
