import { useEffect, useSyncExternalStore } from "react";
import { stemEngine } from "../lib/stemEngine";
import { effectiveGain, usePlayerStore } from "../stores/playerStore";
import type { Stem, StemName } from "../types/sidecar";

interface UseStemPlayerArgs {
  stems: Stem[];
  /** Cor por stem pra waveform. */
  colorOf: (name: StemName) => string;
}

/**
 * Wrapper fino sobre `stemEngine` (singleton fora do React).
 *
 * O engine sobrevive a remount/re-render: estado (playing, posição,
 * AudioBuffers, AudioContext) vive no módulo. O hook só sincroniza o
 * estado React (controls, container refs) com o engine.
 */
export function useStemPlayer({ stems, colorOf }: UseStemPlayerArgs) {
  const controls = usePlayerStore((s) => s.controls);

  useEffect(() => {
    stemEngine.load(stems).catch((e) => {
      console.error("stem engine load failed", e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stems.map((s) => s.path).join("|")]);

  useEffect(() => {
    for (const stem of stems) {
      stemEngine.setGain(stem.name, effectiveGain(stem.name, controls));
    }
  }, [controls, stems]);

  return {
    setRef: (name: StemName) => (el: HTMLDivElement | null) => {
      stemEngine.bindContainer(name, el, colorOf(name));
    },
    play: () => stemEngine.play(),
    pause: () => stemEngine.pause(),
    toggle: () => stemEngine.toggle(),
    seekTo: (seconds: number) => stemEngine.seek(seconds),
  };
}

/** Subscreve nos campos do engine via useSyncExternalStore. */
export function useEnginePlaying(): boolean {
  return useSyncExternalStore(
    (cb) => stemEngine.subscribe(cb),
    () => stemEngine.isPlaying(),
  );
}

export function useEnginePosition(): number {
  return useSyncExternalStore(
    (cb) => stemEngine.subscribe(cb),
    () => stemEngine.getPosition(),
  );
}

export function useEngineDuration(): number {
  return useSyncExternalStore(
    (cb) => stemEngine.subscribe(cb),
    () => stemEngine.getDuration(),
  );
}
