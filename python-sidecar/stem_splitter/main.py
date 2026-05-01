"""Entrypoint CLI do sidecar. Comandos: device-info, download, separate, process."""
from __future__ import annotations

import argparse
import os
import shutil
import signal
import sys
import tempfile
import time
import traceback
from pathlib import Path

from . import PROTOCOL_VERSION
from .progress import Emitter


def _ensure_ffmpeg_on_path() -> None:
    """yt-dlp e demucs invocam `ffmpeg` literal da PATH. No bundle PyInstaller
    o binário tem sufixo target-triple — cria um shim sem sufixo num tempdir
    estável e prepende na PATH."""
    from .downloader import _find_ffmpeg

    found = _find_ffmpeg()
    if not found:
        return
    found_path = Path(found)
    # Já é "ffmpeg.exe" / "ffmpeg" → só garante que o dir está na PATH.
    if found_path.stem == "ffmpeg":
        os.environ["PATH"] = str(found_path.parent) + os.pathsep + os.environ.get("PATH", "")
        return
    # Shim: copia pra %TEMP%/stem-splitter-ffmpeg/ffmpeg.exe (idempotente).
    shim_dir = Path(tempfile.gettempdir()) / "stem-splitter-ffmpeg"
    shim_dir.mkdir(exist_ok=True)
    shim = shim_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not shim.exists() or shim.stat().st_size != found_path.stat().st_size:
        shutil.copy2(found_path, shim)
    os.environ["PATH"] = str(shim_dir) + os.pathsep + os.environ.get("PATH", "")


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="stem-splitter-sidecar")
    p.add_argument("--job-id", default="", help="UUID ecoado em todo evento")
    p.add_argument("--cache-dir", default="", help="Diretório de cache")
    p.add_argument("--no-cache", action="store_true")
    p.add_argument("--device", choices=["auto", "cuda", "mps", "cpu"], default="auto")

    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("device-info", help="Reporta GPU/MPS/CPU disponíveis")

    dl = sub.add_parser("download", help="Baixa áudio do YouTube")
    dl.add_argument("--url", required=True)
    dl.add_argument("--output-dir", required=True)

    sep = sub.add_parser("separate", help="Separa áudio em 4 stems")
    sep.add_argument("--audio-path", required=True)
    sep.add_argument("--output-dir", required=True)
    sep.add_argument("--model", default="htdemucs_ft")

    pr = sub.add_parser("process", help="Download + separação")
    pr.add_argument("--url", required=True)
    pr.add_argument("--output-dir", required=True)
    pr.add_argument("--model", default="htdemucs_ft")

    pf = sub.add_parser("prefetch-model", help="Pre-baixa pesos do Demucs")
    pf.add_argument("--model", default="htdemucs_ft")

    return p


def _install_sigterm_handler(emitter: Emitter) -> None:
    def handler(signum, _frame):  # type: ignore[no-untyped-def]
        emitter.error("CANCELLED", f"sinal recebido: {signum}", recoverable=False)
        sys.exit(130)
    try:
        signal.signal(signal.SIGTERM, handler)
        signal.signal(signal.SIGINT, handler)
    except (ValueError, OSError):
        # Windows não suporta todos os signals em todos os contextos.
        pass


def cmd_device_info(emitter: Emitter, _args: argparse.Namespace) -> int:
    from .device import detect_device, list_available, device_details
    emitter.device_info(
        available=list_available(),
        selected=detect_device(),
        details=device_details(),
    )
    return 0


def cmd_download(emitter: Emitter, args: argparse.Namespace) -> int:
    from .downloader import download, InvalidURL, DownloadFailed
    try:
        download(args.url, Path(args.output_dir), emitter)
        return 0
    except InvalidURL as e:
        emitter.error("INVALID_URL", str(e))
        return 2
    except DownloadFailed as e:
        emitter.error(e.code, str(e))
        return 3



