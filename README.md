# Stem Splitter

Desktop app multi-plataforma que recebe URL do YouTube, separa a música em 6 stems (vocal, bateria, baixo, guitarra, piano, outros) via Demucs **localmente**, e permite preview com waveform/mute/solo antes do download.

> Uso pessoal/educacional — baixar do YouTube viola os termos de serviço da plataforma.

## Stack

- **Desktop**: Tauri 2 (Rust)
- **Frontend**: React 18 + TypeScript + Tailwind + Vite
- **Player**: WaveSurfer.js v7
- **Sidecar**: Python 3.10–3.12 empacotado com PyInstaller
- **Download**: yt-dlp · **Separação**: Demucs (`htdemucs_6s`) · **Áudio**: ffmpeg

Plataformas: Windows, macOS (Intel + Apple Silicon), Linux.

## Pré-requisitos

| Ferramenta | Versão | Notas |
|---|---|---|
| Node.js | ≥ 20 | |
| Rust | ≥ 1.77 (stable) | https://rustup.rs |
| Python | 3.10–3.12 | 3.13 ainda não tem wheels estáveis pra demucs |
| ffmpeg | binário estático | baixe pra cada plataforma e coloque em `src-tauri/binaries/ffmpeg-<target-triple>[.exe]` |

Em Windows também precisa de [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (incluso no Windows 11). Em Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, etc — ver docs do Tauri.

## Setup

```bash
# 1. deps frontend
npm install

# 2. deps + binário do sidecar Python pra plataforma atual
bash scripts/build-sidecar.sh

# 3. dev
npm run tauri:dev
```

## Estrutura

```
.
├── src/                     # React frontend
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── sidecar/         # gerencia processo Python
│   │   ├── commands/        # handlers #[tauri::command]
│   │   ├── cache/           # leitura/limpeza do cache no FS
│   │   └── events/          # emissor pra frontend
│   └── binaries/            # sidecars (gitignored)
├── python-sidecar/          # CLI Python + PyInstaller
│   └── stem_splitter/
└── docs/PROTOCOLO_IPC.md    # contrato Rust ↔ Python
```

## Desenvolvimento

### Testar o sidecar Python isolado

```bash
cd python-sidecar
source .venv/bin/activate
python -m stem_splitter process --url "https://youtu.be/<id>" --output-dir ./out
```

Cada linha do stdout é um evento JSONL — ver `docs/PROTOCOLO_IPC.md`.

### Frontend sozinho (sem Tauri)

Não tem mock — o frontend só funciona dentro do `tauri dev` porque depende de `invoke()` e do plugin de eventos.

### Build de produção

```bash
bash scripts/package-app.sh
# artefatos: src-tauri/target/release/bundle/{msi,dmg,deb,AppImage}/
```

## Bundle

Esperado: ~2.5–3 GB instalado (PyTorch domina). Modelo Demucs (~250 MB) é baixado on-demand no primeiro uso.

## Status das fases

- [x] Fase 0 — scaffold do monorepo
- [x] Fase 1 — pipeline Python (CLI testável)
- [x] Fase 2 — script PyInstaller
- [x] Fase 3 — integração Tauri ↔ sidecar
- [x] Fase 4 — UI principal (input + progresso)
- [x] Fase 5 — player com waveform / mute / solo
- [x] Fase 6 — export e download seletivo
- [x] Fase 7 — settings e gerenciamento de cache
- [~] Fase 8 — About + CI matrix prontos. Code signing pendente (precisa de certificados).

## Placeholders de dev

Pra `cargo check` / `tauri dev` rodarem antes do build do sidecar real:

- `src-tauri/binaries/stem-splitter-sidecar-<triple>[.exe]` — arquivos vazios stub (gitignored). Substitua rodando `bash scripts/build-sidecar.sh`.
- `src-tauri/binaries/ffmpeg-<triple>[.exe]` — baixe um build estático em https://ffmpeg.org/download.html.
- `src-tauri/icons/icon.ico` — placeholder 16×16. Substitua via `npx tauri icon <path-to-1024.png>`.

Ver [`plan.md`](./plan.md) pra detalhes de cada fase.

## Limitações conhecidas

- Separação de **guitarra/piano** é notavelmente inferior a vocal/bateria (limitação do modelo).
- Memória: separação consome 4–8 GB de RAM. Pode crashar em máquinas com < 8 GB.
- Code signing macOS via PyInstaller é não-trivial (Fase 8).
