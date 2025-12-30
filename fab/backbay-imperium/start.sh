#!/bin/bash
# Backbay Imperium - Asset Generation Quick Start
# Usage: ./start.sh [phase]
# Phases: all, materials, terrain, units, buildings, leaders, resources

set -e

# Configuration
export RUNPOD_API_KEY="${RUNPOD_API_KEY:-rpa_7UZ1DB6HZ3QMTGSZRY47CO6T6DYUA6EAYZIWJACE1p2ofd}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PHASE="${1:-all}"

echo "=========================================="
echo "BACKBAY IMPERIUM ASSET GENERATOR"
echo "=========================================="
echo "Phase: $PHASE"
echo "RunPod API Key: ${RUNPOD_API_KEY:0:10}..."
echo ""

# Check dependencies
command -v python3 >/dev/null 2>&1 || { echo "Python 3 required"; exit 1; }

# Install Python dependencies if needed
if ! python3 -c "import httpx, yaml" 2>/dev/null; then
    echo "Installing Python dependencies..."
    pip3 install httpx pyyaml pillow
fi

# Create output directories
mkdir -p assets/{terrain,units,buildings,wonders,leaders,materials,resources}

# Run orchestrator
echo "Starting asset generation..."
python3 scripts/orchestrate.py --phase "$PHASE"

echo ""
echo "=========================================="
echo "GENERATION COMPLETE"
echo "=========================================="
echo "Assets saved to: $SCRIPT_DIR/assets/"
