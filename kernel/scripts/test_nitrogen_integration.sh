#!/bin/bash
# NitroGen Integration Test Runner
#
# This script runs the NitroGen end-to-end integration test.
# It will spin up an H100 pod, test predictions, and shut down.
#
# Usage:
#   ./scripts/test_nitrogen_integration.sh
#
# Or with API key:
#   RUNPOD_API_KEY=your_key ./scripts/test_nitrogen_integration.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KERNEL_DIR="$(dirname "$SCRIPT_DIR")"

cd "$KERNEL_DIR"

echo "=================================="
echo "NitroGen Integration Test"
echo "=================================="

# Check for API key
if [ -z "$RUNPOD_API_KEY" ]; then
    echo ""
    echo "RUNPOD_API_KEY not set."
    echo ""
    echo "To run this test, you need a RunPod API key:"
    echo "1. Go to https://runpod.io/console/user/settings"
    echo "2. Create an API key"
    echo "3. Run: export RUNPOD_API_KEY=your_key_here"
    echo ""
    exit 1
fi

echo ""
echo "API key found. Running integration test..."
echo ""

# Run the test
python tests/integration/test_nitrogen_e2e.py
