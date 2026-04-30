from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from stem_splitter import cache


URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
URL_SHORT = "https://youtu.be/dQw4w9WgXcQ"


def make_stems(tmp: Path) -> dict[str, Path]:
    tmp.mkdir(parents=True, exist_ok=True)
    out: dict[str, Path] = {}
    for name in ("vocals", "drums", "bass", "guitar", "piano", "other"):
        p = tmp / f"{name}.wav"
        p.write_bytes(b"RIFF" + b"\x00" * 100)  # bytes arbitrários
        out[name] = p
    return out


def test_cache_key_stable_across_url_forms():
    assert cache.cache_key_for_url(URL) == cache.cache_key_for_url(URL_SHORT)


def test_store_and_lookup(tmp_path):
    stems_dir = tmp_path / "stems"
    stems_dir.mkdir()
    stems = make_stems(stems_dir)
    cache_dir = tmp_path / "cache"

    stored = cache.store(URL, stems, cache_dir)
    assert stored.directory.exists()
    assert (stored.directory / "metadata.json").exists()

    hit = cache.lookup(URL, cache_dir)
    assert hit is not None
    assert hit.cache_key == stored.cache_key
    assert set(hit.stems.keys()) == set(stems.keys())


def test_lookup_miss_returns_none(tmp_path):
    assert cache.lookup(URL, tmp_path / "empty") is None


def test_lookup_invalid_url_returns_none(tmp_path):
    assert cache.lookup("https://example.com/", tmp_path) is None


def test_evict_lru_respects_limit(tmp_path):
    cache_dir = tmp_path / "cache"
    # Store dois entries com um pequeno gap pra mtimes serem distintos.
    stems1 = make_stems(tmp_path / "a")
    cache.store(URL, stems1, cache_dir)

    other_url = "https://youtu.be/abcdefghijk"
    time.sleep(0.05)
    stems2 = make_stems(tmp_path / "b")
    # Aumenta o conteúdo do segundo pra ultrapassar limite.
    for p in stems2.values():
        p.write_bytes(b"X" * 4096)
    cache.store(other_url, stems2, cache_dir)

    # Limite muito baixo força eviction.
    removed = cache.evict_lru(cache_dir, limit_bytes=1)
    assert removed > 0
    # O mais antigo (URL) deve ter ido embora primeiro.
    assert cache.lookup(URL, cache_dir) is None


def test_metadata_contents(tmp_path):
    stems = make_stems(tmp_path)
    cached = cache.store(URL, stems, tmp_path / "c", extra_meta={"model": "htdemucs_6s"})
    meta = json.loads((cached.directory / "metadata.json").read_text())
    assert meta["model"] == "htdemucs_6s"
    assert meta["video_id"] == "dQw4w9WgXcQ"
