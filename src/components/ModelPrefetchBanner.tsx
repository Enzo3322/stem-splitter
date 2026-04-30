import { usePrefetchStore } from "../stores/prefetchStore";

export function ModelPrefetchBanner() {
  const { status, percent, message, errorMessage } = usePrefetchStore();

  if (status === "ready") return null;

  const isError = status === "error";
  const pct = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={`mx-6 mt-4 rounded-md border px-4 py-3 text-sm ${
        isError
          ? "border-red-700 bg-red-950/60 text-red-200"
          : "border-amber-700 bg-amber-950/40 text-amber-100"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {isError ? "Falha ao carregar modelo Demucs" : "Carregando modelo Demucs..."}
        </span>
        {!isError && (
          <span className="font-mono text-xs text-amber-300/80">{pct.toFixed(0)}%</span>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        {isError ? errorMessage ?? "Erro desconhecido" : message || "Iniciando..."}
      </p>
      {!isError && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-amber-500 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
