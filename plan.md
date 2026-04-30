# Stem Splitter Desktop — Plano de Implementação

App desktop multi-plataforma que recebe URL do YouTube, separa a música em 6 stems (vocal, bateria, baixo, guitarra, piano, outros) usando Demucs localmente, e permite preview com waveform/mute/solo antes do download.

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Shell desktop | Tauri 2 (Rust) |
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| State management | Zustand |
| Player/Waveform | WaveSurfer.js v7 |
| Sidecar | Python 3.11 empacotado com PyInstaller |
| Download YouTube | yt-dlp |
| Separação de stems | Demucs (modelo `htdemucs_6s`) |
| Áudio/encoding | ffmpeg (binário sidecar) |
| Plataformas | Windows, macOS (Intel + Apple Silicon), Linux |

---

## Estrutura de Diretórios

```
stem-splitter/
├── src/                          # Frontend React
│   ├── components/
│   ├── stores/                   # Zustand stores
│   ├── hooks/
│   ├── lib/                      # Tauri invoke wrappers
│   ├── types/                    # TS types compartilhados
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                    # Backend Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/             # #[tauri::command] handlers
│   │   ├── sidecar/              # gerenciamento do processo Python
│   │   ├── cache/                # lógica de cache local
│   │   └── events/               # emit de progresso pro frontend
│   ├── binaries/                 # sidecars empacotados (gitignored)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── python-sidecar/               # Código Python
│   ├── stem_splitter/
│   │   ├── __init__.py
│   │   ├── main.py               # entrypoint CLI
│   │   ├── downloader.py         # yt-dlp wrapper
│   │   ├── separator.py          # demucs wrapper
│   │   ├── device.py             # detecção de GPU/MPS/CPU
│   │   ├── progress.py           # protocolo JSON via stdout
│   │   └── cache.py              # hash + lookup
│   ├── pyproject.toml
│   ├── build.py                  # script PyInstaller multi-OS
│   └── tests/
├── docs/
│   └── PROTOCOLO_IPC.md          # contrato Rust↔Python
├── scripts/
│   ├── build-sidecar.sh          # build do Python pra plataforma atual
│   └── package-app.sh            # build completo + bundling
├── package.json
└── README.md
```

---

## Contrato IPC (Rust ↔ Python)

O sidecar Python lê comandos via **argv** e emite eventos via **stdout** como **JSON Lines**. Cada linha é um evento auto-contido. O Rust faz parsing linha a linha e re-emite via Tauri events pro frontend.

### Comandos (Rust → Python via argv)

```bash
sidecar download --url "<youtube_url>" --output-dir "<path>"
sidecar separate --audio-path "<path>" --model htdemucs_6s --output-dir "<path>"
sidecar process --url "<youtube_url>" --output-dir "<path>"  # combo download+separate
sidecar device-info  # retorna GPU/MPS/CPU disponíveis
```

### Eventos (Python → Rust via stdout JSONL)

```json
{"event": "progress", "stage": "download", "percent": 45.2, "message": "Baixando áudio..."}
{"event": "progress", "stage": "separate", "percent": 12.0, "message": "Carregando modelo..."}
{"event": "stage_complete", "stage": "download", "output_path": "/tmp/.../audio.wav"}
{"event": "stem_ready", "name": "vocals", "path": "/tmp/.../vocals.wav"}
{"event": "complete", "stems": [{"name": "vocals", "path": "..."}, ...], "cache_key": "abc123"}
{"event": "error", "code": "DOWNLOAD_FAILED", "message": "Vídeo privado", "details": "..."}
{"event": "log", "level": "info", "message": "Usando device: cuda"}
```

**Códigos de erro padronizados**: `INVALID_URL`, `DOWNLOAD_FAILED`, `VIDEO_UNAVAILABLE`, `MODEL_LOAD_FAILED`, `SEPARATION_FAILED`, `INSUFFICIENT_DISK`, `GPU_OOM`.

---

## Fases de Implementação

Cada fase é **auto-contida e testável isoladamente**. Agentes podem ser disparados em paralelo nas fases marcadas com 🔀.

---

### Fase 0 — Setup do monorepo 🔀 (independente)

**Objetivo**: scaffold vazio funcionando com hot reload.

**Entregáveis**:
- `package.json` na raiz com scripts: `dev`, `build`, `build:sidecar`, `test`
- Tauri 2 inicializado em `src-tauri/` via `npm create tauri-app@latest` (template React + TS)
- Tailwind configurado (`tailwind.config.js`, `postcss.config.js`, diretivas em `index.css`)
- ESLint + Prettier + TS strict mode
- `.gitignore` cobrindo: `node_modules`, `target`, `dist`, `src-tauri/binaries/`, `.cache`, `__pycache__`, `*.spec`, `build/`
- README com instruções de setup

