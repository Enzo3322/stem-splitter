#!/usr/bin/env bash
# Baixa binário ffmpeg estático pra plataforma alvo e coloca em src-tauri/binaries/
# com o sufixo de target esperado pelo Tauri (externalBin).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/binaries"

detect_target() {
  local sys machine
  sys="$(uname -s)"
  machine="$(uname -m)"
  case "$sys/$machine" in
    Darwin/arm64)   echo "aarch64-apple-darwin" ;;
    Darwin/x86_64)  echo "x86_64-apple-darwin" ;;
    Linux/x86_64)   echo "x86_64-unknown-linux-gnu" ;;
    Linux/aarch64)  echo "aarch64-unknown-linux-gnu" ;;
    *) echo "unsupported: $sys/$machine" >&2; exit 1 ;;
  esac
}

TARGET="${1:-$(detect_target)}"

# Static builds shipped by the well-maintained ffmpeg-static project.
FFMPEG_STATIC_TAG="b6.0"
case "$TARGET" in
  aarch64-apple-darwin)        ASSET="ffmpeg-darwin-arm64";   EXT="" ;;
  x86_64-apple-darwin)         ASSET="ffmpeg-darwin-x64";     EXT="" ;;
  aarch64-unknown-linux-gnu)   ASSET="ffmpeg-linux-arm64";    EXT="" ;;
  x86_64-unknown-linux-gnu)    ASSET="ffmpeg-linux-x64";      EXT="" ;;
  x86_64-pc-windows-msvc)      ASSET="ffmpeg-win32-x64.exe";  EXT=".exe" ;;
  *) echo "no ffmpeg asset mapping for target: $TARGET" >&2; exit 1 ;;
esac

URL="https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_TAG}/${ASSET}"
DST="$BIN_DIR/ffmpeg-${TARGET}${EXT}"

mkdir -p "$BIN_DIR"
if [ -f "$DST" ]; then
  echo ">> ffmpeg already present: $DST (skip download)"
else
  echo ">> downloading $URL"
  curl -fL --retry 3 -o "$DST.tmp" "$URL"
  mv "$DST.tmp" "$DST"
  chmod +x "$DST"
  echo ">> wrote $DST"
fi

if [ "$(uname -s)" = "Darwin" ]; then
  # Quarantine-strip pro Gatekeeper não bloquear a execução local.
  xattr -d com.apple.quarantine "$DST" 2>/dev/null || true
fi
