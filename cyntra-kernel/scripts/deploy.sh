#!/usr/bin/env bash
#
# Deploy Cyntra to a target project
#
# Usage: ./scripts/deploy.sh /path/to/target/project
#

set -e

TARGET_DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KERNEL_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Deploying Cyntra to: $TARGET_DIR"

# Check if target is a git repo
if [ ! -d "$TARGET_DIR/.git" ]; then
    echo "❌ Error: $TARGET_DIR is not a git repository"
    exit 1
fi

# Create .cyntra directory
mkdir -p "$TARGET_DIR/.cyntra"
mkdir -p "$TARGET_DIR/.cyntra/logs"

# Copy example config if none exists
if [ ! -f "$TARGET_DIR/.cyntra/config.yaml" ]; then
    echo "📝 Creating default config..."
    cat > "$TARGET_DIR/.cyntra/config.yaml" << 'EOF'
version: "1.0"

scheduling:
  max_concurrent_workcells: 2
  max_concurrent_tokens: 150000
  starvation_threshold_hours: 4.0

toolchain_priority:
  - codex
  - claude

toolchains:
  codex:
    enabled: true
    path: codex
    default_model: gpt-5.2
    timeout_minutes: 60
  claude:
    enabled: true
    path: claude
    default_model: claude-opus-4-5-20251101
    timeout_minutes: 60

routing:
  rules:
    - match: { dk_tool_hint: "codex" }
      use: [codex]
    - match: { dk_tool_hint: "claude" }
      use: [claude]
    - match: {}
      use: [claude]
  fallbacks:
    codex: [claude]
    claude: [codex]

speculation:
  enabled: true
  default_parallelism: 2
  max_parallelism: 3
  vote_threshold: 0.7
  auto_trigger_on_critical_path: true
  auto_trigger_risk_levels: ["high", "critical"]

gates:
  test_command: "pytest"
  typecheck_command: "mypy ."
  lint_command: "ruff check ."
  timeout_seconds: 300
EOF
    echo "✅ Config created at: $TARGET_DIR/.cyntra/config.yaml"
else
    echo "ℹ️  Config already exists, skipping"
fi

# Check for .beads directory
if [ ! -d "$TARGET_DIR/.beads" ]; then
    echo ""
    echo "⚠️  No .beads directory found!"
    echo "   Cyntra requires Beads for issue tracking."
    echo ""
    echo "   To initialize Beads:"
    echo "     cd $TARGET_DIR && bd init"
    echo ""
    echo "   Or create manually:"
    echo "     mkdir -p $TARGET_DIR/.beads"
    echo "     touch $TARGET_DIR/.beads/issues.jsonl"
    echo "     touch $TARGET_DIR/.beads/deps.jsonl"
fi

# Add to .gitignore if not already there
if [ -f "$TARGET_DIR/.gitignore" ]; then
    if ! grep -q ".cyntra/logs" "$TARGET_DIR/.gitignore" 2>/dev/null; then
        echo "" >> "$TARGET_DIR/.gitignore"
        echo "# Cyntra" >> "$TARGET_DIR/.gitignore"
        echo ".cyntra/" >> "$TARGET_DIR/.gitignore"
        echo ".workcells/" >> "$TARGET_DIR/.gitignore"
        echo "✅ Added Cyntra ignores to .gitignore"
    fi
fi

echo ""
echo "✨ Cyntra deployed successfully!"
echo ""
echo "Next steps:"
echo "  1. Review config: $TARGET_DIR/.cyntra/config.yaml"
echo "  2. Ensure Beads is set up: $TARGET_DIR/.beads/"
echo "  3. Run kernel: cd $TARGET_DIR && cyntra run --dry-run"
echo ""
