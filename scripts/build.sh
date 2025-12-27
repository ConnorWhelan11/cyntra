#!/usr/bin/env bash
set -euo pipefail

mise run build-cyntra
bun run build:desktop
