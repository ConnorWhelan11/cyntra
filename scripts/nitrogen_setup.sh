#!/bin/bash
# NitroGen Integration Setup Script
#
# This script sets up the NitroGen testing environment:
# 1. Starts SSH tunnel to RunPod
# 2. Verifies server connection
# 3. Downloads dataset sample (optional)
# 4. Runs smoke test

set -e

# Configuration - edit these or set as environment variables
RUNPOD_IP="${RUNPOD_IP:-216.81.245.97}"
RUNPOD_PORT="${RUNPOD_PORT:-14880}"
NITROGEN_PORT="${NITROGEN_PORT:-5555}"
SSH_KEY="${SSH_KEY:-~/.ssh/id_ed25519}"

echo "====================================="
echo "NitroGen Integration Setup"
echo "====================================="
echo ""

# Step 1: Check/start SSH tunnel
echo "[1/4] Checking SSH tunnel..."
if lsof -i :$NITROGEN_PORT > /dev/null 2>&1; then
    echo "  ✓ Tunnel already active on port $NITROGEN_PORT"
else
    echo "  Starting SSH tunnel..."
    ssh -f -N -L $NITROGEN_PORT:localhost:$NITROGEN_PORT \
        -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=60 \
        -i "$SSH_KEY" \
        -p $RUNPOD_PORT \
        root@$RUNPOD_IP

    sleep 2

    if lsof -i :$NITROGEN_PORT > /dev/null 2>&1; then
        echo "  ✓ Tunnel established"
    else
        echo "  ✗ Failed to establish tunnel"
        exit 1
    fi
fi

# Step 2: Verify NitroGen server
echo ""
echo "[2/4] Verifying NitroGen server..."
cd "$(dirname "$0")/../kernel"

python3 -c "
from cyntra.fab.nitrogen_client import NitroGenClient
try:
    client = NitroGenClient(port=$NITROGEN_PORT)
    info = client.info()
    print(f'  ✓ Connected to NitroGen: {info.get(\"ckpt_path\", \"unknown\")}')
    client.close()
except Exception as e:
    print(f'  ✗ Connection failed: {e}')
    exit(1)
"

# Step 3: Download dataset sample (optional)
echo ""
echo "[3/4] Dataset setup..."
DATASET_DIR="/tmp/nitrogen_dataset"

if [ -d "$DATASET_DIR" ]; then
    echo "  ✓ Dataset already downloaded at $DATASET_DIR"
else
    read -p "  Download NitroGen dataset sample? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "  Downloading first shard (this may take a while)..."
        pip install -q huggingface_hub
        huggingface-cli download nvidia/NitroGen \
            --include "actions/SHARD_0000/**" \
            --local-dir "$DATASET_DIR" \
            --quiet
        echo "  ✓ Dataset downloaded to $DATASET_DIR"
    else
        echo "  Skipping dataset download (will use synthetic data)"
    fi
fi

# Step 4: Run smoke test
echo ""
echo "[4/4] Running smoke test..."
python -m cyntra.fab.nitrogen_benchmark smoke --sample 20

echo ""
echo "====================================="
echo "Setup complete!"
echo "====================================="
echo ""
echo "Next steps:"
echo "  1. Run full benchmark: python -m cyntra.fab.nitrogen_benchmark all"
echo "  2. Run playtest gate: python -m cyntra.fab.playability_gate <project> <config>"
echo "  3. Add playtest to world: edit fab/worlds/*/world.yaml"
echo ""
