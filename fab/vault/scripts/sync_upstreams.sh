#!/bin/bash
# Sync vault entries from upstream repositories
# Usage: ./sync_upstreams.sh [addon_id]
#
# Examples:
#   ./sync_upstreams.sh                 # Sync all addons
#   ./sync_upstreams.sh gdunit4         # Sync specific addon

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_ROOT="$(dirname "$SCRIPT_DIR")"
CATALOG="$VAULT_ROOT/catalog.yaml"

# Check if python3 and pyyaml are available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required"
    exit 1
fi

# Helper function to extract addon info from catalog
get_addon_info() {
    local addon_id="$1"
    local field="$2"
    python3 -c "
import yaml
with open('$CATALOG') as f:
    cat = yaml.safe_load(f)
for a in cat.get('addons', []):
    if a.get('id') == '$addon_id':
        print(a.get('$field', ''))
        break
"
}

# Sync a single addon
sync_addon() {
    local addon_id="$1"

    local upstream
    upstream=$(get_addon_info "$addon_id" "upstream")

    local ref
    ref=$(get_addon_info "$addon_id" "pinned_ref")

    local install_path
    install_path=$(get_addon_info "$addon_id" "install_path")

    if [ -z "$upstream" ]; then
        echo "SKIP: $addon_id (no upstream - local only)"
        return 0
    fi

    if [ -z "$ref" ]; then
        echo "SKIP: $addon_id (no pinned_ref)"
        return 0
    fi

    local addon_dir="$VAULT_ROOT/godot/addons/$addon_id"
    local temp_dir
    temp_dir=$(mktemp -d)

    echo "Syncing $addon_id from $upstream @ $ref..."

    # Clone at specified ref
    if ! git clone --depth 1 --branch "$ref" "$upstream" "$temp_dir" 2>/dev/null; then
        echo "ERROR: Failed to clone $addon_id at $ref"
        rm -rf "$temp_dir"
        return 1
    fi

    # Create addon directory
    mkdir -p "$addon_dir/addon"

    # Copy addon files (handle different repo structures)
    if [ -d "$temp_dir/addons" ]; then
        # Standard structure: addons/<addon_name>/
        local addon_name
        addon_name=$(basename "$install_path")
        if [ -d "$temp_dir/addons/$addon_name" ]; then
            rm -rf "$addon_dir/addon"
            cp -r "$temp_dir/addons/$addon_name" "$addon_dir/addon"
        else
            # Try first subdirectory in addons/
            local first_addon
            first_addon=$(ls "$temp_dir/addons/" | head -1)
            if [ -n "$first_addon" ]; then
                rm -rf "$addon_dir/addon"
                cp -r "$temp_dir/addons/$first_addon" "$addon_dir/addon"
            fi
        fi
    elif [ -d "$temp_dir/addon" ]; then
        rm -rf "$addon_dir/addon"
        cp -r "$temp_dir/addon" "$addon_dir/"
    else
        echo "WARNING: Could not find addon directory structure in $addon_id"
    fi

    rm -rf "$temp_dir"

    # Update manifest with new fetch timestamp
    if [ -f "$addon_dir/manifest.json" ]; then
        python3 -c "
import json
from datetime import datetime

with open('$addon_dir/manifest.json') as f:
    manifest = json.load(f)

manifest['upstream']['fetched_at'] = datetime.utcnow().isoformat() + 'Z'

with open('$addon_dir/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
"
    fi

    echo "OK: $addon_id"
}

# List all addons with upstreams
list_addons_with_upstreams() {
    python3 -c "
import yaml
with open('$CATALOG') as f:
    cat = yaml.safe_load(f)
for a in cat.get('addons', []):
    if a.get('upstream'):
        print(a['id'])
"
}

# Main
if [ $# -eq 0 ]; then
    echo "Syncing all addons with upstreams..."
    echo ""

    for addon_id in $(list_addons_with_upstreams); do
        sync_addon "$addon_id" || true
    done

    echo ""
    echo "Done. Run validate_hashes.py to verify integrity."
else
    sync_addon "$1"
fi
