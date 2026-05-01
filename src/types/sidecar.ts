export type StemName = "vocals" | "drums" | "bass" | "other";

export const STEM_NAMES: readonly StemName[] = [
  "vocals",
  "drums",
  "bass",
  "other",
] as const;

export type Stage = "download" | "separate" | "export" | "prefetch";

export type Device = "cuda" | "mps" | "cpu";

export interface DeviceInfo {
  available: Device[];
  selected: Device;
  details: Record<string, unknown>;
}

export interface Stem {
  name: StemName;
  path: string;
  size_bytes?: number;
}

export type SidecarEvent =
  | { event: "progress"; job_id: string; ts: number; stage: Stage; percent: number; message: string }
  | { event: "stage_complete"; job_id: string; ts: number; stage: Stage; output_path: string }
  | { event: "stem_ready"; job_id: string; ts: number; name: StemName; path: string; size_bytes: number }
  | { event: "complete"; job_id: string; ts: number; stems: Stem[]; cache_key: string; cache_hit: boolean; duration_seconds: number; title?: string | null }
  | { event: "error"; job_id: string; ts: number; code: ErrorCode; message: string; details?: string; recoverable: boolean }
  | { event: "log"; job_id: string; ts: number; level: "debug" | "info" | "warn" | "error"; message: string };

export type ErrorCode =
  | "INVALID_URL"
  | "DOWNLOAD_FAILED"
  | "VIDEO_UNAVAILABLE"
  | "MODEL_LOAD_FAILED"
  | "SEPARATION_FAILED"
  | "INSUFFICIENT_DISK"
  | "GPU_OOM"
  | "CANCELLED"
  | "INTERNAL";

export type AudioFormat = { kind: "wav" } | { kind: "mp3"; bitrate_kbps: 128 | 192 | 320 };

export interface LibraryEntry {
  cache_key: string;
  url: string;
  video_id: string;
  title: string | null;
  stored_at: number;
  size_bytes: number;
  stems: Stem[];
}
