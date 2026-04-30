#!/usr/bin/env bash
# Builda o sidecar Python pra plataforma atual e copia pra src-tauri/binaries/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SIDECAR_DIR="$ROOT/python-sidecar"

cd "$SIDECAR_DIR"

if [ ! -d ".venv" ]; then
  echo ">> creating venv"
  python -m venv .venv
fi

# shellcheck disable=SC1091
if [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
  source .venv/Scripts/activate
else
  echo "could not locate venv activate script" >&2
  exit 1
fi

pip install --upgrade pip wheel >/dev/null
pip install -e ".[dev]"

python build.py --clean "$@"