**Critério de aceitação**: `npm run tauri dev` abre janela vazia com hot reload funcionando no Windows, macOS e Linux.

---

### Fase 1 — Pipeline Python isolado 🔀 (independente da Fase 0)

**Objetivo**: CLI Python funcional que baixa do YouTube, separa em 6 stems e emite eventos JSONL. Testável sem Tauri.

**Tarefas**:

1. **Setup do projeto Python**
   - `pyproject.toml` com deps: `yt-dlp`, `demucs`, `torch`, `torchaudio`, `pydantic`
   - Estrutura de pacote `stem_splitter/`
   - `python -m stem_splitter --help` funciona

2. **Detecção de device** (`device.py`)
   - Função `detect_device() -> Literal["cuda", "mps", "cpu"]`
   - Ordem: CUDA disponível? → MPS disponível (macOS)? → CPU
   - Comando CLI `device-info` retorna JSON com info

3. **Downloader** (`downloader.py`)
   - Wrapper sobre `yt-dlp` que baixa best audio em WAV
   - Hook de progresso → emite evento `progress` com stage=`download`
   - Validação de URL (regex pra youtube.com/youtu.be)
   - Tratamento de erros: vídeo privado, indisponível, region-locked

4. **Separator** (`separator.py`)
   - Wrapper sobre `demucs` programático (não CLI)
   - Carrega modelo `htdemucs_6s` (lazy, cache em `~/.cache/torch/hub/`)
   - Emite progresso por chunk processado
   - Output: 6 WAVs nomeados (`vocals.wav`, `drums.wav`, `bass.wav`, `guitar.wav`, `piano.wav`, `other.wav`)
   - **Importante**: ao primeiro uso, o modelo (~250MB) é baixado automaticamente. Documentar isso.

5. **Cache** (`cache.py`)
   - Hash key = SHA256 do video ID do YouTube (extraído da URL)
   - Diretório de cache: `<app_data>/cache/<hash>/` contendo os 6 WAVs + `metadata.json`
   - `lookup(url) -> Optional[CachedResult]`
   - `store(url, stems) -> CacheKey`
   - Limite de tamanho configurável (default 10GB) com LRU eviction

6. **Progress protocol** (`progress.py`)
   - Função `emit(event_dict)` que faz `print(json.dumps(...), flush=True)`
   - Wrapper `Stage` context manager pra emitir start/complete

7. **Entrypoint** (`main.py`)
   - argparse com subcomandos: `download`, `separate`, `process`, `device-info`
   - Trata exceções globalmente → emite evento `error` e exit code != 0

**Critério de aceitação**:
```bash
python -m stem_splitter process --url "https://youtu.be/<id>" --output-dir ./out
```
Produz 6 WAVs na pasta `./out/<video_id>/` e emite stream de eventos JSONL no stdout. Funciona em CPU, CUDA e MPS.

**Testes**: pytest com mock do yt-dlp e demucs, testes unitários de cache e progress protocol.

---

### Fase 2 — Build do sidecar com PyInstaller 🔀 (depende de Fase 1)

**Objetivo**: binário standalone do Python pra cada plataforma, com nomenclatura que o Tauri espera.

**Tarefas**:

1. **`build.py`** que executa PyInstaller com:
   - `--onefile` (Windows/Linux) ou `--onedir` (macOS, melhor pra code signing)
   - `--collect-all demucs` (modelos e configs)
   - `--collect-all torch`
   - Hidden imports necessários (`torchaudio.transforms`, etc)
   - Output naming: `stem-splitter-sidecar-<target-triple>` onde target-triple é o que Tauri espera:
     - `x86_64-pc-windows-msvc.exe`
     - `x86_64-apple-darwin`
     - `aarch64-apple-darwin`
     - `x86_64-unknown-linux-gnu`

2. **`scripts/build-sidecar.sh`** detecta plataforma atual e chama `build.py` com target correto, copia output pra `src-tauri/binaries/`

3. **GitHub Actions workflow** (opcional mas recomendado): `build-sidecar.yml` rodando em matrix `[windows-latest, macos-13, macos-14, ubuntu-22.04]`

**Critério de aceitação**: binário standalone roda sem Python instalado e produz mesmo output da Fase 1.

**⚠️ Atenção**: bundle vai pesar 2-4GB por causa do PyTorch. Documentar isso no README.

---

### Fase 3 — Integração Tauri + sidecar (depende de Fase 0 e 2)

