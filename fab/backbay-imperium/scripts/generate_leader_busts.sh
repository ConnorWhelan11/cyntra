#!/bin/bash
# Generate 3D leader busts from portrait references for cinematics

COMFY_URL="https://evzvuz1wndw5zb-8188.proxy.runpod.net"
OUTPUT_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/leaders/busts"
REFS_DIR="/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/leaders"
mkdir -p "$OUTPUT_DIR"

LEADERS=(
    "leader_washington"
    "leader_elizabeth"
    "leader_napoleon"
    "leader_bismarck"
    "leader_gandhi"
    "leader_montezuma"
    "leader_cleopatra"
    "leader_alexander"
    "leader_genghis"
    "leader_caesar"
    "leader_wu_zetian"
    "leader_tokugawa"
)

echo "=============================================="
echo "GENERATING 3D LEADER BUSTS FOR CINEMATICS"
echo "=============================================="

# Upload portrait references
echo ""
echo "=== UPLOADING REFERENCES ==="
for leader in "${LEADERS[@]}"; do
    if [ -f "$REFS_DIR/${leader}.png" ]; then
        curl -s -X POST "$COMFY_URL/upload/image" \
            -F "image=@$REFS_DIR/${leader}.png;filename=${leader}_ref.png" \
            -F "overwrite=true" > /dev/null
        echo "  Uploaded: ${leader}"
    fi
done

convert_to_3d() {
    local ID=$1
    local SEED=$2
    
    WORKFLOW="{\"1\":{\"class_type\":\"LoadImage\",\"inputs\":{\"image\":\"${ID}_ref.png\"}},\"2\":{\"class_type\":\"ImageOnlyCheckpointLoader\",\"inputs\":{\"ckpt_name\":\"hunyuan_3d_v2.1.safetensors\"}},\"3\":{\"class_type\":\"CLIPVisionEncode\",\"inputs\":{\"clip_vision\":[\"2\",1],\"image\":[\"1\",0],\"crop\":\"center\"}},\"4\":{\"class_type\":\"Hunyuan3Dv2Conditioning\",\"inputs\":{\"clip_vision_output\":[\"3\",0]}},\"5\":{\"class_type\":\"EmptyLatentHunyuan3Dv2\",\"inputs\":{\"resolution\":128,\"batch_size\":1}},\"6\":{\"class_type\":\"KSampler\",\"inputs\":{\"model\":[\"2\",0],\"positive\":[\"4\",0],\"negative\":[\"4\",1],\"latent_image\":[\"5\",0],\"seed\":${SEED},\"steps\":50,\"cfg\":5.0,\"sampler_name\":\"euler\",\"scheduler\":\"normal\",\"denoise\":1.0}},\"7\":{\"class_type\":\"VAEDecodeHunyuan3D\",\"inputs\":{\"samples\":[\"6\",0],\"vae\":[\"2\",2],\"num_chunks\":18000,\"octree_resolution\":256}},\"8\":{\"class_type\":\"VoxelToMeshBasic\",\"inputs\":{\"voxel\":[\"7\",0],\"threshold\":0.08}},\"9\":{\"class_type\":\"SaveGLB\",\"inputs\":{\"mesh\":[\"8\",0],\"filename_prefix\":\"${ID}_bust\"}}}"
    
    curl -s -X POST "$COMFY_URL/prompt" -H "Content-Type: application/json" -d "{\"prompt\": $WORKFLOW}" > /dev/null
}

wait_for_queue() {
    while true; do
        QUEUE=$(curl -s "$COMFY_URL/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{len(d.get('queue_running',[]))} {len(d.get('queue_pending',[]))}\")") 2>/dev/null
        RUNNING=$(echo $QUEUE | cut -d' ' -f1)
        PENDING=$(echo $QUEUE | cut -d' ' -f2)
        if [ "$RUNNING" = "0" ] && [ "$PENDING" = "0" ]; then break; fi
        echo "    Queue: $RUNNING running, $PENDING pending..."
        sleep 10
    done
}

echo ""
echo "=== CONVERTING TO 3D BUSTS ==="
SEED=800000
for leader in "${LEADERS[@]}"; do
    echo "  Converting: $leader..."
    convert_to_3d "$leader" $SEED
    SEED=$((SEED + 1))
    # Wait after each one since 3D conversion is heavy
    wait_for_queue
done

echo ""
echo "=== DOWNLOADING BUSTS ==="
SUCCESS=0
for leader in "${LEADERS[@]}"; do
    curl -s "$COMFY_URL/view?filename=${leader}_bust_00001_.glb&type=output" -o "$OUTPUT_DIR/${leader}_bust.glb"
    if [ -s "$OUTPUT_DIR/${leader}_bust.glb" ]; then
        SIZE=$(stat -f%z "$OUTPUT_DIR/${leader}_bust.glb" 2>/dev/null)
        if [ "$SIZE" -gt 3000 ]; then
            echo "  $leader: OK ($((SIZE/1024))KB)"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "  $leader: TOO SMALL"
            rm -f "$OUTPUT_DIR/${leader}_bust.glb"
        fi
    else
        echo "  $leader: FAILED"
    fi
done

echo ""
echo "=============================================="
echo "LEADER BUSTS COMPLETE: $SUCCESS/12"
echo "=============================================="
