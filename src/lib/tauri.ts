import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AudioFormat,
  DeviceInfo,
  LibraryEntry,
  SidecarEvent,
  StemName,
} from "../types/sidecar";

export type JobId = string;

export async function processUrl(url: string): Promise<JobId> {
  return invoke<JobId>("process_url", { url });
}

export async function cancelJob(jobId: JobId): Promise<void> {
  return invoke("cancel_job", { jobId });
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return invoke<DeviceInfo>("get_device_info");
}

export async function clearCache(): Promise<void> {
  return invoke("clear_cache");
}

export async function getCacheSize(): Promise<number> {
  return invoke<number>("get_cache_size");
}

export async function exportStems(args: {
  jobId: JobId;
  selectedStems: StemName[];
  format: AudioFormat;
  outputPath: string;
  asZip?: boolean;
}): Promise<void> {
  return invoke("export_stems", { args });
}

export function onSidecarEvent(handler: (e: SidecarEvent) => void): Promise<UnlistenFn> {
  return listen<SidecarEvent>("sidecar-event", (e) => handler(e.payload));
}

export async function prefetchModel(): Promise<void> {
  return invoke("prefetch_model");
}

export async function listCacheEntries(): Promise<LibraryEntry[]> {
  return invoke<LibraryEntry[]>("list_cache_entries");
}

export async function touchCacheEntry(cacheKey: string): Promise<void> {
  return invoke("touch_cache_entry", { cacheKey });
}

export function onPrefetchEvent(handler: (e: SidecarEvent) => void): Promise<UnlistenFn> {
  return listen<SidecarEvent>("prefetch-event", (e) => handler(e.payload));
}
