import { useCallback, useEffect, useState } from "react";
import { listCacheEntries, touchCacheEntry } from "../lib/tauri";
import { useJobStore } from "../stores/jobStore";
import type { LibraryEntry } from "../types/sidecar";

export function RecentTracks() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadFromCache = useJobStore((s) => s.loadFromCache);

  const refresh = useCallback(async () => {
    try {
      const list = await listCacheEntries();
      setEntries(list);
      setError(null);
    } catch (e) {
      setError(String(e));
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (entries === null) {
    return (
      <section className="mx-auto w-full max-w-2xl px-6 pb-6">
        <p className="text-sm text-neutral-500">Carregando histórico...</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-3 px-6 pb-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-neutral-300">Histórico</h2>
        {entries.length > 0 && (
          <span className="text-xs text-neutral-500">
            {entries.length} {entries.length === 1 ? "faixa" : "faixas"}
          </span>
        )}
      </header>

      {error && (
        <p className="text-xs text-red-400">Falha ao carregar histórico: {error}</p>
      )}

      {entries.length === 0 && !error && (
        <p className="text-sm text-neutral-500">Nenhuma faixa processada ainda.</p>
      )}

      {entries.length > 0 && (
        <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <li key={entry.cache_key}>
              <button
                onClick={() => {
                  loadFromCache(entry);
                  touchCacheEntry(entry.cache_key).catch(() => {
                    /* best-effort LRU touch */
                  });
                }}
                className="group flex w-full items-center gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-neutral-400 group-hover:border-emerald-500 group-hover:text-emerald-400">
                  ▶
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-100">
                    {displayTitle(entry)}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {formatRelative(entry.stored_at)} · {formatSize(entry.size_bytes)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function displayTitle(entry: LibraryEntry): string {
  if (entry.title && entry.title.trim()) return entry.title;
  return `YouTube: ${entry.video_id}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatRelative(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - unixSeconds);
  if (diff < 60) return "agora";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `há ${m} ${m === 1 ? "minuto" : "minutos"}`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  }
  if (diff < 86400 * 30) {
    const d = Math.floor(diff / 86400);
    return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  }
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString("pt-BR");
}
