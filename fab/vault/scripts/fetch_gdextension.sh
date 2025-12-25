#!/bin/bash
#
# Fetch GDExtension binaries for a specific platform.
#
# Usage:
#   ./fetch_gdextension.sh terrain3d macos
#   ./fetch_gdextension.sh godot_jolt linux
#   ./fetch_gdextension.sh limboai windows
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_ID="$1"
PLATFORM="${2:-macos}"

if [ -z "$EXTENSION_ID" ]; then
    echo "Usage: $0 <extension_id> [platform]"
    echo ""
    echo "Available extensions:"
    ls -1 "$VAULT_ROOT/godot/gdextensions/" | grep -v registry.json
    echo ""
    echo "Platforms: macos, linux, windows"
    exit 1
fi

MANIFEST="$VAULT_ROOT/godot/gdextensions/$EXTENSION_ID/manifest.json"
if [ ! -f "$MANIFEST" ]; then
    echo "ERROR: Extension manifest not found: $MANIFEST"
    exit 1
fi

# Read release URL from manifest
RELEASE_URL=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m.get('upstream', {}).get('releases_url', ''))" 2>/dev/null)
VERSION=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m.get('version', 'unknown'))" 2>/dev/null)

echo "=========================================="
echo "GDExtension: $EXTENSION_ID"
echo "Version: $VERSION"
echo "Platform: $PLATFORM"
echo "=========================================="
echo ""

# Provide download instructions
case "$EXTENSION_ID" in
    terrain3d)
        echo "Terrain3D v$VERSION"
        echo "Download from: https://github.com/TokisanGames/Terrain3D/releases/tag/v$VERSION"
        echo ""
        echo "Files needed for $PLATFORM:"
        case "$PLATFORM" in
            macos) echo "  - terrain3d_v${VERSION}.macos.zip" ;;
            linux) echo "  - terrain3d_v${VERSION}.linux.zip" ;;
            windows) echo "  - terrain3d_v${VERSION}.windows.zip" ;;
        esac
        ;;
    godot_jolt)
        echo "Godot Jolt v$VERSION"
        echo "Download from: https://github.com/godot-jolt/godot-jolt/releases/tag/v$VERSION"
        echo ""
        echo "Files needed for $PLATFORM:"
        echo "  - Look for 'godot-jolt_v${VERSION}_*.zip'"
        ;;
    limboai)
        echo "LimboAI v$VERSION"
        echo "Download from: https://github.com/limbonaut/limboai/releases/tag/v$VERSION"
        echo ""
        echo "Options:"
        echo "  1. Use pre-built Godot with LimboAI baked in"
        echo "  2. Download gdextension addon"
        ;;
    godot_steam)
        echo "GodotSteam v$VERSION"
        echo "Download from: https://github.com/GodotSteam/GodotSteam/releases/tag/v$VERSION"
        echo ""
        echo "NOTE: Requires Steam SDK and Steam client running"
        ;;
    godot_sqlite)
        echo "Godot SQLite v$VERSION"
        echo "Download from: https://github.com/2shady4u/godot-sqlite/releases/tag/v$VERSION"
        echo ""
        echo "Files needed:"
        case "$PLATFORM" in
            macos) echo "  - gdsqlite.$PLATFORM.*.zip" ;;
            linux) echo "  - gdsqlite.$PLATFORM.*.zip" ;;
            windows) echo "  - gdsqlite.$PLATFORM.*.zip" ;;
        esac
        ;;
    *)
        echo "Unknown extension: $EXTENSION_ID"
        exit 1
        ;;
esac

echo ""
echo "Installation steps:"
echo "  1. Download the appropriate archive"
echo "  2. Extract to: $VAULT_ROOT/godot/gdextensions/$EXTENSION_ID/bin/"
echo "  3. Copy to your Godot project's addons/ directory"
echo ""

# Create bin directory
TARGET="$VAULT_ROOT/godot/gdextensions/$EXTENSION_ID/bin"
mkdir -p "$TARGET"
echo "Target directory created: $TARGET"

# Optionally auto-download (if curl/wget available)
if [ "${AUTO_DOWNLOAD:-false}" = "true" ]; then
    echo ""
    echo "Auto-download not implemented yet."
    echo "Please download manually from the release page."
fi
