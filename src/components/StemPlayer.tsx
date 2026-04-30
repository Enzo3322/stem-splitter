import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStemPlayer } from "../hooks/useStemPlayer";
import { usePlayerStore } from "../stores/playerStore";
import type { Stem, StemName } from "../types/sidecar";
import { ExportDialog } from "./ExportDialog";

const STEM_COLORS: Record<StemName, string> = {
  vocals: "#ec4899",
  drums: "#f59e0b",
  bass: "#8b5cf6",
  guitar: "#10b981",
  piano: "#3b82f6",
  other: "#6b7280",
};

const STEM_LABELS: Record<StemName, string> = {
  vocals: "Vocal",
  drums: "Bateria",
  bass: "Baixo",
  guitar: "Guitarra",
  piano: "Piano",
  other: "Outros",
};

interface Props {
  stems: Stem[];
  cacheKey: string;
  title?: string | null;
}

const DEFAULT_WINDOW_TITLE = "Stem Splitter";

export function StemPlayer({ stems, cacheKey, title }: Props) {
  const player = useStemPlayer({ stems, colorOf: (n) => STEM_COLORS[n] });
  const playing = usePlayerStore((s) => s.playing);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const controls = usePlayerStore((s) => s.controls);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleSolo = usePlayerStore((s) => s.toggleSolo);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    const next = title && title.trim()
      ? `${DEFAULT_WINDOW_TITLE} — ${title}`
      : DEFAULT_WINDOW_TITLE;
    win.setTitle(next).catch(() => { /* best effort */ });
    return () => {
      win.setTitle(DEFAULT_WINDOW_TITLE).catch(() => { /* best effort */ });
    };
  }, [title]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      {title && (
        <h2 className="truncate text-lg font-semibold text-neutral-100" title={title}>
          {title}
        </h2>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={player.toggle}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="font-mono text-sm text-neutral-400">
          {fmtTime(position)} / {fmtTime(duration)}
        </span>
        <button
          onClick={() => setExportOpen(true)}
          className="ml-auto rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Exportar
        </button>
      </div>

      <div className="space-y-2">
        {stems.map((stem) => {
          const c = controls[stem.name];
          return (
            <div
              key={stem.name}
              className="rounded-md border border-neutral-800 bg-neutral-950/40 p-3"
            >
              <div className="mb-2 flex items-center gap-3">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: STEM_COLORS[stem.name] }}
                />
                <span className="w-20 text-sm font-medium">{STEM_LABELS[stem.name]}</span>
                <button
                  onClick={() => toggleMute(stem.name)}
                  title="Mute (M)"
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    c.muted
                      ? "bg-red-600 text-white"
                      : "border border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => toggleSolo(stem.name)}
                  title="Solo (S)"
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    c.solo
                      ? "bg-amber-500 text-black"
                      : "border border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                  }`}
                >
                  S
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={c.volume}
                  onChange={(e) => setVolume(stem.name, parseFloat(e.target.value))}
                  className="ml-auto w-32 accent-emerald-500"
                />
                <span className="w-8 text-right font-mono text-xs text-neutral-500">
                  {Math.round(c.volume * 100)}
                </span>
              </div>
              <div ref={player.setRef(stem.name)} className="cursor-pointer" />
            </div>
          );
        })}
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        cacheKey={cacheKey}
        availableStems={stems.map((s) => s.name)}
      />
    </div>
  );
}

function fmtTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
