import { useState } from "react";
import { cancelJob } from "../lib/tauri";
import { friendlyError } from "../lib/errors";
import { useJobStore } from "../stores/jobStore";

export function ProgressView() {
  const job = useJobStore();
  const [logsOpen, setLogsOpen] = useState(false);

  const isError = job.status === "error" || job.status === "cancelled";
  const isRunning = job.status === "downloading" || job.status === "separating";

  async function onCancel() {
    if (job.jobId) await cancelJob(job.jobId).catch(() => undefined);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span className="truncate">{job.url}</span>
          <span className="font-mono">{Math.round(job.globalPercent)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className={`h-full transition-all duration-200 ${
              isError ? "bg-red-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, job.globalPercent))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{job.stage ? labelForStage(job.stage) : ""}</span>
          <span className="truncate pl-2">{job.message}</span>
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
          <div className="font-medium">{friendlyError(job.errorCode, job.errorMessage ?? undefined)}</div>
          {job.errorMessage && (
            <div className="mt-1 font-mono text-xs text-red-400/80">{job.errorMessage}</div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {isRunning && (
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancelar
          </button>
        )}
        {(isError || job.status === "cancelled" || job.status === "ready") && (
          <button
            onClick={() => useJobStore.getState().reset()}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Voltar
          </button>
        )}
      </div>

      <details
        open={logsOpen}
        onToggle={(e) => setLogsOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="rounded-md border border-neutral-800"
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-xs text-neutral-400">
          Logs ({job.logs.length})
        </summary>
        <div className="max-h-60 overflow-y-auto border-t border-neutral-800 p-2 font-mono text-[11px] leading-snug">
          {job.logs.length === 0 ? (
            <div className="text-neutral-600">— vazio —</div>
          ) : (
            job.logs.map((l, i) => (
              <div key={i} className={levelColor(l.level)}>
                [{new Date(l.ts).toISOString().slice(11, 19)}] {l.message}
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

function labelForStage(stage: string): string {
  switch (stage) {
    case "download":
      return "Baixando";
    case "separate":
      return "Separando stems";
    case "export":
      return "Exportando";
    default:
      return stage;
  }
}

function levelColor(level: string): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "debug":
      return "text-neutral-500";
    default:
      return "text-neutral-300";
  }
}
