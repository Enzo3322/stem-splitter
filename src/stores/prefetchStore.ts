import { create } from "zustand";
import type { SidecarEvent } from "../types/sidecar";

export type PrefetchStatus = "idle" | "running" | "ready" | "error";

interface PrefetchState {
  status: PrefetchStatus;
  percent: number;
  message: string;
  errorMessage: string | null;

  start: () => void;
  applyEvent: (event: SidecarEvent) => void;
  setReady: () => void;
  setError: (message: string) => void;
}

export const usePrefetchStore = create<PrefetchState>((set) => ({
  status: "idle",
  percent: 0,
  message: "",
  errorMessage: null,

  start: () =>
    set({
      status: "running",
      percent: 0,
      message: "Verificando modelo...",
      errorMessage: null,
    }),

  applyEvent: (event) => {
    switch (event.event) {
      case "progress":
        if (event.stage === "prefetch") {
          set({
            status: "running",
            percent: event.percent,
            message: event.message,
          });
        }
        break;
      case "stage_complete":
        if (event.stage === "prefetch") {
          set({ status: "ready", percent: 100, message: "Modelo pronto" });
        }
        break;
      case "error":
        set({
          status: "error",
          errorMessage: event.message,
          message: event.message,
        });
        break;
      default:
        break;
    }
  },

  setReady: () =>
    set({ status: "ready", percent: 100, message: "Modelo pronto", errorMessage: null }),

  setError: (errorMessage) =>
    set({ status: "error", errorMessage, message: errorMessage }),
}));
