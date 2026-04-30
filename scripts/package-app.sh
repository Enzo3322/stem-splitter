#!/usr/bin/env bash
# Build completo: sidecar Python -> bundle Tauri.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

echo "=== 1/3: build sidecar python"
bash scripts/build-sidecar.sh

echo "=== 2/3: install npm deps"
npm install

echo "=== 3/3: tauri build"
npm run tauri:build

echo "done. artefatos em src-tauri/target/release/bundle/"
