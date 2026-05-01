import WaveSurfer from "wavesurfer.js";
import { readAudioBytes } from "./tauri";
import type { Stem, StemName } from "../types/sidecar";

interface Voice {
  buffer: AudioBuffer;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
}

type Listener = () => void;

/**
 * Engine de áudio singleton, fora do React.
 *
 * - Web Audio API (AudioBufferSourceNode + GainNode): não usa `<audio>`,
 *   então macOS WebKit não pausa em blur de janela.
 * - Estado vive no módulo, sobrevive a remount/re-render dos componentes.
 * - Subscribers chamados a cada mudança (playing, position, duration).
 */
class StemEngine {
  private ctx: AudioContext | null = null;
  private voices: Map<string, Voice> = new Map();
  private peaks: Map<string, number[][]> = new Map();
  private wavesurfers: Map<string, WaveSurfer> = new Map();
  private containers: Map<string, { el: HTMLDivElement; color: string }> = new Map();

  private startedAt = 0;
  private offsetSec = 0;
  private playing = false;
  private durationSec = 0;
  private rafId: number | null = null;
  private currentKey = "";
  private listeners: Set<Listener> = new Set();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getDuration(): number {
    return this.durationSec;
  }

  getPosition(): number {
    if (!this.ctx) return this.offsetSec;
    if (!this.playing) return this.offsetSec;
    // Durante o preroll (startedAt no futuro), elapsed é negativo — clampa.
    const elapsed = Math.max(0, this.ctx.currentTime - this.startedAt);
    return Math.min(this.durationSec, this.offsetSec + elapsed);
  }

  /** Idempotente: se a mesma lista de stems já foi carregada, no-op. */
  async load(stems: Stem[]): Promise<void> {
    const key = stems.map((s) => s.path).join("|");
    if (key === this.currentKey) return;
    this.currentKey = key;

    this.stopSources();
    for (const ws of this.wavesurfers.values()) ws.destroy();
    this.wavesurfers.clear();
    for (const v of this.voices.values()) {
      try {
        v.gain.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.voices.clear();
    this.peaks.clear();
    this.offsetSec = 0;
    this.durationSec = 0;
    this.playing = false;
    this.cancelRaf();
    this.emit();

    if (stems.length === 0) return;

    if (!this.ctx) this.ctx = new AudioContext();
    const ctx = this.ctx;

    let decoded: { stem: Stem; buf: AudioBuffer }[];
    try {
      decoded = await Promise.all(
        stems.map(async (stem) => {
          const arr = await readAudioBytes(stem.path);
          const buf = await ctx.decodeAudioData(arr);
          return { stem, buf };
        }),
      );
    } catch (e) {
      // Reset currentKey pra permitir retry no próximo load (clicar mesma
      // entry de novo). Sem isso, key === currentKey e load() volta cedo.
      this.currentKey = "";
      throw e;
    }

    if (key !== this.currentKey) return; // outra carga superou esta

    let maxDur = 0;
    for (const { stem, buf } of decoded) {
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      this.voices.set(stem.name, { buffer: buf, gain, source: null });
      this.peaks.set(stem.name, computePeaks(buf));
      if (buf.duration > maxDur) maxDur = buf.duration;
    }
    this.durationSec = maxDur;

    for (const [name, slot] of this.containers) {
      this.attachWavesurfer(name, slot.el, slot.color);
    }

    this.emit();
  }

  /** Liga ou re-liga um waveform a um container DOM. Pode ser chamado
   * antes ou depois do load — auto-faz o attach quando ambos disponíveis. */
  bindContainer(name: string, el: HTMLDivElement | null, color: string): void {
    if (!el) {
      this.containers.delete(name);
      const ws = this.wavesurfers.get(name);
      if (ws) {
        ws.destroy();
        this.wavesurfers.delete(name);
      }
      return;
    }
    this.containers.set(name, { el, color });
    this.attachWavesurfer(name, el, color);
  }

  private attachWavesurfer(name: string, el: HTMLDivElement, color: string): void {
    const peaks = this.peaks.get(name);
    const voice = this.voices.get(name);
    if (!peaks || !voice) return;
    const existing = this.wavesurfers.get(name);
    if (existing) {
      existing.destroy();
      this.wavesurfers.delete(name);
    }
    const ws = WaveSurfer.create({
      container: el,
      height: 64,
      waveColor: color,
      progressColor: shade(color, -0.3),
      cursorColor: "#f5f5f5",
      cursorWidth: 1,
      normalize: true,
      interact: true,
      peaks,
      duration: voice.buffer.duration,
    });
    ws.on("interaction", (t: number) => this.seek(t));
    ws.setTime(this.getPosition());
    this.wavesurfers.set(name, ws);
  }

  setGain(name: StemName, value: number): void {
    const v = this.voices.get(name);
    if (!v) return;
    v.gain.gain.value = value;
  }

  play(): void {
    if (!this.ctx) return;
    if (this.playing) return;
    if (this.voices.size === 0) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => undefined);
    if (this.offsetSec >= this.durationSec) this.offsetSec = 0;

    // Sample-accurate sync: agenda todos os sources pro MESMO instante
    // futuro (50ms de preroll). Sem isso, `start(0, ...)` agenda "imediato"
    // a cada chamada, e o tempo gasto criando/conectando os nós acumula
    // skew sub-ms entre stems.
    const startTime = this.ctx.currentTime + 0.05;
    for (const v of this.voices.values()) {
      const src = this.ctx.createBufferSource();
      src.buffer = v.buffer;
      src.connect(v.gain);
      src.start(startTime, this.offsetSec);
      v.source = src;
    }
    this.startedAt = startTime;
    this.playing = true;
    this.emit();
    this.startRaf();
  }

  pause(): void {
    if (!this.playing) return;
    const ctx = this.ctx;
    const elapsed = ctx ? Math.max(0, ctx.currentTime - this.startedAt) : 0;
    this.offsetSec = Math.min(this.durationSec, this.offsetSec + elapsed);
    this.stopSources();
    this.playing = false;
    this.cancelRaf();
    this.syncWavesurfers(this.offsetSec);
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number): void {
    const target = Math.max(0, Math.min(this.durationSec, t));
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.stopSources();
      this.playing = false;
      this.cancelRaf();
    }
    this.offsetSec = target;
    this.syncWavesurfers(target);
    this.emit();
    if (wasPlaying) this.play();
  }

