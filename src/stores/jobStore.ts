import { create } from "zustand";
import type { ErrorCode, LibraryEntry, SidecarEvent, Stage, Stem } from "../types/sidecar";

export type JobStatus =
  | "idle"
  | "downloading"
  | "separating"
  | "ready"
  | "error"
  | "cancelled";

export interface LogLine {
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

interface JobState {
  jobId: string | null;
  url: string;
  status: JobStatus;
  stage: Stage | null;
  /** 0–100 dentro do stage atual. */
  stagePercent: number;
  /** 0–100 do job inteiro (download é 0–40, separate é 40–100). */
  globalPercent: number;
  message: string;
  stems: Stem[];
  cacheKey: string | null;
  cacheHit: boolean;
  title: string | null;
  errorCode: ErrorCode | null;
  errorMessage: string | null;
  logs: LogLine[];

  // actions
  startJob: (jobId: string, url: string) => void;
  applyEvent: (event: SidecarEvent) => void;
  loadFromCache: (entry: LibraryEntry) => void;
  reset: () => void;
}

const STAGE_WEIGHTS: Record<Stage, [number, number]> = {
  download: [0, 40],
  separate: [40, 100],
  export: [0, 100],
  // Prefetch flows on a separate channel; never reaches the job store.
  prefetch: [0, 0],
};

const initial = {
  jobId: null,
  url: "",
  status: "idle" as JobStatus,
  stage: null,
  stagePercent: 0,
  globalPercent: 0,
  message: "",
  stems: [] as Stem[],
  cacheKey: null,
  cacheHit: false,
  title: null as string | null,
  errorCode: null,
  errorMessage: null,
  logs: [] as LogLine[],
};

export const useJobStore = create<JobState>((set, get) => ({
  ...initial,

  startJob: (jobId, url) =>
    set({
      ...initial,
      jobId,
      url,
      status: "downloading",
      stage: "download",
      message: "Iniciando...",
    }),

  reset: () => set({ ...initial }),

  loadFromCache: (entry) =>
    set({
      ...initial,
      jobId: entry.cache_key,
      url: entry.url,
      title: entry.title,
      status: "ready",
      stems: entry.stems,
      cacheKey: entry.cache_key,
      cacheHit: true,
      globalPercent: 100,
      message: "Resultado em cache",
    }),

  applyEvent: (event) => {
    // Ignora eventos de outros jobs (corrida na troca de URL).
    const currentId = get().jobId;
    if ("job_id" in event && event.job_id && currentId && event.job_id !== currentId) {
      return;
    }

    switch (event.event) {
      case "progress": {
        const [low, high] = STAGE_WEIGHTS[event.stage] ?? [0, 100];
        const global = low + (high - low) * (event.percent / 100);
        const status: JobStatus =
          event.stage === "download" ? "downloading" : "separating";
        set({
          stage: event.stage,
          stagePercent: event.percent,
          globalPercent: global,
          message: event.message,
          status,
        });
        break;
      }
      case "stage_complete": {
        const [, high] = STAGE_WEIGHTS[event.stage] ?? [0, 100];
        set({ globalPercent: high, message: `${event.stage} concluído` });
        break;
      }
      case "stem_ready": {
        const stems = [...get().stems];
        if (!stems.find((s) => s.name === event.name)) {
          stems.push({ name: event.name, path: event.path, size_bytes: event.size_bytes });
        }
        set({ stems });
        break;
      }
      case "complete": {
        set({
          status: "ready",
          stems: event.stems,
          cacheKey: event.cache_key,
          cacheHit: event.cache_hit,
          title: event.title ?? null,
          globalPercent: 100,
          message: event.cache_hit ? "Resultado em cache" : "Pronto",
        });
        break;
      }
      case "error": {
        set({
          status: event.code === "CANCELLED" ? "cancelled" : "error",
          errorCode: event.code,
          errorMessage: event.message,
          message: event.message,
        });
        break;
      }
      case "log": {
        const logs = get().logs;
        set({ logs: [...logs.slice(-199), { ts: event.ts, level: event.level, message: event.message }] });
        break;
      }
      default:
        break;
    }
  },
}));
