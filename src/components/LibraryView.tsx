import { useCallback, useEffect, useMemo, useState } from "react";
import { listCacheEntries, touchCacheEntry } from "../lib/tauri";
import { useJobStore } from "../stores/jobStore";
import { useViewStore } from "../stores/viewStore";
import type { LibraryEntry } from "../types/sidecar";

export function LibraryView() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const loadFromCache = useJobStore((s) => s.loadFromCache);
  const currentCacheKey = useJobStore((s) => s.cacheKey);
  const setView = useViewStore((s) => s.setView);

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

  const filtered = useMemo(() => {
    if (!entries) return null;
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const title = (e.title ?? "").toLowerCase();
      return title.includes(q) || e.video_id.toLowerCase().includes(q);
    });
  }, [entries, query]);

  function play(entry: LibraryEntry) {
    loadFromCache(entry);
    setView("home");
    touchCacheEntry(entry.cache_key).catch(() => {
      /* best-effort LRU touch */
    });
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">Biblioteca</h2>
          <p className="text-xs text-neutral-500">
            Faixas processadas anteriormente. Clique para reproduzir.
          </p>
        </div>
        {entries && entries.length > 0 && (
          <span className="text-xs text-neutral-500">
            {entries.length} {entries.length === 1 ? "faixa" : "faixas"}
          </span>
        )}
      </header>

      {entries && entries.length > 0 && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título ou ID do vídeo..."
          className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
        />
      )}

      {error && (
        <p className="text-xs text-red-400">Falha ao carregar biblioteca: {error}</p>
      )}

      {entries === null && (
        <p className="text-sm text-neutral-500">Carregando biblioteca...</p>
      )}

      {entries && entries.length === 0 && !error && (
        <div className="rounded-md border border-dashed border-neutral-800 px-6 py-10 text-center">
          <p className="text-sm text-neutral-400">Nenhuma faixa processada ainda.</p>
          <button
            onClick={() => setView("home")}
            className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
          >
            Processar primeira faixa
          </button>
        </div>
      )}

      {filtered && filtered.length === 0 && entries && entries.length > 0 && (
        <p className="text-sm text-neutral-500">Nenhum resultado para "{query}".</p>
      )}

      {filtered && filtered.length > 0 && (
        <ul className="space-y-1.5">
          {filtered.map((entry) => {
            const isCurrent = entry.cache_key === currentCacheKey;
            return (
              <li key={entry.cache_key}>
                <button
                  onClick={() => play(entry)}
                  className={`group flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                    isCurrent
                      ? "border-emerald-700 bg-emerald-950/30"
                      : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700 hover:bg-neutral-900"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      isCurrent
                        ? "border-emerald-500 text-emerald-400"
                        : "border-neutral-700 text-neutral-400 group-hover:border-emerald-500 group-hover:text-emerald-400"
                    }`}
                  >
                    ▶
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-100">
                      {displayTitle(entry)}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {formatRelative(entry.stored_at)} · {formatSize(entry.size_bytes)} ·{" "}
                      {entry.stems.length} stems
                    </span>
                  </span>
                  {isCurrent && (
                    <span className="text-xs font-medium text-emerald-400">tocando</span>
                  )}
                </button>
              </li>
            );
          })}
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
