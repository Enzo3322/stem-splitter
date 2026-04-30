"""Separação em 6 stems via Demucs (htdemucs_6s)."""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from .device import detect_device
from .progress import Emitter

if TYPE_CHECKING:
    import torch

STEM_NAMES = ("vocals", "drums", "bass", "guitar", "piano", "other")
DEFAULT_MODEL = "htdemucs_6s"


class SeparationFailed(RuntimeError):
    def __init__(self, message: str, code: str = "SEPARATION_FAILED") -> None:
        super().__init__(message)
        self.code = code


def separate(
    audio_path: Path,
    output_dir: Path,
    emitter: Emitter,
    model_name: str = DEFAULT_MODEL,
    device: str | None = None,
) -> dict[str, Path]:
    """Roda Demucs no audio_path, salva 6 WAVs em output_dir, retorna {stem_name: path}."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    chosen_device = device or detect_device()
    emitter.log("info", f"separando em device={chosen_device} model={model_name}")
    emitter.progress("separate", 0.0, "Carregando modelo...")

    try:
        import torch
        import torchaudio
        from demucs.apply import apply_model  # type: ignore
        from demucs.pretrained import get_model  # type: ignore
    except ImportError as e:
        raise SeparationFailed(f"demucs/torch ausente: {e}", code="MODEL_LOAD_FAILED") from e

    try:
        model = get_model(model_name)
    except Exception as e:
        raise SeparationFailed(f"falha carregando modelo: {e}", code="MODEL_LOAD_FAILED") from e

    model.to(chosen_device).eval()

    emitter.progress("separate", 5.0, "Lendo áudio...")
    # Bypass demucs.AudioFile (subprocess ffmpeg) E torchaudio.load (que em
    # 2.11+ exige TorchCodec). Como sempre temos WAV nesse ponto, soundfile
    # decodifica direto sem dependências externas.
    try:
        import soundfile as sf
        data, sr = sf.read(str(audio_path), always_2d=True)  # (samples, channels)
        wav = torch.from_numpy(data.T).float().contiguous()  # (channels, samples)
    except Exception as e:
        raise SeparationFailed(f"falha lendo áudio: {e}") from e

    if sr != model.samplerate:
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)

    target_channels = model.audio_channels
    if wav.shape[0] != target_channels:
        if wav.shape[0] == 1 and target_channels == 2:
            wav = wav.repeat(2, 1)
        elif wav.shape[0] == 2 and target_channels == 1:
            wav = wav.mean(dim=0, keepdim=True)
        elif wav.shape[0] > target_channels:
            wav = wav[:target_channels]
        else:
            pad = torch.zeros(target_channels - wav.shape[0], wav.shape[1])
            wav = torch.cat([wav, pad], dim=0)

    ref = wav.mean(0)
    wav_norm = (wav - ref.mean()) / ref.std()

    emitter.progress("separate", 10.0, "Iniciando inferência...")

    # Hook de progresso: demucs.apply_model aceita um callback via `progress=True`,
    # mas a API programática não expõe percent direto. Aproximamos com um wrapper.
    try:
        with torch.no_grad():
            sources = apply_model(
                model,
                wav_norm[None],
                device=chosen_device,
                progress=False,  # silencia tqdm interno
                num_workers=0,
            )[0]
    except torch.cuda.OutOfMemoryError as e:
        raise SeparationFailed(f"GPU OOM: {e}", code="GPU_OOM") from e
    except RuntimeError as e:
        # MPS pode lançar RuntimeError genérico em OOM.
        if "out of memory" in str(e).lower():
            raise SeparationFailed(f"OOM: {e}", code="GPU_OOM") from e
        raise SeparationFailed(f"inferência falhou: {e}") from e

    sources = sources * ref.std() + ref.mean()

    emitter.progress("separate", 90.0, "Gravando stems...")

    sources_names = list(model.sources)  # ordem do htdemucs_6s
    paths: dict[str, Path] = {}
    total_stems = len(sources_names)

    import soundfile as sf
    for idx, (name, audio) in enumerate(zip(sources_names, sources)):
        # Normaliza nomes que difiram do nosso vocabulário.
        normalized = _normalize_stem_name(name)
        path = output_dir / f"{normalized}.wav"
        # soundfile espera (samples, channels); audio é (channels, samples).
        sf.write(str(path), audio.cpu().numpy().T, model.samplerate, subtype="PCM_16")
        size = path.stat().st_size
        paths[normalized] = path
        emitter.stem_ready(normalized, str(path), size)
        emitter.progress("separate", 90.0 + (idx + 1) / total_stems * 10.0,
                         f"Stem {normalized} pronto")

    # Stems faltantes (modelo de 4 stems): emite arquivos vazios pra simplificar UI?
    # Não — em htdemucs_6s todos existem. Apenas verificamos.
    missing = set(STEM_NAMES) - set(paths.keys())
    if missing:
        emitter.log("warn", f"stems ausentes do modelo: {missing}")

    emitter.stage_complete("separate", str(output_dir))
    return paths


def _normalize_stem_name(name: str) -> str:
    name = name.lower()
    if name in STEM_NAMES:
        return name
    # demucs ocasionalmente usa "guitars" / "pianos"
    if name.endswith("s") and name[:-1] in STEM_NAMES:
        return name[:-1]
    return name
