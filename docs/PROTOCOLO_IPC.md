# Protocolo IPC — Rust ↔ Python Sidecar

Contrato entre o backend Rust (Tauri) e o sidecar Python. Versão **1.0**.

## Modelo

- **Comandos**: Rust → Python via `argv` (subcomandos).
- **Eventos**: Python → Rust via `stdout`, **uma linha JSON por evento** (JSON Lines / NDJSON).
- **Logs internos** que não são eventos vão pra `stderr` e o Rust os repassa pro tracing.
- **Exit code**: `0` em sucesso, `!= 0` em falha. O último evento antes de exit deve ser `complete` ou `error`.
- **Encoding**: UTF-8.
- **Flushing**: cada linha precisa ser `flush()`ada imediatamente (`print(..., flush=True)`).

## Comandos

```bash
sidecar device-info
sidecar download   --url <youtube_url>   --output-dir <path>
sidecar separate   --audio-path <path>   --model htdemucs_6s --output-dir <path>
sidecar process    --url <youtube_url>   --output-dir <path>
```

Flags globais:

- `--job-id <uuid>` — ecoado em todo evento, permite o frontend correlacionar streams paralelos.
- `--cache-dir <path>` — sobrescreve cache padrão. Default: `<app_data>/cache`.
- `--no-cache` — força reprocessamento.
- `--device {auto,cuda,mps,cpu}` — default `auto`.

## Eventos

Todo evento tem `event` (discriminator) + `job_id` + `ts` (epoch ms). Schemas adicionais por tipo:

### `progress`

```json
{"event":"progress","job_id":"…","ts":1730000000000,
 "stage":"download|separate|export","percent":45.2,"message":"Baixando áudio..."}
```

`percent` é 0–100, monotônico **dentro** do mesmo `stage` (resetar em transição).

### `stage_complete`

```json
{"event":"stage_complete","job_id":"…","ts":…,
 "stage":"download","output_path":"/tmp/.../audio.wav"}
```

### `stem_ready`

Emitido assim que cada stem é gravado em disco — permite ao frontend começar a carregar enquanto outros ainda processam.

```json
{"event":"stem_ready","job_id":"…","ts":…,
 "name":"vocals","path":"/tmp/.../vocals.wav","size_bytes":12345678}
```

`name` ∈ `{vocals, drums, bass, guitar, piano, other}`.

### `complete`

```json
{"event":"complete","job_id":"…","ts":…,
 "stems":[{"name":"vocals","path":"…"}, …],
 "cache_key":"abc123","cache_hit":false,
 "duration_seconds":210.5}
```

### `error`

```json
{"event":"error","job_id":"…","ts":…,
 "code":"DOWNLOAD_FAILED","message":"Vídeo privado",
 "details":"yt-dlp: ERROR: Private video","recoverable":false}
```

Códigos padronizados:

| Código | Significado |
|---|---|
| `INVALID_URL` | URL não-YouTube ou malformada. |
| `DOWNLOAD_FAILED` | Falha genérica de download. |
| `VIDEO_UNAVAILABLE` | Privado, removido, region-locked. |
| `MODEL_LOAD_FAILED` | Demucs não carregou (rede, disco, hash). |
| `SEPARATION_FAILED` | Inferência falhou. |
| `INSUFFICIENT_DISK` | Sem espaço pra cache/output. |
| `GPU_OOM` | OOM em CUDA/MPS — sugerir fallback CPU. |
| `CANCELLED` | Cancelamento via SIGTERM. |
| `INTERNAL` | Bug — stack trace em `details`. |

### `log`

Diagnóstico de baixo nível (não-fatal).

```json
{"event":"log","job_id":"…","ts":…,
 "level":"debug|info|warn|error","message":"Usando device: cuda"}
```

### `device_info` (resposta do comando `device-info`)

Único evento emitido por esse comando, seguido de exit 0.

```json
{"event":"device_info","ts":…,
 "available":["cuda","cpu"],"selected":"cuda",
 "details":{"cuda":{"name":"RTX 4090","vram_gb":24}}}
```

## Cancelamento

- Rust envia `SIGTERM` (Unix) ou `CTRL_BREAK_EVENT` (Windows).
- Python tem **5 s** pra emitir `error code=CANCELLED` e sair limpo. Após isso, `SIGKILL`.
- Arquivos parciais devem ser removidos antes do exit.

## Versionamento

O primeiro evento de qualquer comando que produz mais de um evento deve ser:

```json
{"event":"log","level":"info","message":"protocol_version=1.0"}
```

Mudanças incompatíveis bumpam major.
