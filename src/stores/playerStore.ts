import { create } from "zustand";
import type { StemName } from "../types/sidecar";

/** Por-stem: controles do mixer. */
interface StemControls {
  muted: boolean;
  solo: boolean;
  volume: number; // 0..1
}

interface PlayerState {
  playing: boolean;
  /** Posição em segundos (master clock). */
  position: number;
  duration: number;
  controls: Record<StemName, StemControls>;

  setPlaying: (v: boolean) => void;
  setPosition: (s: number) => void;
  setDuration: (s: number) => void;
  setVolume: (stem: StemName, v: number) => void;
  toggleMute: (stem: StemName) => void;
  toggleSolo: (stem: StemName) => void;
  reset: () => void;
}

const defaultControls: StemControls = { muted: false, solo: false, volume: 1.0 };

const initialControls = (): Record<StemName, StemControls> => ({
  vocals: { ...defaultControls },
  drums: { ...defaultControls },
  bass: { ...defaultControls },
  guitar: { ...defaultControls },
  piano: { ...defaultControls },
  other: { ...defaultControls },
});

export const usePlayerStore = create<PlayerState>((set) => ({
  playing: false,
  position: 0,
  duration: 0,
  controls: initialControls(),

  setPlaying: (v) => set({ playing: v }),
  setPosition: (s) => set({ position: s }),
  setDuration: (s) => set({ duration: s }),
  setVolume: (stem, v) =>
    set((s) => ({
      controls: { ...s.controls, [stem]: { ...s.controls[stem], volume: Math.max(0, Math.min(1, v)) } },
    })),
  toggleMute: (stem) =>
    set((s) => ({
      controls: { ...s.controls, [stem]: { ...s.controls[stem], muted: !s.controls[stem].muted } },
    })),
  toggleSolo: (stem) =>
    set((s) => ({
      controls: { ...s.controls, [stem]: { ...s.controls[stem], solo: !s.controls[stem].solo } },
    })),
  reset: () => set({ playing: false, position: 0, duration: 0, controls: initialControls() }),
}));

/**
 * Effective audio gain pra um stem dado o estado atual:
 * - Se algum stem está em SOLO, só os solo'd tocam.
 * - Mute zera o gain.
 * - Senão, usa volume.
 */
export function effectiveGain(
  stem: StemName,
  controls: Record<StemName, StemControls>,
): number {
  const anySolo = Object.values(controls).some((c) => c.solo);
  const c = controls[stem];
  if (c.muted) return 0;
  if (anySolo && !c.solo) return 0;
  return c.volume;
}
