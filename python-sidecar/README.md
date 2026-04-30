# Python Sidecar

CLI Python que baixa do YouTube + separa em 6 stems via Demucs.

## Setup local

```bash
cd python-sidecar
python -m venv .venv && source .venv/bin/activate  # ou .venv\Scripts\activate no Windows
pip install -e ".[dev]"
```

⚠️ A primeira execução baixa o modelo `htdemucs_6s` (~250 MB) em `~/.cache/torch/hub/`.

## Uso direto

```bash
python -m stem_splitter device-info
python -m stem_splitter process \
    --url "https://youtu.be/dQw4w9WgXcQ" \
    --output-dir ./out
```

Cada linha do stdout é um evento JSONL — ver `docs/PROTOCOLO_IPC.md`.

## Build do binário standalone

```bash
python build.py            # detecta plataforma
python build.py --target x86_64-pc-windows-msvc --clean
```

O binário é copiado pra `../src-tauri/binaries/stem-splitter-sidecar-<triple>[.exe]`.

## Testes

```bash
pytest
```

Os testes que dependem de torch/demucs são pulados se as libs não estiverem instaladas.
