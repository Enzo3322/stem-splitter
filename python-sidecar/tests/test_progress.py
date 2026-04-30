"""Verifica que Emitter produz JSONL conforme contrato."""
from __future__ import annotations

import json

from stem_splitter.progress import Emitter


def parse_lines(text: str) -> list[dict]:
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def test_progress_clamps_percent(capsys):
    e = Emitter(job_id="abc")
    e.progress("download", 150.0, "x")
    e.progress("download", -5.0, "y")
    events = parse_lines(capsys.readouterr().out)
    assert events[0]["percent"] == 100.0
    assert events[1]["percent"] == 0.0
    assert all(ev["job_id"] == "abc" for ev in events)


def test_event_shapes(capsys):
    e = Emitter(job_id="j")
    e.progress("separate", 50, "half")
    e.stage_complete("download", "/tmp/a.wav")
    e.stem_ready("vocals", "/tmp/v.wav", 1024)
    e.complete([{"name": "vocals", "path": "/tmp/v.wav"}], "k", cache_hit=True, duration_seconds=1.5)
    e.error("DOWNLOAD_FAILED", "boom", details="trace")
    e.log("info", "hi")

    events = parse_lines(capsys.readouterr().out)
    kinds = [ev["event"] for ev in events]
    assert kinds == [
        "progress", "stage_complete", "stem_ready",
        "complete", "error", "log",
    ]
    assert events[2]["size_bytes"] == 1024
    assert events[3]["cache_hit"] is True
    assert events[4]["details"] == "trace"


def test_ts_present(capsys):
    Emitter(job_id="j").log("info", "x")
    events = parse_lines(capsys.readouterr().out)
    assert "ts" in events[0] and isinstance(events[0]["ts"], int)


def test_no_job_id_when_unset(capsys):
    Emitter().log("info", "x")
    events = parse_lines(capsys.readouterr().out)
    assert "job_id" not in events[0]
