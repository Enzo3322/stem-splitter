"""Emite eventos JSONL no stdout. Contrato: docs/PROTOCOLO_IPC.md."""
from __future__ import annotations

import json
import sys
import time
from contextlib import contextmanager
from typing import Any, Iterator, Literal


Level = Literal["debug", "info", "warn", "error"]
Stage = Literal["download", "separate", "export", "prefetch"]


def _now_ms() -> int:
    return int(time.time() * 1000)


class Emitter:
    """Single point of stdout emission. Holds the current job_id so callers
    don't have to thread it through every call."""

    def __init__(self, job_id: str = "") -> None:
        self.job_id = job_id

    def _emit(self, payload: dict[str, Any]) -> None:
        payload.setdefault("ts", _now_ms())
        if self.job_id and "job_id" not in payload:
            payload["job_id"] = self.job_id
        sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
        sys.stdout.flush()

    # --- typed helpers ---

    def progress(self, stage: Stage, percent: float, message: str = "") -> None:
        self._emit({
            "event": "progress",
            "stage": stage,
            "percent": max(0.0, min(100.0, float(percent))),
            "message": message,
        })

    def stage_complete(self, stage: Stage, output_path: str) -> None:
        self._emit({"event": "stage_complete", "stage": stage, "output_path": output_path})

    def stem_ready(self, name: str, path: str, size_bytes: int) -> None:
        self._emit({
            "event": "stem_ready", "name": name, "path": path, "size_bytes": int(size_bytes),
        })

    def complete(
        self,
        stems: list[dict[str, Any]],
        cache_key: str,
        cache_hit: bool = False,
        duration_seconds: float = 0.0,
    ) -> None:
        self._emit({
            "event": "complete",
            "stems": stems,
            "cache_key": cache_key,
            "cache_hit": cache_hit,
            "duration_seconds": float(duration_seconds),
        })

    def error(
        self,
        code: str,
        message: str,
        details: str | None = None,
        recoverable: bool = False,
    ) -> None:
        payload: dict[str, Any] = {
            "event": "error", "code": code, "message": message, "recoverable": recoverable,
        }
        if details is not None:
            payload["details"] = details
        self._emit(payload)

    def log(self, level: Level, message: str) -> None:
        self._emit({"event": "log", "level": level, "message": message})

    def device_info(
        self,
        available: list[str],
        selected: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self._emit({
            "event": "device_info",
            "available": available,
            "selected": selected,
            "details": details or {},
        })

    @contextmanager
    def stage(self, stage: Stage) -> Iterator["Emitter"]:
        """Context manager: emite progress(0) na entrada e stage_complete na saída limpa."""
        self.progress(stage, 0.0, f"iniciando {stage}")
        try:
            yield self
        except Exception:
            raise
