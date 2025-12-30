#!/bin/bash
#
# Visual QA Runner
# Captures screenshots and compares against baselines.
#
# Usage:
#   ./run_visual_qa.sh              # Run full QA (capture + compare)
#   ./run_visual_qa.sh --capture    # Only capture screenshots
#   ./run_visual_qa.sh --compare    # Only compare (skip capture)
#   ./run_visual_qa.sh --update     # Update baselines from captures
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLIENT_DIR="$PROJECT_DIR/client"

# Directories
CAPTURES_DIR="$CLIENT_DIR/tests/visual_qa_captures"
BASELINES_DIR="$CLIENT_DIR/tests/visual_qa_baselines"
OUTPUT_DIR="$CLIENT_DIR/tests/visual_qa_output"

# Find Godot binary
find_godot() {
    if [ -x "/Applications/Godot.app/Contents/MacOS/Godot" ]; then
        echo "/Applications/Godot.app/Contents/MacOS/Godot"
    elif command -v godot &> /dev/null; then
        echo "godot"
    else
        # Try mdfind on macOS
        local found=$(mdfind "kMDItemDisplayName == 'Godot*'" 2>/dev/null | head -1)
        if [ -n "$found" ] && [ -x "$found/Contents/MacOS/Godot" ]; then
            echo "$found/Contents/MacOS/Godot"
        else
            echo ""
        fi
    fi
}

# Find Python with required packages
find_python() {
    # First check kernel venv (preferred)
    local kernel_py="$PROJECT_DIR/../../kernel/.venv/bin/python"
    if [ -x "$kernel_py" ]; then
        if "$kernel_py" -c "import imagehash, PIL" 2>/dev/null; then
            echo "$kernel_py"
            return
        fi
    fi

    # Check if imagehash is available in system python
    for py in python3 python; do
        if command -v "$py" &> /dev/null; then
            if "$py" -c "import imagehash, PIL" 2>/dev/null; then
                echo "$py"
                return
            fi
        fi
    done
    echo ""
}

print_header() {
    echo ""
    echo "========================================"
    echo "  BACKBAY IMPERIUM VISUAL QA"
    echo "========================================"
    echo ""
}

capture_screenshots() {
    echo "[Visual QA] Capturing screenshots..."

    GODOT=$(find_godot)
    if [ -z "$GODOT" ]; then
        echo "[ERROR] Godot not found. Install Godot 4.x or set PATH."
        return 1
    fi
    echo "[Visual QA] Using Godot: $GODOT"

    # Clean captures directory
    rm -rf "$CAPTURES_DIR"
    mkdir -p "$CAPTURES_DIR"

    # Run capture scene (with display for rendering)
    cd "$CLIENT_DIR"

    # Try running with display first, fall back to headless
    if [ -n "$DISPLAY" ] || [ "$(uname)" == "Darwin" ]; then
        timeout 60 "$GODOT" --path . --scene res://tests/visual_qa_capture.tscn -- --output="$CAPTURES_DIR" 2>&1 || {
            echo "[Visual QA] GUI capture failed, trying headless..."
            timeout 60 "$GODOT" --headless --path . --scene res://tests/visual_qa_capture.tscn -- --output="$CAPTURES_DIR" 2>&1
        }
    else
        timeout 60 "$GODOT" --headless --path . --scene res://tests/visual_qa_capture.tscn -- --output="$CAPTURES_DIR" 2>&1
    fi

    # Check captures were created
    if [ ! -d "$CAPTURES_DIR" ] || [ -z "$(ls -A "$CAPTURES_DIR" 2>/dev/null)" ]; then
        echo "[ERROR] No captures created"
        return 1
    fi

    echo "[Visual QA] Captures saved to: $CAPTURES_DIR"
    ls -la "$CAPTURES_DIR"
}

compare_screenshots() {
    echo "[Visual QA] Comparing screenshots..."

    PYTHON=$(find_python)
    if [ -z "$PYTHON" ]; then
        echo "[ERROR] Python with imagehash/PIL not found."
        echo "        Run: pip install Pillow imagehash"
        return 1
    fi
    echo "[Visual QA] Using Python: $PYTHON"

    # Check baselines exist
    if [ ! -d "$BASELINES_DIR" ] || [ -z "$(ls -A "$BASELINES_DIR" 2>/dev/null)" ]; then
        echo "[WARNING] No baselines found at $BASELINES_DIR"
        echo "          Run with --update to create baselines from current captures."
        return 1
    fi

    # Run comparison
    cd "$PROJECT_DIR"
    "$PYTHON" "$SCRIPT_DIR/compare.py" \
        --captures "$CAPTURES_DIR" \
        --baselines "$BASELINES_DIR" \
        --output "$OUTPUT_DIR"
}

update_baselines() {
    echo "[Visual QA] Updating baselines..."

    PYTHON=$(find_python)
    if [ -z "$PYTHON" ]; then
        echo "[ERROR] Python with imagehash/PIL not found."
        return 1
    fi

    # Check captures exist
    if [ ! -d "$CAPTURES_DIR" ] || [ -z "$(ls -A "$CAPTURES_DIR" 2>/dev/null)" ]; then
        echo "[ERROR] No captures found. Run capture first."
        return 1
    fi

    cd "$PROJECT_DIR"
    "$PYTHON" "$SCRIPT_DIR/compare.py" \
        --captures "$CAPTURES_DIR" \
        --baselines "$BASELINES_DIR" \
        --update-baselines
}

# Parse arguments
MODE="full"
while [[ $# -gt 0 ]]; do
    case $1 in
        --capture)
            MODE="capture"
            shift
            ;;
        --compare)
            MODE="compare"
            shift
            ;;
        --update|--update-baselines)
            MODE="update"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--capture|--compare|--update]"
            echo ""
            echo "Options:"
            echo "  --capture   Only capture screenshots (skip comparison)"
            echo "  --compare   Only compare (skip capture)"
            echo "  --update    Update baselines from current captures"
            echo ""
            echo "Default: Run full QA (capture + compare)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_header

case $MODE in
    capture)
        capture_screenshots
        ;;
    compare)
        compare_screenshots
        ;;
    update)
        capture_screenshots
        update_baselines
        ;;
    full)
        capture_screenshots
        compare_screenshots
        ;;
esac

exit $?
