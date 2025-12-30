#!/bin/bash
# Fix final 3 stubborn units with ultra-chunky designs

COMFY_URL="https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/units"

# Ultra-chunky - solid block designs, no thin parts at all
FIXES=(
    "unit_galley|single ancient wooden boat, chunky solid hull like a bathtub, thick rounded bow, solid wood block, no mast no oars, simple boat shape, isometric view, white background"
    "unit_mangonel|single medieval wooden cart with boulder, chunky wooden box on thick wheels, large stone ball on top, no moving parts, solid block design, isometric view, white background"
    "unit_settler|single covered wagon, chunky barrel-shaped cart, thick canvas dome top, solid wooden wheels, no animals, compact toy-like design, isometric view, white background"
)

generate_and_convert() {
    local ID=$1
    local PROMPT=$2
    local SEED=$3

    echo "Processing $ID..."

    WORKFLOW=$(cat << WFEND
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
  "2": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "3D render of ${PROMPT}, solid chunky toy-like design, one object only, studio lighting", "text_l": "single chunky 3D object, white background", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"text_g": "thin, oars, mast, pole, stick, wire, multiple, blurry, arm, beam, people", "text_l": "thin pole stick wire multiple", "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": ${SEED}, "steps": 35, "cfg": 9.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
  "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "${ID}_v2_ref"}}
}
WFEND
)

    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" > /dev/null
    sleep 15

    while true; do
        Q=$(curl -s "$COMFY_URL/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('queue_running',[]))+len(d.get('queue_pending',[])))" 2>/dev/null)
        if [ "$Q" = "0" ]; then break; fi
        sleep 3
    done

    curl -s "$COMFY_URL/view?filename=${ID}_v2_ref_00001_.png&type=output" -o "$OUTPUT_DIR/references/${ID}_v2_ref.png"
    curl -s -X POST "$COMFY_URL/upload/image" -F "image=@$OUTPUT_DIR/references/${ID}_v2_ref.png" -F "overwrite=true" > /dev/null

    WORKFLOW3D=$(cat << 'WF3D'
{
  "1": {"class_type": "LoadImage", "inputs": {"image": "IMAGE_PLACEHOLDER"}},
  "2": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": "hunyuan_3d_v2.1.safetensors"}},
  "3": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["2", 1], "image": ["1", 0], "crop": "center"}},
  "4": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["3", 0]}},
  "5": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 128, "batch_size": 1}},
  "6": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["5", 0], "seed": 77777, "steps": 50, "cfg": 5.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
  "7": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["6", 0], "vae": ["2", 2], "num_chunks": 18000, "octree_resolution": 256}},
  "8": {"class_type": "VoxelToMeshBasic", "inputs": {"voxel": ["7", 0], "threshold": 0.12}},
  "9": {"class_type": "SaveGLB", "inputs": {"mesh": ["8", 0], "filename_prefix": "OUTPUT_PLACEHOLDER"}}
}
WF3D
)

    WF=$(echo "$WORKFLOW3D" | sed "s/IMAGE_PLACEHOLDER/${ID}_v2_ref.png/g" | sed "s/OUTPUT_PLACEHOLDER/${ID}_v2/g")
    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WF}" > /dev/null

    while true; do
        Q=$(curl -s "$COMFY_URL/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('queue_running',[]))+len(d.get('queue_pending',[])))" 2>/dev/null)
        if [ "$Q" = "0" ]; then break; fi
        sleep 5
    done

    curl -s "$COMFY_URL/view?filename=${ID}_v2_00001_.glb&type=output" -o "$OUTPUT_DIR/meshes/${ID}_v2.glb"

    if [ -s "$OUTPUT_DIR/meshes/${ID}_v2.glb" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/meshes/${ID}_v2.glb" 2>/dev/null)
        if [ "$SIZE" -gt 3000 ]; then
            mv "$OUTPUT_DIR/meshes/${ID}_v2.glb" "$OUTPUT_DIR/meshes/${ID}.glb"
            SIZE_KB=$((SIZE / 1024))
            echo "  $ID: SUCCESS (${SIZE_KB}KB)"
            return 0
        else
            echo "  $ID: STILL TOO SMALL (${SIZE}B)"
            rm -f "$OUTPUT_DIR/meshes/${ID}_v2.glb"
            return 1
        fi
    else
        echo "  $ID: DOWNLOAD FAILED"
        return 1
    fi
}

echo "=============================================="
echo "FIXING FINAL 3 STUBBORN UNITS"
echo "=============================================="

SEED=130000
SUCCESS=0

for entry in "${FIXES[@]}"; do
    ID=$(echo "$entry" | cut -d'|' -f1)
    PROMPT=$(echo "$entry" | cut -d'|' -f2)

    if generate_and_convert "$ID" "$PROMPT" $SEED; then
        SUCCESS=$((SUCCESS + 1))
    fi

    SEED=$((SEED + 1))
done

echo ""
echo "=============================================="
echo "FIXED: $SUCCESS/3 units"
echo "=============================================="
