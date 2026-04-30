import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { clearCache, getCacheSize } from "../lib/tauri";
import {
  type DevicePref,
  type DownloadQuality,
  useSettingsStore,
} from "../stores/settingsStore";

interface Props {
  onClose: () => void;
}

export function SettingsView({ onClose }: Props) {
  const s = useSettingsStore();
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!s.hydrated) s.load();
    refreshCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshCache() {
    try {
      setCacheBytes(await getCacheSize());
    } catch {
      setCacheBytes(null);
    }
  }

  async function pickOutputDir() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") s.update({ defaultOutputDir: picked });
  }

  async function onClear() {
    setWorking(true);
    try {
      await clearCache();
      await refreshCache();
      setConfirmClear(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Configurações</h2>
        <button
          onClick={onClose}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Fechar
        </button>
      </div>

      <Section title="Cache">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-400">Tamanho atual:</span>
          <span className="font-mono">
            {cacheBytes == null ? "..." : formatBytes(cacheBytes)}
          </span>
        </div>
        <Field label="Limite (GB)">
          <input
            type="number"
            min={1}
            max={500}
            step={1}
            value={s.cacheLimitGb}
            onChange={(e) =>
              s.update({ cacheLimitGb: Math.max(1, Number(e.target.value) || 1) })
            }
            className="w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </Field>
        <div className="flex gap-2">
          {confirmClear ? (
            <>
              <span className="text-sm text-amber-300">
                Tem certeza? Isso apaga todos os stems em cache.
              </span>
              <button
                disabled={working}
                onClick={onClear}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:bg-neutral-700"
              >
                Apagar
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Limpar cache
            </button>
          )}
        </div>
      </Section>

      <Section title="Saída">
        <Field label="Pasta padrão">
          <div className="flex flex-1 items-center gap-2">
            <input
              readOnly
              value={s.defaultOutputDir ?? ""}
              placeholder="(pedir ao salvar)"
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-400"
            />
            <button
              onClick={pickOutputDir}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Escolher...
            </button>
            {s.defaultOutputDir && (
              <button
                onClick={() => s.update({ defaultOutputDir: null })}
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                Limpar
              </button>
            )}
          </div>
        </Field>
        <Field label="Qualidade de download">
          <select
            value={s.downloadQuality}
            onChange={(e) => s.update({ downloadQuality: e.target.value as DownloadQuality })}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          >
            <option value="best">Melhor</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
          </select>
        </Field>
      </Section>

      <Section title="Inferência">
        <Field label="Forçar device">
          <select
            value={s.devicePreference}
            onChange={(e) => s.update({ devicePreference: e.target.value as DevicePref })}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          >
            <option value="auto">Auto (detectar)</option>
            <option value="cuda">CUDA (NVIDIA)</option>
            <option value="mps">MPS (Apple Silicon)</option>
            <option value="cpu">CPU</option>
          </select>
        </Field>
      </Section>

      <div className="pt-4 text-right">
        <button
          onClick={() => s.reset()}
          className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
        >
          Restaurar padrões
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <label className="w-40 text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
