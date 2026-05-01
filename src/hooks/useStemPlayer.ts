import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { effectiveGain, usePlayerStore } from "../stores/playerStore";
import type { Stem, StemName } from "../types/sidecar";

interface UseStemPlayerArgs {
  stems: Stem[];
  /** Cor por stem pra waveform. */
  colorOf: (name: StemName) => string;
}

/**
 * Cria um WaveSurfer por stem, sincronizados via master clock.
 * O primeiro stem é o "master" — controla tempo/duração/seek; os outros seguem.
 */
export function useStemPlayer({ stems, colorOf }: UseStemPlayerArgs) {
  const containers = useRef<Record<string, HTMLDivElement | null>>({});
  const instances = useRef<Record<string, WaveSurfer>>({});
  // Intenção do usuário ("playing" | "paused"). Usado pra retomar após
  // o macOS WebKit pausar `<audio>` quando a janela perde foco.
  const intentRef = useRef<"playing" | "paused">("paused");

  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setPosition = usePlayerStore((s) => s.setPosition);
  const setDuration = usePlayerStore((s) => s.setDuration);

  // (Re)cria WaveSurfers quando a lista de stems muda.
  useEffect(() => {
    // Tear down qualquer instância anterior.
    for (const ws of Object.values(instances.current)) {
      ws.destroy();
    }
    instances.current = {};

    if (stems.length === 0) return;

    const created: Record<string, WaveSurfer> = {};
    stems.forEach((stem) => {
      const el = containers.current[stem.name];
      if (!el) return;
      const ws = WaveSurfer.create({
        container: el,
        height: 64,
        waveColor: colorOf(stem.name),
        progressColor: shade(colorOf(stem.name), -0.3),
        cursorColor: "#f5f5f5",
        cursorWidth: 1,
        normalize: true,
        interact: true,
        url: convertFileSrc(stem.path),
      });
      created[stem.name] = ws;
    });
    instances.current = created;

    // Master = primeiro stem.
    const masterName = stems[0].name;
    const master = created[masterName];
    if (!master) return;

    const onReady = () => {
      setDuration(master.getDuration());
    };
    const onPlay = () => {
      setPlaying(true);
      // Sincroniza outros stems no momento do play.
      for (const [name, ws] of Object.entries(created)) {
        if (name !== masterName && !ws.isPlaying()) {
          ws.setTime(master.getCurrentTime());
          ws.play().catch(() => undefined);
        }
      }
    };
    const onPause = () => {
      setPlaying(false);
      for (const [name, ws] of Object.entries(created)) {
        if (name !== masterName && ws.isPlaying()) ws.pause();
      }
    };

    // timeupdate dispara ~60Hz. Throttle store update a 10Hz pra não
    // re-renderizar o display a cada frame. Drift correction removida: o
    // sync inicial no onPlay basta, e seek-storm em 5 <audio> simultâneos
    // (macOS WebKit) matava o som depois de poucos segundos.
    let lastStoreUpdate = 0;
    const onTime = (t: number) => {
      const now = performance.now();
      if (now - lastStoreUpdate >= 100) {
        lastStoreUpdate = now;
        setPosition(t);
      }
    };
    // wavesurfer 7: payload de `seeking` é currentTime em segundos.
    const onSeek = (currentTime: number) => {
      for (const [name, ws] of Object.entries(created)) {
        if (name !== masterName) ws.setTime(currentTime);
      }
    };

    master.on("ready", onReady);
    master.on("play", onPlay);
    master.on("pause", onPause);
    master.on("timeupdate", onTime);
    master.on("seeking", onSeek);

    // Followers: redirecionar cliques pro master pra evitar dessync na barra.
    for (const [name, ws] of Object.entries(created)) {
      if (name === masterName) continue;
      ws.on("interaction", (newTime) => {
        master.setTime(newTime);
      });
    }

    // Retoma playback quando a janela ganha foco/visibilidade — macOS WebKit
    // suspende media em blur mesmo com a página visível.
    const resume = () => {
      if (intentRef.current !== "playing") return;
      if (master.isPlaying()) return;
      master.play().catch(() => undefined);
    };
    const onVisibility = () => {
      if (!document.hidden) resume();
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const ws of Object.values(created)) {
        ws.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stems.map((s) => s.path).join("|")]);

  // Sincroniza ganhos quando controls mudam.
  const controls = usePlayerStore((s) => s.controls);
  useEffect(() => {
    for (const stem of stems) {
      const ws = instances.current[stem.name];
      if (!ws) continue;
      ws.setVolume(effectiveGain(stem.name, controls));
    }
  }, [controls, stems]);

  // API pública.
  return {
    /** Use como ref no <div /> do waveform de cada stem. */
    setRef: (name: string) => (el: HTMLDivElement | null) => {
      containers.current[name] = el;
    },
    play: () => {
      const master = instances.current[stems[0]?.name ?? ""];
      intentRef.current = "playing";
      master?.play().catch(() => undefined);
    },
    pause: () => {
      const master = instances.current[stems[0]?.name ?? ""];
      intentRef.current = "paused";
      master?.pause();
    },
    toggle: () => {
      const master = instances.current[stems[0]?.name ?? ""];
      if (!master) return;
      if (master.isPlaying()) {
        intentRef.current = "paused";
        master.pause();
      } else {
        intentRef.current = "playing";
        master.play().catch(() => undefined);
      }
    },
    seekTo: (seconds: number) => {
      for (const ws of Object.values(instances.current)) ws.setTime(seconds);
    },
  };
}

/** Shade hex color by amount (-1..1). */
function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const num = parseInt(m, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const adj = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  r = adj(r);
  g = adj(g);
  b = adj(b);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
