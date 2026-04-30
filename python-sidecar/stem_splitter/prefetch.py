"""Pre-download dos pesos do Demucs antes do primeiro `separate`.

`get_model("htdemucs_6s")` baixa um saco de 4 sub-modelos via
`torch.hub.download_url_to_file`, que normalmente imprime tqdm em stderr.
Aqui substituímos a função por uma versão que emite eventos `progress`
JSONL no nosso canal padrão, com `stage="prefetch"`.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .progress import Emitter
from .separator import DEFAULT_MODEL, SeparationFailed


def prefetch_model(
    emitter: Emitter,
    model_name: str = DEFAULT_MODEL,
) -> None:
    """Baixa (se necessário) os pesos do modelo, emitindo progresso."""
    emitter.progress("prefetch", 0.0, "Verificando modelo...")
    try:
        import torch  # noqa: F401  (preciso pra patch hub)
        from demucs.pretrained import get_model  # type: ignore
    except ImportError as e:
        raise SeparationFailed(f"demucs/torch ausente: {e}", code="MODEL_LOAD_FAILED") from e

    state = _PrefetchState(emitter)
    _patch_torch_hub(state)

    try:
        get_model(model_name)
    except Exception as e:
        raise SeparationFailed(
            f"falha pre-carregando modelo: {e}",
            code="MODEL_LOAD_FAILED",
        ) from e
    finally:
        _restore_torch_hub()

    # Se nada foi baixado (cache hit), salta direto pra 100%.
    if state.files_total == 0:
        emitter.progress("prefetch", 100.0, "Modelo já estava em cache")
    emitter.stage_complete("prefetch", "")


# ---------- Internals ----------


class _PrefetchState:
    def __init__(self, emitter: Emitter) -> None:
        self.emitter = emitter
        self.files_total = 0
        self.file_index = 0
        self.last_global_pct = -1.0


_original_download: Any = None


def _patch_torch_hub(state: _PrefetchState) -> None:
    global _original_download
    import torch.hub as hub

    if _original_download is None:
        _original_download = hub.download_url_to_file
    hub.download_url_to_file = _make_patched_download(state)


def _restore_torch_hub() -> None:
    global _original_download
    if _original_download is None:
        return
    import torch.hub as hub
    hub.download_url_to_file = _original_download
    _original_download = None


def _make_patched_download(state: _PrefetchState):
    def patched(
        url: str,
        dst: str,
        hash_prefix: str | None = None,
        progress: bool = True,  # noqa: ARG001 — ignorado, sempre emitimos
    ) -> None:
        # Cada chamada = um sub-modelo. Como get_model não nos diz quantos
        # vão ser, estimamos com base no nome (htdemucs_6s = bag de 4).
        # Se acertar, progresso global é suave; se não, o último sub-modelo
        # ainda termina em 100% no stage_complete.
        if state.files_total == 0:
            state.files_total = _guess_total_files()
        state.file_index += 1

        from urllib.request import Request, urlopen
        import hashlib

        url_name = os.path.basename(urlparse(url).path) or "modelo"
        state.emitter.log("info", f"baixando {url_name} ({state.file_index}/{state.files_total})")

        req = Request(url, headers={"User-Agent": "stem-splitter/1.0"})
        with urlopen(req) as resp:
            content_length = resp.headers.get("Content-Length")
            file_size = int(content_length) if content_length else 0

            dst_path = Path(os.path.expanduser(dst))
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = tempfile.NamedTemporaryFile(delete=False, dir=str(dst_path.parent))
            sha256 = hashlib.sha256() if hash_prefix else None
            try:
                done = 0
                last_local = -1.0
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    tmp.write(chunk)
                    if sha256 is not None:
                        sha256.update(chunk)
                    done += len(chunk)

                    local_pct = (done / file_size * 100.0) if file_size else 0.0
                    # Throttle por sub-arquivo (~1%) e converte pra percent global.
                    if local_pct - last_local >= 1.0:
                        last_local = local_pct
                        global_pct = _global_percent(state, local_pct)
                        if global_pct - state.last_global_pct >= 0.5:
                            state.last_global_pct = global_pct
                            state.emitter.progress(
                                "prefetch",
                                global_pct,
                                f"Baixando modelo: {url_name} "
                                f"({state.file_index}/{state.files_total})",
                            )
                tmp.close()

                if sha256 is not None and hash_prefix is not None:
                    digest = sha256.hexdigest()
                    if not digest.startswith(hash_prefix):
                        raise RuntimeError(
                            f"hash mismatch baixando {url_name}: "
                            f"got {digest}, expected prefix {hash_prefix}"
                        )

                shutil.move(tmp.name, str(dst_path))
            finally:
                if not tmp.closed:
                    tmp.close()
                if os.path.exists(tmp.name):
                    try:
                        os.remove(tmp.name)
                    except OSError:
                        pass

    return patched


def _guess_total_files() -> int:
    # htdemucs_6s é um bag de 4 sub-modelos. Outros modelos tipicamente 1.
    # Se errarmos, o `stage_complete` no fim ainda força 100% na UI.
    return 4


def _global_percent(state: _PrefetchState, local_pct: float) -> float:
    total = max(state.files_total, 1)
    base = (state.file_index - 1) / total * 100.0
    span = 100.0 / total
    return min(99.5, base + span * (local_pct / 100.0))