**Objetivo**: Rust spawna o sidecar Python, faz parsing do JSONL e re-emite eventos pro frontend.

**Tarefas**:

1. **`tauri.conf.json`**
   - Registrar sidecar em `bundle.externalBin`
   - Permissions: `shell:allow-execute`, `fs:allow-read`, `fs:allow-write` (com escopo restrito a `<app_data>` e `Downloads`)

2. **`src-tauri/src/sidecar/mod.rs`**
   - `struct SidecarManager` com método `spawn(args: Vec<String>) -> Result<SidecarHandle>`
   - `SidecarHandle` faz read line-by-line do stdout async (tokio)
   - Cada linha é deserializada em `enum SidecarEvent` (com serde) e re-emitida via `app_handle.emit("sidecar-event", event)`
   - Mata processo ao drop

3. **Tipos compartilhados** (`src-tauri/src/types.rs`)
   - `SidecarEvent` enum espelhando o protocolo JSONL
   - Gerar tipos TS via `ts-rs` ou `specta` (recomendado: specta)

4. **Comandos Tauri** (`src-tauri/src/commands/`)
   - `process_url(url: String) -> Result<JobId, String>` → spawna sidecar, retorna ID
   - `cancel_job(job_id: String) -> Result<()>` → mata processo
   - `get_device_info() -> Result<DeviceInfo>` → executa sidecar com `device-info`
   - `clear_cache() -> Result<()>` → remove diretório de cache
   - `get_cache_size() -> Result<u64>`
   - `export_stems(job_id: String, selected_stems: Vec<String>, format: AudioFormat, output_path: PathBuf)` → usa ffmpeg sidecar pra converter pra MP3 se necessário, copia pra destino

5. **ffmpeg como segundo sidecar**
   - Baixar binários estáticos de https://ffmpeg.org pra cada plataforma
   - Registrar em `tauri.conf.json` igual ao Python
   - Usar via `tauri_plugin_shell::ShellExt::sidecar()`

**Critério de aceitação**: chamar `process_url` do frontend dispara o sidecar e o frontend recebe stream de eventos. Cancelamento funciona.

---

### Fase 4 — Frontend: tela principal e fluxo de processamento (depende de Fase 3)

**Objetivo**: UI funcional ponta-a-ponta, do input ao preview.

**Tarefas**:

1. **Setup**
   - Zustand store `useJobStore`: estado do job atual (`idle | downloading | separating | ready | error`)
   - Hook `useTauriEvent('sidecar-event', handler)` que escuta eventos e atualiza store
   - Wrappers tipados em `lib/tauri.ts` pra cada comando

2. **Tela inicial** (`components/UrlInput.tsx`)
   - Input de URL com validação visual
   - Botão "Processar"
   - Detecção e display do device (CPU/GPU) na barra inferior

3. **Tela de progresso** (`components/ProgressView.tsx`)
   - Barra de progresso global
   - Sub-progresso por stage (download / separação)
   - Botão "Cancelar"
   - Logs em tempo real (collapsible)

4. **Indicador de cache hit**: se URL já foi processada, pula direto pro preview com mensagem "Resultado em cache"

5. **Tratamento de erros**: mapear códigos de erro do sidecar pra mensagens amigáveis em português

**Critério de aceitação**: usuário cola URL, vê progresso em tempo real, e ao final é redirecionado pra tela de preview (Fase 5).

---

### Fase 5 — Player com waveform, mute/solo (depende de Fase 4) 🔀 com Fase 6

**Objetivo**: 6 waveforms sincronizados com controles individuais.

**Tarefas**:

1. **WaveSurfer.js v7 setup**
   - Plugin `wavesurfer.js/dist/plugins/regions` (opcional, pra loops futuros)
   - Um WaveSurfer por stem, todos compartilhando timeline

2. **`components/StemPlayer.tsx`**
   - Lista de 6 stems com:
     - Waveform renderizado (cores diferentes por stem)
     - Botão Mute (M)
     - Botão Solo (S)
     - Slider de volume individual
     - Indicador de level/RMS (opcional)
   - Controles globais: Play/Pause, seek bar, tempo atual / total

3. **Sincronização**
   - Master clock controla todos os WaveSurfers
   - Seek num waveform = seek em todos
   - Hook `useStemPlayer(stems)` encapsula a lógica