def cmd_separate(emitter: Emitter, args: argparse.Namespace) -> int:
    from .separator import separate, SeparationFailed
    try:
        separate(
            Path(args.audio_path),
            Path(args.output_dir),
            emitter,
            model_name=args.model,
            device=None if args.device == "auto" else args.device,
        )
        return 0
    except SeparationFailed as e:
        emitter.error(e.code, str(e))
        return 4


def cmd_process(emitter: Emitter, args: argparse.Namespace) -> int:
    from .downloader import download, InvalidURL, DownloadFailed
    from .separator import separate, SeparationFailed
    from . import cache as cache_mod

    cache_dir = Path(args.cache_dir) if args.cache_dir else Path(args.output_dir) / ".cache"
    started = time.time()

    # Cache hit?
    if not args.no_cache:
        try:
            hit = cache_mod.lookup(args.url, cache_dir)
        except Exception:
            hit = None
        if hit:
            emitter.log("info", f"cache hit: {hit.cache_key}")
            for name, path in hit.stems.items():
                emitter.stem_ready(name, str(path), path.stat().st_size)
            cached_title = hit.metadata.get("title")
            emitter.complete(
                stems=[{"name": n, "path": str(p)} for n, p in hit.stems.items()],
                cache_key=hit.cache_key,
                cache_hit=True,
                duration_seconds=time.time() - started,
                title=cached_title if isinstance(cached_title, str) else None,
            )
            return 0

    # Download
    try:
        audio_path, title = download(args.url, Path(args.output_dir), emitter)
    except InvalidURL as e:
        emitter.error("INVALID_URL", str(e))
        return 2
    except DownloadFailed as e:
        emitter.error(e.code, str(e))
        return 3

    # Separação
    stems_dir = Path(args.output_dir) / audio_path.stem
    try:
        stems = separate(
            audio_path,
            stems_dir,
            emitter,
            model_name=args.model,
            device=None if args.device == "auto" else args.device,
        )
    except SeparationFailed as e:
        emitter.error(e.code, str(e))
        return 4

    # Cache store
    try:
        extra_meta = {"title": title} if title is not None else None
        cached = cache_mod.store(args.url, stems, cache_dir, extra_meta=extra_meta)
        cache_mod.evict_lru(cache_dir)
        cache_key = cached.cache_key
        final_stems = cached.stems
    except Exception as e:
        emitter.log("warn", f"cache store falhou: {e}")
        cache_key = ""
        final_stems = stems

    emitter.complete(
        stems=[{"name": n, "path": str(p)} for n, p in final_stems.items()],
        cache_key=cache_key,
        cache_hit=False,
        duration_seconds=time.time() - started,
        title=title,
    )
    return 0


def cmd_prefetch_model(emitter: Emitter, args: argparse.Namespace) -> int:
    from .prefetch import prefetch_model
    from .separator import SeparationFailed
    try:
        prefetch_model(emitter, model_name=args.model)
        return 0
    except SeparationFailed as e:
        emitter.error(e.code, str(e))
        return 4


COMMANDS = {
    "device-info": cmd_device_info,
    "download": cmd_download,
    "separate": cmd_separate,
    "process": cmd_process,
    "prefetch-model": cmd_prefetch_model,
}


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    emitter = Emitter(job_id=args.job_id)
    _install_sigterm_handler(emitter)

    # Garante que ffmpeg é resolvível antes do downloader/separator rodarem.
    if args.cmd in ("download", "separate", "process"):
        _ensure_ffmpeg_on_path()

    if args.cmd != "device-info":
        emitter.log("info", f"protocol_version={PROTOCOL_VERSION}")

    try:
        return COMMANDS[args.cmd](emitter, args)
    except SystemExit:
        raise
    except KeyboardInterrupt:
        emitter.error("CANCELLED", "interrompido pelo usuário")
        return 130
    except Exception as e:
        emitter.error("INTERNAL", str(e), details=traceback.format_exc())
        return 1
