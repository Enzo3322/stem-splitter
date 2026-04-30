"""Cache local: hash(video_id) → diretório com 6 WAVs + metadata.json."""
from __future__ import annotations

import hashlib
import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from .downloader import extract_video_id

DEFAULT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB
METADATA_FILE = "metadata.json"


@dataclass(frozen=True)
class CachedResult:
    cache_key: str
    directory: Path
    stems: dict[str, Path]
    metadata: dict


def cache_key_for_url(url: str) -> str:
    """Hash determinístico baseado no video_id, não na URL inteira (evita
    diferenças entre `youtu.be/X` e `youtube.com/watch?v=X`)."""
    vid = extract_video_id(url)
    return hashlib.sha256(vid.encode("utf-8")).hexdigest()[:16]


def lookup(url: str, cache_dir: Path) -> CachedResult | None:
    try:
        key = cache_key_for_url(url)
    except Exception:
        return None
    target = Path(cache_dir) / key
    meta_path = target / METADATA_FILE
    if not meta_path.exists():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    stems_meta = meta.get("stems", {})
    stems: dict[str, Path] = {}
    for name, rel in stems_meta.items():
        path = target / rel
        if not path.exists():
            return None
        stems[name] = path
    # Touch metadata pra atualizar mtime (LRU).
    target.touch()
    return CachedResult(cache_key=key, directory=target, stems=stems, metadata=meta)


def store(
    url: str,
    stems: dict[str, Path],
    cache_dir: Path,
    extra_meta: dict | None = None,
) -> CachedResult:
    """Move/copia os WAVs pro cache, escreve metadata.json."""
    key = cache_key_for_url(url)
    target = Path(cache_dir) / key
    target.mkdir(parents=True, exist_ok=True)

    rel_paths: dict[str, str] = {}
    for name, src in stems.items():
        dst = target / f"{name}.wav"
        if src.resolve() != dst.resolve():
            shutil.copy2(src, dst)
        rel_paths[name] = dst.name

    meta = {
        "url": url,
        "video_id": extract_video_id(url),
        "stems": rel_paths,
        "stored_at": int(time.time()),
        **(extra_meta or {}),
    }
    (target / METADATA_FILE).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    return CachedResult(
        cache_key=key,
        directory=target,
        stems={n: target / r for n, r in rel_paths.items()},
        metadata=meta,
    )


def total_size(cache_dir: Path) -> int:
    total = 0
    for p in Path(cache_dir).rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total


def evict_lru(cache_dir: Path, limit_bytes: int = DEFAULT_LIMIT_BYTES) -> int:
    """Remove diretórios mais antigos até total <= limit_bytes. Retorna bytes removidos."""
    cache_dir = Path(cache_dir)
    if not cache_dir.exists():
        return 0
    entries = [p for p in cache_dir.iterdir() if p.is_dir()]
    entries.sort(key=lambda p: p.stat().st_mtime)  # ascendente: mais antigo primeiro
    removed = 0
    while total_size(cache_dir) > limit_bytes and entries:
        oldest = entries.pop(0)
        size = sum(f.stat().st_size for f in oldest.rglob("*") if f.is_file())
        shutil.rmtree(oldest, ignore_errors=True)
        removed += size
    return removed


def clear(cache_dir: Path) -> None:
    cache_dir = Path(cache_dir)
    if cache_dir.exists():
        shutil.rmtree(cache_dir, ignore_errors=True)