4. **Lógica solo/mute**
   - Solo num stem = mute em todos os outros
   - Solo em múltiplos = OR (toca os solo'd, muta o resto)
   - Estado local no Zustand store `usePlayerStore`

5. **Performance**
   - Lazy load do waveform (peaks pré-computados se possível, senão renderiza on-mount)
   - WAVs grandes podem ser pesados; considerar carregar versões em MP3 pra preview

**Critério de aceitação**: 6 waveforms sincronizados, mute/solo responsivo, sem desync perceptível.

---

### Fase 6 — Export e download seletivo (depende de Fase 4) 🔀 com Fase 5

**Objetivo**: usuário escolhe stems + formato e baixa.

**Tarefas**:

1. **`components/ExportDialog.tsx`**
   - Checkboxes pros 6 stems (default: todos selecionados)
   - Radio: WAV / MP3
   - Slider de bitrate se MP3 (128/192/320 kbps)
   - Opção "Baixar como ZIP" se múltiplos stems
   - Botão "Salvar em..." abre `dialog::save` do Tauri

2. **Comando Rust `export_stems`**
   - Se WAV: copia direto do cache pro destino
   - Se MP3: spawna ffmpeg sidecar pra cada stem
   - Se ZIP: usa crate `zip` pra empacotar
   - Emite eventos de progresso de export

3. **Notificação** ao concluir (plugin `tauri-plugin-notification`)

**Critério de aceitação**: stems selecionados aparecem no destino escolhido, no formato correto.

---

### Fase 7 — Configurações e gerenciamento de cache (depende de Fase 4)

**Objetivo**: tela de settings.

**Tarefas**:

- Tela `Settings`: limite de cache, pasta de output padrão, qualidade de download (best/high/medium), forçar device específico
- Botão "Limpar cache" com confirmação
- Display do tamanho atual do cache
- Persistência via `tauri-plugin-store`

---

### Fase 8 — Polish e empacotamento final (depende de tudo)

**Tarefas**:

- Ícones do app (`tauri icon <path>`)
- Code signing
  - macOS: Apple Developer ID + notarização
  - Windows: certificado Authenticode (ou ship unsigned com aviso)
  - Linux: AppImage não precisa
- Auto-update via `tauri-plugin-updater` (opcional)
- Tela "Sobre" com versão, créditos (Demucs, yt-dlp), licenças
- Build matrix no CI gerando .dmg, .msi, .AppImage, .deb
- README final com screenshots e instruções de instalação

---

## Considerações Críticas

### Performance esperada (música de 3:30)
| Device | Tempo |
|---|---|
| CPU (8 cores modernos) | 3-5 min |
| Apple Silicon (MPS) | 30-60 s |
| NVIDIA RTX (CUDA) | 10-20 s |

### Tamanho do bundle final
- App Tauri base: ~10MB
- Python sidecar (PyInstaller): ~2GB
- Modelo Demucs (baixado on demand): ~250MB
- ffmpeg: ~80MB
- **Total instalado**: ~2.5-3GB

### Limitações conhecidas
- **Qualidade 6 stems**: separação de guitarra/piano é notavelmente inferior a vocal/bateria. É limitação do modelo Demucs.
- **YouTube ToS**: download viola os termos de serviço do YouTube. Documentar uso pessoal/educacional. Não distribuir como produto comercial.
- **Primeiro uso lento**: download do modelo Demucs (~250MB) acontece no primeiro processamento.
- **Memória**: separação consome 4-8GB RAM. App pode crashar em máquinas com <8GB.

### Riscos técnicos
- **PyInstaller + PyTorch é frágil**: hidden imports e dynamic loading. Reservar tempo extra na Fase 2.
- **ffmpeg licensing**: builds estáticos GPL — verificar compatibilidade com a licença do app.
- **Code signing macOS**: notarização do binário Python via PyInstaller é não-trivial. Pode precisar `--target-arch universal2` e ajustes.

---

## Ordem Sugerida de Disparo de Agentes

```
Sprint 1 (paralelo):
  ├─ Agente A → Fase 0 (scaffold Tauri)
  └─ Agente B → Fase 1 (pipeline Python)

Sprint 2:
  └─ Agente C → Fase 2 (PyInstaller) — depende de B

Sprint 3:
  └─ Agente D → Fase 3 (integração Tauri+sidecar) — depende de A e C

Sprint 4 (paralelo):
  ├─ Agente E → Fase 4 (frontend principal)
  └─ Agente F → Fase 7 (settings)

Sprint 5 (paralelo):
  ├─ Agente G → Fase 5 (player/waveform)
  └─ Agente H → Fase 6 (export)

Sprint 6:
  └─ Agente I → Fase 8 (polish + CI/CD)
```

Cada agente recebe: a fase correspondente deste doc + o `PROTOCOLO_IPC.md` + acesso aos critérios de aceitação. Testes da fase devem passar antes do merge.