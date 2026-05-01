import { useEffect } from "react";
import { onPrefetchEvent, prefetchModel } from "../lib/tauri";
import { usePrefetchStore } from "../stores/prefetchStore";

const PREFETCH_DONE_KEY = "ssp.prefetch-completed.htdemucs_ft.v1";

/** Pre-baixa pesos do Demucs ao montar. Idempotente: subsequentes
 * runs do sidecar terminam em ms se o modelo já está em cache local.
 *
 * Otimização: depois de uma run bem-sucedida, marca um flag em
 * localStorage e pula o RPC nas aberturas seguintes — caso contrário
 * o cold-start do sidecar (import torch/demucs) demora 10-30s a cada
 * abertura mesmo com pesos cacheados, mostrando o banner sem motivo. */
export function usePrefetchModel() {
  const start = usePrefetchStore((s) => s.start);
  const apply = usePrefetchStore((s) => s.applyEvent);
  const setReady = usePrefetchStore((s) => s.setReady);
  const setError = usePrefetchStore((s) => s.setError);

  useEffect(() => {
    if (localStorage.getItem(PREFETCH_DONE_KEY) === "1") {
      setReady();
      return;
    }

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    onPrefetchEvent(apply).then((u) => {
      if (cancelled) {
        u();
      } else {
        unlisten = u;
      }
    });

    start();
    prefetchModel()
      .then(() => {
        if (cancelled) return;
        localStorage.setItem(PREFETCH_DONE_KEY, "1");
        setReady();
      })
      .catch((e) => {
        if (cancelled) return;
        localStorage.removeItem(PREFETCH_DONE_KEY);
        setError(String(e));
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [apply, start, setReady, setError]);
}
