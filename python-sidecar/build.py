"""Empacota o sidecar Python com PyInstaller, com naming compatível com Tauri.

Uso:
    python build.py [--target <triple>] [--clean]

Targets aceitos (matching tauri externalBin):
    x86_64-pc-windows-msvc
    x86_64-apple-darwin
    aarch64-apple-darwin
    x86_64-unknown-linux-gnu
    aarch64-unknown-linux-gnu

Se --target for omitido, detecta automaticamente da plataforma corrente.
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
BUILD_DIR = ROOT / "build"
MODELS_DIR = ROOT / "_models"
TAURI_BIN_DIR = ROOT.parent / "src-tauri" / "binaries"

ENTRY = "entrypoint.py"
DEFAULT_MODEL_NAME = "htdemucs_6s"


def detect_target() -> str:
    sys_name = platform.system()
    machine = platform.machine().lower()
    if sys_name == "Windows":
        return "x86_64-pc-windows-msvc"
    if sys_name == "Darwin":
        return "aarch64-apple-darwin" if machine in ("arm64", "aarch64") else "x86_64-apple-darwin"
    if sys_name == "Linux":
        if machine in ("aarch64", "arm64"):
            return "aarch64-unknown-linux-gnu"
        return "x86_64-unknown-linux-gnu"
    raise SystemExit(f"plataforma não suportada: {sys_name}/{machine}")


def is_macos(target: str) -> bool:
    return target.endswith("-apple-darwin")


def is_windows(target: str) -> bool:
    return "windows" in target


def hidden_imports() -> list[str]:
    return [
        "torch",
        "torch._C",
        "torchaudio",
        "torchaudio.transforms",
        "torchaudio.compliance",
        "demucs",
        "demucs.pretrained",
        "demucs.apply",
        "demucs.audio",
        "yt_dlp",
        "soundfile",
        "pkg_resources.py2_warn",
    ]


def collect_packages() -> list[str]:
    return ["torch", "torchaudio", "demucs", "yt_dlp", "soundfile"]


def prepare_model_cache(model_name: str = DEFAULT_MODEL_NAME) -> Path:
    """Ensures Demucs weights are downloaded and copies them into MODELS_DIR
    so PyInstaller can bundle them. Returns the bundled torch dir path
    (= MODELS_DIR / "torch")."""
    print(f">> ensuring demucs model `{model_name}` is cached", flush=True)
    # Trigger torch hub download into the venv's default cache (idempotent).
    from demucs.pretrained import get_model  # type: ignore
    import torch.hub as hub  # type: ignore

    get_model(model_name)
    src_hub_dir = Path(hub.get_dir())  # e.g. ~/.cache/torch/hub
    src_checkpoints = src_hub_dir / "checkpoints"
    if not src_checkpoints.exists():
        raise SystemExit(f"checkpoints dir não foi populado: {src_checkpoints}")

    bundled_torch = MODELS_DIR / "torch"
    bundled_checkpoints = bundled_torch / "hub" / "checkpoints"
    if bundled_checkpoints.exists():
        shutil.rmtree(bundled_checkpoints)
    bundled_checkpoints.mkdir(parents=True, exist_ok=True)

    total = 0
    for f in src_checkpoints.iterdir():
        if not f.is_file():
            continue
        dst = bundled_checkpoints / f.name
        shutil.copy2(f, dst)
        total += dst.stat().st_size
    print(f"   copied {total / (1024 * 1024):.1f} MiB to {bundled_checkpoints}", flush=True)
    return bundled_torch


def build(target: str, clean: bool) -> Path:
    if clean:
        for d in (DIST_DIR, BUILD_DIR):
            if d.exists():
                shutil.rmtree(d)

    bundled_torch = prepare_model_cache()
    bundled_torch_rel = bundled_torch.relative_to(ROOT)

    base_name = "stem-splitter-sidecar"
    args: list[str] = [
        sys.executable, "-m", "PyInstaller",
        ENTRY,
        "--name", base_name,
        "--noconfirm",
        "--log-level", "WARN",
    ]

    # macOS: --onedir é mais robusto pra code signing/notarization.
    if is_macos(target):
        args.append("--onedir")
    else:
        args.append("--onefile")

    # Bundle the torch hub cache (Demucs weights). Keep the same relative path
    # `_models/torch` inside the bundle; entrypoint.py points TORCH_HOME at it.
    sep = os.pathsep  # `;` on Windows, `:` elsewhere — the format PyInstaller expects.
    args += ["--add-data", f"{bundled_torch_rel}{sep}_models/torch"]

    for pkg in collect_packages():
        args += ["--collect-all", pkg]
    for hi in hidden_imports():
        args += ["--hidden-import", hi]

    print(">", " ".join(args), flush=True)
    subprocess.run(args, check=True, cwd=ROOT)

    # Resolve o artefato produzido pelo PyInstaller.
    if is_macos(target):
        produced = DIST_DIR / base_name  # diretório
    elif is_windows(target):
        produced = DIST_DIR / f"{base_name}.exe"
    else:
        produced = DIST_DIR / base_name

    if not produced.exists():
        raise SystemExit(f"PyInstaller não produziu {produced}")

    # Copia pro src-tauri/binaries com o sufixo de target esperado pelo Tauri.
    TAURI_BIN_DIR.mkdir(parents=True, exist_ok=True)
    suffix = ".exe" if is_windows(target) else ""
    dst_name = f"{base_name}-{target}{suffix}"
    dst = TAURI_BIN_DIR / dst_name

    if produced.is_dir():
        # macOS onedir: copia dir e usa o executável interno como sidecar via wrapper.
        # Tauri 2 aceita dirs como externalBin? Não — só executáveis. Então criamos
        # um symlink/exe principal apontado pra dir.
        if dst.exists() or dst.is_symlink():
            if dst.is_dir():
                shutil.rmtree(dst)
            else:
                dst.unlink()
        # Copia a pasta toda pra pasta irmã com sufixo de target.
        target_dir = TAURI_BIN_DIR / f"{base_name}-{target}.app-bundle"
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(produced, target_dir)
        # E coloca o executável principal apontado.
        main_exe = target_dir / base_name
        if not main_exe.exists():
            raise SystemExit(f"executável interno não encontrado: {main_exe}")
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        try:
            dst.symlink_to(main_exe.relative_to(TAURI_BIN_DIR))
        except OSError:
            shutil.copy2(main_exe, dst)
    else:
        if dst.exists():
            dst.unlink()
        shutil.copy2(produced, dst)
        if not is_windows(target):
            dst.chmod(0o755)

    print(f"OK -> {dst}")
    return dst


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--target", default=None)
    p.add_argument("--clean", action="store_true")
    args = p.parse_args()
    target = args.target or detect_target()
    build(target, clean=args.clean)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
