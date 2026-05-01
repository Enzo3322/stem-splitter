import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

interface Props {
  onClose: () => void;
}

export function AboutView({ onClose }: Props) {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("?"));
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sobre</h2>
        <button
          onClick={onClose}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Fechar
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-2xl font-semibold">Stem Splitter</p>
        <p className="text-sm text-neutral-400">v{version}</p>
        <p className="text-sm text-neutral-300">
          Separa músicas do YouTube em 4 stems usando Demucs (htdemucs_ft), localmente.
        </p>
      </div>

      <Section title="Créditos">
        <ul className="space-y-2 text-sm text-neutral-300">
          <Credit
            name="Demucs"
            license="MIT"
            url="https://github.com/facebookresearch/demucs"
            note="Modelo de separação musical (Meta AI / FAIR)."
          />
          <Credit
            name="yt-dlp"
            license="Unlicense"
            url="https://github.com/yt-dlp/yt-dlp"
            note="Download de áudio do YouTube."
          />
          <Credit
            name="ffmpeg"
            license="LGPL/GPL"
            url="https://ffmpeg.org"
            note="Conversão de formatos de áudio."
          />
          <Credit
            name="WaveSurfer.js"
            license="BSD-3"
            url="https://wavesurfer.xyz"
            note="Renderização de waveforms."
          />
          <Credit
            name="Tauri 2"
            license="Apache-2.0/MIT"
            url="https://tauri.app"
            note="Shell desktop multi-plataforma."
          />
          <Credit
            name="PyTorch"
            license="BSD-3"
            url="https://pytorch.org"
            note="Backend de inferência."
          />
        </ul>
      </Section>

      <Section title="Licença">
        <p className="text-sm text-neutral-400">
          Stem Splitter é distribuído sob licença MIT.
        </p>
      </Section>

      <Section title="Aviso">
        <p className="text-sm text-neutral-400">
          O download de conteúdo do YouTube viola os Termos de Serviço da plataforma. Use somente
          para finalidades pessoais ou educacionais.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function Credit({
  name,
  license,
  url,
  note,
}: {
  name: string;
  license: string;
  url: string;
  note: string;
}) {
  return (
    <li className="flex items-baseline gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-emerald-400 hover:underline"
      >
        {name}
      </a>
      <span className="font-mono text-xs text-neutral-500">{license}</span>
      <span className="text-neutral-400">— {note}</span>
    </li>
  );
}