  private stopSources(): void {
    for (const v of this.voices.values()) {
      try {
        v.source?.stop();
      } catch {
        // already stopped
      }
      v.source = null;
    }
  }

  private syncWavesurfers(t: number): void {
    for (const ws of this.wavesurfers.values()) ws.setTime(t);
  }

  private startRaf(): void {
    this.cancelRaf();
    const loop = () => {
      const t = this.getPosition();
      if (this.durationSec > 0 && t >= this.durationSec) {
        this.stopSources();
        this.playing = false;
        this.offsetSec = 0;
        this.syncWavesurfers(0);
        this.rafId = null;
        this.emit();
        return;
      }
      this.syncWavesurfers(t);
      this.emit();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private cancelRaf(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Limpa tudo — chamado ao trocar de faixa via UI. */
  reset(): void {
    this.stopSources();
    for (const ws of this.wavesurfers.values()) ws.destroy();
    this.wavesurfers.clear();
    for (const v of this.voices.values()) {
      try {
        v.gain.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.voices.clear();
    this.peaks.clear();
    this.containers.clear();
    this.offsetSec = 0;
    this.durationSec = 0;
    this.playing = false;
    this.currentKey = "";
    this.cancelRaf();
    this.emit();
  }
}

export const stemEngine = new StemEngine();

function computePeaks(buf: AudioBuffer, samples = 1000): number[][] {
  const out: number[][] = [];
  const channelCount = Math.min(buf.numberOfChannels, 2);
  for (let ch = 0; ch < channelCount; ch++) {
    const data = buf.getChannelData(ch);
    const block = Math.max(1, Math.floor(data.length / samples));
    const peaks: number[] = new Array(samples).fill(0);
    for (let i = 0; i < samples; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(data.length, start + block);
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j] ?? 0);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    out.push(peaks);
  }
  return out;
}

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
