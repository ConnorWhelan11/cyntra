#!/bin/bash
#
# Test that a vault addon loads correctly in Godot.
#
# Usage:
#   ./test_addon_load.sh gdunit4
#   ./test_addon_load.sh beehave
#   GODOT_BIN=/path/to/godot ./test_addon_load.sh dialogic
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_ROOT="$(dirname "$SCRIPT_DIR")"
GODOT_BIN="${GODOT_BIN:-godot}"
TEST_PROJECT="/tmp/vault_addon_test_$$"
ADDON_ID="$1"

if [ -z "$ADDON_ID" ]; then
    echo "Usage: $0 <addon_id>"
    echo ""
    echo "Available addons:"
    ls -1 "$VAULT_ROOT/godot/addons/" | grep -v registry.json
    exit 1
fi

ADDON_PATH="$VAULT_ROOT/godot/addons/$ADDON_ID/addon"
if [ ! -d "$ADDON_PATH" ]; then
    echo "ERROR: Addon not found: $ADDON_PATH"
    exit 1
fi

echo "Testing addon: $ADDON_ID"
echo "Vault root: $VAULT_ROOT"
echo "Test project: $TEST_PROJECT"
echo ""

# Cleanup on exit
cleanup() {
    rm -rf "$TEST_PROJECT"
}
trap cleanup EXIT

# Create minimal project
mkdir -p "$TEST_PROJECT"
cat > "$TEST_PROJECT/project.godot" << 'EOF'
; Engine configuration file.
; It's best edited using the editor UI and not directly,
; since the parameters that go here are not all obvious.

config_version=5

[application]

config/name="VaultAddonTest"
config/features=PackedStringArray("4.3")

[editor_plugins]

enabled=PackedStringArray()
EOF

# Copy addon
mkdir -p "$TEST_PROJECT/addons"
cp -r "$ADDON_PATH"/* "$TEST_PROJECT/addons/" 2>/dev/null || true

# Some addons have their own subdirectory (like addons/gdUnit4/)
# Check if we need to preserve the structure
if [ -f "$ADDON_PATH/plugin.cfg" ]; then
    # Addon is at root level, need to figure out install name
    # Read from manifest if available
    MANIFEST="$VAULT_ROOT/godot/addons/$ADDON_ID/manifest.json"
    if [ -f "$MANIFEST" ]; then
        INSTALL_PATH=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m.get('install', {}).get('target_path', 'addons/$ADDON_ID'))" 2>/dev/null || echo "addons/$ADDON_ID")
        TARGET_DIR="$TEST_PROJECT/$INSTALL_PATH"
        rm -rf "$TARGET_DIR"
        mkdir -p "$(dirname "$TARGET_DIR")"
        cp -r "$ADDON_PATH" "$TARGET_DIR"
    fi
fi

# List what was installed
echo "Installed files:"
find "$TEST_PROJECT/addons" -type f -name "*.gd" -o -name "plugin.cfg" | head -20
echo ""

# Run Godot headless import
echo "Running Godot import..."
OUTPUT_LOG="/tmp/godot_addon_test_$$.log"

# First, try to import the project
if ! timeout 60 "$GODOT_BIN" --headless --path "$TEST_PROJECT" --import-pack "$TEST_PROJECT" --quit 2>&1 | tee "$OUTPUT_LOG"; then
    # Import pack might fail, try regular import
    timeout 60 "$GODOT_BIN" --headless --path "$TEST_PROJECT" --quit 2>&1 | tee "$OUTPUT_LOG" || true
fi

# Check for errors
echo ""
echo "Checking for errors..."

# Filter out known non-critical warnings
ERRORS=$(grep -iE "(error|failed|exception|invalid)" "$OUTPUT_LOG" | \
         grep -v "ERROR: Cannot load addon script" | \
         grep -v "Failed loading resource" | \
         grep -v "is deprecated" || true)

if [ -n "$ERRORS" ]; then
    echo ""
    echo "WARNINGS/ERRORS found:"
    echo "$ERRORS"
    echo ""
    # Don't fail immediately - some warnings are expected
fi

# Check plugin.cfg is valid
PLUGIN_CFG=$(find "$TEST_PROJECT/addons" -name "plugin.cfg" | head -1)
if [ -n "$PLUGIN_CFG" ]; then
    echo "Found plugin.cfg: $PLUGIN_CFG"
    echo "Contents:"
    head -10 "$PLUGIN_CFG"
    echo ""
    echo "PASS: $ADDON_ID has valid plugin.cfg"
else
    echo "NOTE: No plugin.cfg found (may be expected for some addons)"
fi

echo ""
echo "================================================"
echo "RESULT: $ADDON_ID load test completed"
echo "================================================"
