import { useState } from "react";
import { processUrl } from "../lib/tauri";
import { isYouTubeUrl } from "../lib/url";
import { useJobStore } from "../stores/jobStore";
import { usePrefetchStore } from "../stores/prefetchStore";

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const startJob = useJobStore((s) => s.startJob);
  const prefetchStatus = usePrefetchStore((s) => s.status);

  const modelReady = prefetchStatus === "ready";
  const valid = isYouTubeUrl(url);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting || !modelReady) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const jobId = await processUrl(url.trim());
      startJob(jobId, url.trim());
    } catch (err) {
      setLocalError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <label className="block text-sm font-medium text-neutral-300" htmlFor="url">
        URL do YouTube
      </label>
      <div className="flex gap-2">
        <input
          id="url"
          type="url"
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtu.be/..."
          className={`flex-1 rounded-md border bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors
            ${url && !valid ? "border-red-500" : "border-neutral-700 focus:border-neutral-500"}`}
        />
        <button
          type="submit"
          disabled={!valid || submitting || !modelReady}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white
            hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
        >
          {submitting ? "..." : modelReady ? "Processar" : "Carregando modelo..."}
        </button>
      </div>
      {url && !valid && (
        <p className="text-xs text-red-400">URL precisa ser do YouTube (youtube.com ou youtu.be).</p>
      )}
      {localError && <p className="text-xs text-red-400">{localError}</p>}
      {!modelReady && (
        <p className="text-xs text-neutral-500">
          Aguardando o modelo Demucs ficar pronto antes de processar.
        </p>
      )}
    </form>
  );
}
