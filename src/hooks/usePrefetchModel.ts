import { useEffect } from "react";
import { onPrefetchEvent, prefetchModel } from "../lib/tauri";
import { usePrefetchStore } from "../stores/prefetchStore";

/** Pre-baixa pesos do Demucs ao montar. Idempotente: subsequentes
 * runs do sidecar terminam em ms se o modelo já está em cache local. */
export function usePrefetchModel() {
  const start = usePrefetchStore((s) => s.start);
  const apply = usePrefetchStore((s) => s.applyEvent);
  const setReady = usePrefetchStore((s) => s.setReady);
  const setError = usePrefetchStore((s) => s.setError);

  useEffect(() => {
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
        if (!cancelled) setReady();
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [apply, start, setReady, setError]);
}
