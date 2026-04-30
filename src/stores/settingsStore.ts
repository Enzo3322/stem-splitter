import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { Device } from "../types/sidecar";

export type DownloadQuality = "best" | "high" | "medium";
export type DevicePref = "auto" | Device;

export interface Settings {
  cacheLimitGb: number;
  defaultOutputDir: string | null;
  downloadQuality: DownloadQuality;
  devicePreference: DevicePref;
}

const DEFAULTS: Settings = {
  cacheLimitGb: 10,
  defaultOutputDir: null,
  downloadQuality: "best",
  devicePreference: "auto",
};

const STORE_FILE = "settings.json";
const STORE_KEY = "settings";
const lazyStore = new LazyStore(STORE_FILE);

interface SettingsStore extends Settings {
  hydrated: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  load: async () => {
    try {
      const v = await lazyStore.get<Settings>(STORE_KEY);
      if (v) set({ ...DEFAULTS, ...v, hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  update: async (patch) => {
    const next: Settings = {
      cacheLimitGb: get().cacheLimitGb,
      defaultOutputDir: get().defaultOutputDir,
      downloadQuality: get().downloadQuality,
      devicePreference: get().devicePreference,
      ...patch,
    };
    set(next);
    await lazyStore.set(STORE_KEY, next);
    await lazyStore.save();
  },

  reset: async () => {
    set({ ...DEFAULTS });
    await lazyStore.set(STORE_KEY, DEFAULTS);
    await lazyStore.save();
  },
}));
