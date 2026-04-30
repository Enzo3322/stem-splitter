#!/usr/bin/env bash
# Builda o sidecar Python pra plataforma atual e copia pra src-tauri/binaries/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SIDECAR_DIR="$ROOT/python-sidecar"

# pyproject requires >=3.10,<3.14. Pick the newest matching interpreter.
PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
  for cand in python3.13 python3.12 python3.11 python3.10; do
    if command -v "$cand" >/dev/null 2>&1; then
      PYTHON_BIN="$cand"
      break
    fi
  done
fi
if [ -z "$PYTHON_BIN" ]; then
  echo "no compatible python found (need 3.10..3.13). install python3.13 (e.g. brew install python@3.13)" >&2
  exit 1
fi
echo ">> using $PYTHON_BIN ($("$PYTHON_BIN" --version))"

cd "$SIDECAR_DIR"

if [ ! -d ".venv" ]; then
  echo ">> creating venv"
  "$PYTHON_BIN" -m venv .venv
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
