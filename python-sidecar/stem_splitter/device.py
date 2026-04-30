"""Detecção de device de inferência (CUDA / MPS / CPU)."""
from __future__ import annotations

from typing import Any, Literal

Device = Literal["cuda", "mps", "cpu"]


def detect_device(prefer: Device | Literal["auto"] = "auto") -> Device:
    """Retorna o melhor device disponível, ou o `prefer` se for válido e disponível."""
    available = list_available()
    if prefer != "auto" and prefer in available:
        return prefer  # type: ignore[return-value]
    # Ordem de preferência: CUDA > MPS > CPU.
    for d in ("cuda", "mps", "cpu"):
        if d in available:
            return d  # type: ignore[return-value]
    return "cpu"


def list_available() -> list[Device]:
    """Lista devices disponíveis. Importa torch lazy pra evitar custo em testes."""
    devices: list[Device] = []
    try:
        import torch
    except ImportError:
        return ["cpu"]

    if torch.cuda.is_available():
        devices.append("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        devices.append("mps")
    devices.append("cpu")
    return devices


def device_details() -> dict[str, Any]:
    """Detalhes pra UI (nome da GPU, VRAM, etc)."""
    out: dict[str, Any] = {}
    try:
        import torch
    except ImportError:
        return out

    if torch.cuda.is_available():
        idx = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(idx)
        out["cuda"] = {
            "name": props.name,
            "vram_gb": round(props.total_memory / (1024**3), 1),
            "compute_capability": f"{props.major}.{props.minor}",
        }
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        out["mps"] = {"name": "Apple Silicon GPU"}
    return out
