"""Wrapper sobre yt-dlp pra baixar best audio em WAV."""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path
from typing import Any

from .progress import Emitter


def _find_ffmpeg() -> str | None:
    """Localiza o binário do ffmpeg. Ordem:
    1. PATH (dev local com ffmpeg instalado).
    2. Pasta do executável atual (PyInstaller --onefile extrai mas
       `sys.executable` aponta pro .exe original, então ffmpeg vizinho casa).
    3. None (yt-dlp vai falhar com mensagem clara).
    """
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        for cand in ("ffmpeg.exe", "ffmpeg"):
            p = exe_dir / cand
            if p.exists():
                return str(p)
        # Tauri cria com sufixo de target-triple.
        for p in sorted(exe_dir.glob("ffmpeg-*")):
            if p.is_file() and not p.suffix in (".zip", ".tar"):
                return str(p)
    return None

YOUTUBE_RE = re.compile(
    r"^https?://(?:www\.|m\.)?(?:youtube\.com/(?:watch\?v=|shorts/|embed/|live/)|youtu\.be/)"
    r"(?P<id>[A-Za-z0-9_-]{11})"
)


class InvalidURL(ValueError):
    pass


class DownloadFailed(RuntimeError):
    def __init__(self, message: str, code: str = "DOWNLOAD_FAILED") -> None:
        super().__init__(message)
        self.code = code


def extract_video_id(url: str) -> str:
    m = YOUTUBE_RE.match(url.strip())
    if not m:
        raise InvalidURL(f"URL não-YouTube: {url}")
    return m.group("id")


def download(url: str, output_dir: Path, emitter: Emitter) -> tuple[Path, str | None]:
    """Baixa best audio em WAV, retorna (path do arquivo, título do YouTube)."""
    video_id = extract_video_id(url)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"{video_id}.wav"

    # Import tardio: yt-dlp puxa mtuto código.
    try:
        from yt_dlp import YoutubeDL  # type: ignore
        from yt_dlp.utils import DownloadError  # type: ignore
    except ImportError as e:
        raise DownloadFailed(f"yt-dlp ausente: {e}", code="INTERNAL")

    last_pct = -1.0

    def hook(d: dict[str, Any]) -> None:
        nonlocal last_pct
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes") or 0
            pct = (done / total * 100.0) if total else 0.0
            # Throttle: só emite a cada ~1%.
            if pct - last_pct >= 1.0:
                emitter.progress("download", pct, "Baixando áudio...")
                last_pct = pct
        elif status == "finished":
            emitter.progress("download", 100.0, "Download concluído, convertendo...")

    ydl_opts: dict[str, Any] = {
        "format": "bestaudio/best",
        "outtmpl": str(output_dir / f"{video_id}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,  # suprime tqdm que polui nosso stdout JSONL
        "progress_hooks": [hook],
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "0",
        }],
    }
    ffmpeg_path = _find_ffmpeg()
    if ffmpeg_path:
        ydl_opts["ffmpeg_location"] = ffmpeg_path
        emitter.log("debug", f"ffmpeg: {ffmpeg_path}")

    title: str | None = None
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if isinstance(info, dict):
                raw_title = info.get("title")
                if isinstance(raw_title, str) and raw_title.strip():
                    title = raw_title.strip()
    except DownloadError as e:
        msg = str(e)
        code = "VIDEO_UNAVAILABLE" if any(
            kw in msg.lower() for kw in ("private", "unavailable", "removed", "blocked")
        ) else "DOWNLOAD_FAILED"
        raise DownloadFailed(msg, code=code) from e
    except Exception as e:
        raise DownloadFailed(f"falha inesperada: {e}", code="DOWNLOAD_FAILED") from e

    if not target.exists():
        # yt-dlp pode ter escrito com extensão diferente; pega o primeiro .wav que casa.
        candidates = list(output_dir.glob(f"{video_id}.*"))
        if not candidates:
            raise DownloadFailed("arquivo de saída não encontrado")
        target = candidates[0]

    emitter.stage_complete("download", str(target))
    return target, title
