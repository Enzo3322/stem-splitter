import { useEffect } from "react";
import { onSidecarEvent } from "../lib/tauri";
import { useJobStore } from "../stores/jobStore";

/** Inscreve no evento `sidecar-event` e roteia pro jobStore. Idempotente. */
export function useSidecarEvents() {
  const apply = useJobStore((s) => s.applyEvent);
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onSidecarEvent(apply).then((u) => {
      if (cancelled) {
        u();
      } else {
        unlisten = u;
      }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [apply]);
}
