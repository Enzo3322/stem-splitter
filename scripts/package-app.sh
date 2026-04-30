#!/usr/bin/env bash
# Build completo: sidecar Python -> bundle Tauri.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

# Detecta target nativo (override via env var TARGET=...).
detect_target() {
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64)  echo "aarch64-apple-darwin" ;;
    Darwin/x86_64) echo "x86_64-apple-darwin" ;;
    Linux/x86_64)  echo "x86_64-unknown-linux-gnu" ;;
    Linux/aarch64) echo "aarch64-unknown-linux-gnu" ;;
    *) echo "unsupported" >&2; exit 1 ;;
  esac
}
TARGET="${TARGET:-$(detect_target)}"
echo "target: $TARGET"

echo "=== 1/4: fetch ffmpeg ($TARGET)"
bash scripts/fetch-ffmpeg.sh "$TARGET"

echo "=== 2/4: build sidecar python ($TARGET)"
bash scripts/build-sidecar.sh --target "$TARGET"

echo "=== 3/4: install npm deps"
npm install

echo "=== 4/4: tauri build --target $TARGET"
npm run tauri:build -- --target "$TARGET"

echo "done. artefatos em src-tauri/target/$TARGET/release/bundle/"
