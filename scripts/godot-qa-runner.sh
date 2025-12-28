#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/godot-qa-runner.sh [options]

Options:
  --project <path>   Godot project directory (default: research/backbay-imperium/client)
  --scene <path>     Scene to run (default: res://tests/run_all_tests.tscn)
  --script <path>    Script to run (alternative to --scene)
  --godot-bin <path> Godot binary path (overrides auto-detect)
  --help             Show this help

Examples:
  scripts/godot-qa-runner.sh
  scripts/godot-qa-runner.sh --project research/backbay-imperium/client --scene res://tests/run_all_tests.tscn
  scripts/godot-qa-runner.sh --scene res://tests/qa_validate_scripts.tscn
USAGE
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="research/backbay-imperium/client"
SCENE="res://tests/run_all_tests.tscn"
SCRIPT=""
GODOT_BIN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      PROJECT="$2"; shift 2;;
    --scene)
      SCENE="$2"; shift 2;;
    --script)
      SCRIPT="$2"; shift 2;;
    --godot-bin)
      GODOT_BIN="$2"; shift 2;;
    --help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2
      usage; exit 2;;
  esac
done

if [ -z "$GODOT_BIN" ]; then
  if command -v godot >/dev/null 2>&1; then
    GODOT_BIN="$(command -v godot)"
  elif command -v godot4 >/dev/null 2>&1; then
    GODOT_BIN="$(command -v godot4)"
  elif [ -x /Applications/Godot.app/Contents/MacOS/Godot ]; then
    GODOT_BIN="/Applications/Godot.app/Contents/MacOS/Godot"
  elif command -v mdfind >/dev/null 2>&1; then
    APP_PATH="$(mdfind "kMDItemFSName == 'Godot.app'" | head -n 1 || true)"
    if [ -n "$APP_PATH" ] && [ -x "$APP_PATH/Contents/MacOS/Godot" ]; then
      GODOT_BIN="$APP_PATH/Contents/MacOS/Godot"
    fi
  fi
fi

if [ -z "$GODOT_BIN" ]; then
  echo "Godot binary not found. Set GODOT_BIN or pass --godot-bin." >&2
  exit 1
fi

if [ ! -x "$GODOT_BIN" ]; then
  echo "Godot binary not executable: $GODOT_BIN" >&2
  exit 1
fi

if [[ "$PROJECT" != /* ]]; then
  PROJECT="$ROOT_DIR/$PROJECT"
fi

if [ ! -d "$PROJECT" ]; then
  echo "Project directory not found: $PROJECT" >&2
  exit 1
fi

echo "Using Godot: $GODOT_BIN"
echo "Project: $PROJECT"

if [ -n "$SCRIPT" ]; then
  echo "Script: $SCRIPT"
  exec "$GODOT_BIN" --headless --path "$PROJECT" --script "$SCRIPT"
fi

echo "Scene: $SCENE"
exec "$GODOT_BIN" --headless --path "$PROJECT" --scene "$SCENE"
