import { useState } from "react";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { exportStems } from "../lib/tauri";
import type { AudioFormat, StemName } from "../types/sidecar";

interface Props {
  open: boolean;
  onClose: () => void;
  cacheKey: string;
  availableStems: StemName[];
}

const STEM_LABELS: Record<StemName, string> = {
  vocals: "Vocal",
  drums: "Bateria",
  bass: "Baixo",
  guitar: "Guitarra",
  piano: "Piano",
  other: "Outros",
};

export function ExportDialog({ open, onClose, cacheKey, availableStems }: Props) {
  const [selected, setSelected] = useState<Set<StemName>>(new Set(availableStems));
  const [format, setFormat] = useState<"wav" | "mp3">("wav");
  const [bitrate, setBitrate] = useState<128 | 192 | 320>(192);
  const [asZip, setAsZip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggle = (s: StemName) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  async function onConfirm() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const wantZip = asZip && format === "wav" && selected.size > 1;
      // ZIP → save dialog (file path). Demais → open dialog em modo diretório,
      // pois o backend trata `outputPath` como pasta e faz `join(stem.ext)`.
      const target = wantZip
        ? await save({
            title: "Salvar stems",
            defaultPath: "stems.zip",
            filters: [{ name: "ZIP", extensions: ["zip"] }],
          })
        : await openDialog({
            title: "Selecionar pasta de saída",
            directory: true,
            multiple: false,
          });
      if (!target || typeof target !== "string") {
        setBusy(false);
        return;
      }

      const audioFormat: AudioFormat =
        format === "mp3" ? { kind: "mp3", bitrate_kbps: bitrate } : { kind: "wav" };

      await exportStems({
        jobId: cacheKey,
        selectedStems: Array.from(selected),
        format: audioFormat,
        outputPath: target,
        asZip: wantZip,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg border border-neutral-800 bg-neutral-950 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Exportar stems</h3>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Stems</p>
          {availableStems.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(s)}
                onChange={() => toggle(s)}
                className="accent-emerald-500"
              />
              {STEM_LABELS[s]}
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Formato</p>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="format"
                checked={format === "wav"}
                onChange={() => setFormat("wav")}
                className="accent-emerald-500"
              />
              WAV
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="format"
                checked={format === "mp3"}
                onChange={() => setFormat("mp3")}
                className="accent-emerald-500"
              />
              MP3
            </label>
          </div>
          {format === "mp3" && (
            <div className="flex items-center gap-2 pl-4">
              <span className="text-xs text-neutral-400">bitrate:</span>
              {[128, 192, 320].map((b) => (
                <button
                  key={b}
                  onClick={() => setBitrate(b as 128 | 192 | 320)}
                  className={`rounded border px-2 py-0.5 text-xs ${
                    bitrate === b
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                      : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                  }`}
                >
                  {b}k
                </button>
              ))}
            </div>
          )}
        </div>

        {format === "wav" && selected.size > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={asZip}
              onChange={(e) => setAsZip(e.target.checked)}
              className="accent-emerald-500"
            />
            Empacotar como ZIP
          </label>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || selected.size === 0}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:bg-neutral-700"
          >
            {busy ? "..." : "Salvar em..."}
          </button>
        </div>
      </div>
    </div>
  );
}
