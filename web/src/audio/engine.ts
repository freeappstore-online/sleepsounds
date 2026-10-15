// The audio engine: one AudioContext, a master gain, and per sound a worklet
// node running its generator into its own gain. Every level change is a ramp,
// never a jump, so starting, stopping and adjusting sounds can't click.
//
//   generator node ─▶ sound gain ─┐
//   generator node ─▶ sound gain ─┼─▶ master gain ─▶ speakers
//   ...                           ┘

import { PROCESSOR_NAME, type SoundKind } from './generators'

/** Fade used when a sound starts or stops. */
export const FADE_SECONDS = 1.5
/** Ramp used for volume changes, short enough to feel immediate. */
export const VOLUME_RAMP_SECONDS = 0.08
export const DEFAULT_VOLUME = 0.7

/**
 * Map a slider position (0–1) to a gain. Loudness is roughly logarithmic, so
 * a squared curve makes the lower half of the slider usable for quiet sleep
 * levels instead of everything happening at the very bottom.
 */
export function volumeToGain(volume: number): number {
  const v = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0
  return v * v
}

/**
 * Move an AudioParam to `target` over `seconds`, starting from wherever it is
 * right now (even mid-ramp), so overlapping changes stay smooth.
 */
export function rampParam(param: AudioParam, target: number, now: number, seconds: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now)
  } else {
    const current = param.value
    param.cancelScheduledValues(now)
    param.setValueAtTime(current, now)
  }
  param.linearRampToValueAtTime(target, now + seconds)
}

export interface EngineOptions {
  /** URL of the bundled worklet module (see audio/index.ts). */
  workletUrl: string | URL
  /** Defaults to a new AudioContext; tests pass a fake. */
  createContext?: () => AudioContext
  /** Defaults to an AudioWorkletNode running the generator. */
  createSource?: (ctx: AudioContext, kind: SoundKind, seed: number) => AudioNode & { port?: MessagePort }
  /** Defaults to a random seed, so every session sounds a little different. */
  seed?: () => number
}

interface Voice {
  source: AudioNode & { port?: MessagePort }
  gain: GainNode
  volume: number
  stopTimer: ReturnType<typeof setTimeout> | null
}

export class AudioEngine {
  private readonly options: EngineOptions
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ready: Promise<void> | null = null
  private masterVolume = 1
  private readonly voices = new Map<SoundKind, Voice>()
  private readonly volumes = new Map<SoundKind, number>()

  constructor(options: EngineOptions) {
    this.options = options
  }

  /**
   * Create and resume the AudioContext. Call it from a user gesture (a tap
   * or key press): browsers only allow audio to start from one. Safe to call
   * repeatedly.
   */
  unlock(): Promise<void> {
    if (!this.ctx) {
      const ctx = this.options.createContext
        ? this.options.createContext()
        : new AudioContext({ latencyHint: 'playback' })
      const master = ctx.createGain()
      master.gain.value = volumeToGain(this.masterVolume)
      master.connect(ctx.destination)
      this.ctx = ctx
      this.master = master
    }
    const ctx = this.ctx
    // Resume first: it has to happen inside the gesture's call stack.
    const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume()
    return Promise.all([this.loadWorklet(ctx), resumed]).then(() => undefined)
  }

  private loadWorklet(ctx: AudioContext): Promise<void> {
    if (!this.ready) {
      const ready = this.options.createSource
        ? Promise.resolve()
        : ctx.audioWorklet.addModule(this.options.workletUrl.toString())
      // A failed load must not stay cached, or no sound could ever play.
      ready.catch(() => {
        if (this.ready === ready) this.ready = null
      })
      this.ready = ready
    }
    return this.ready
  }

  isPlaying(kind: SoundKind): boolean {
    const voice = this.voices.get(kind)
    return !!voice && voice.stopTimer === null
  }

  playing(): SoundKind[] {
    return [...this.voices.keys()].filter((kind) => this.isPlaying(kind))
  }

  getVolume(kind: SoundKind): number {
    return this.volumes.get(kind) ?? DEFAULT_VOLUME
  }

  getMasterVolume(): number {
    return this.masterVolume
  }

  /** Start a sound (fading in), or cancel its fade-out if it is stopping. */
  async play(kind: SoundKind): Promise<void> {
    await this.unlock()
    const ctx = this.ctx!
    const volume = this.getVolume(kind)
    const existing = this.voices.get(kind)
    if (existing) {
      if (existing.stopTimer !== null) {
        clearTimeout(existing.stopTimer)
        existing.stopTimer = null
        rampParam(existing.gain.gain, volumeToGain(volume), ctx.currentTime, FADE_SECONDS)
      }
      return
    }
    const seed = this.options.seed ? this.options.seed() : Math.floor(Math.random() * 2 ** 32)
    const source = this.options.createSource
      ? this.options.createSource(ctx, kind, seed)
      : new AudioWorkletNode(ctx, PROCESSOR_NAME, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { kind, seed },
        })
    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(this.master!)
    rampParam(gain.gain, volumeToGain(volume), ctx.currentTime, FADE_SECONDS)
    this.voices.set(kind, { source, gain, volume, stopTimer: null })
  }

  /** Fade a sound out, then free its node. */
  stop(kind: SoundKind): void {
    const voice = this.voices.get(kind)
    if (!voice || voice.stopTimer !== null || !this.ctx) return
    rampParam(voice.gain.gain, 0, this.ctx.currentTime, FADE_SECONDS)
    voice.stopTimer = setTimeout(
      () => {
        voice.source.port?.postMessage('stop')
        voice.source.disconnect()
        voice.gain.disconnect()
        if (this.voices.get(kind) === voice) this.voices.delete(kind)
      },
      // Wait a little past the ramp so the node is silent when cut.
      (FADE_SECONDS + 0.1) * 1000,
    )
  }

  stopAll(): void {
    for (const kind of this.voices.keys()) this.stop(kind)
  }

  async toggle(kind: SoundKind): Promise<void> {
    if (this.isPlaying(kind)) this.stop(kind)
    else await this.play(kind)
  }

  /** Set one sound's volume (0–1). Remembered even while it is stopped. */
  setVolume(kind: SoundKind, volume: number): void {
    const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0))
    this.volumes.set(kind, v)
    const voice = this.voices.get(kind)
    if (!voice || !this.ctx) return
    voice.volume = v
    // A sound that is fading out keeps fading out.
    if (voice.stopTimer === null) {
      rampParam(voice.gain.gain, volumeToGain(v), this.ctx.currentTime, VOLUME_RAMP_SECONDS)
    }
  }

  /** Set the overall volume (0–1) applied on top of every sound. */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0))
    if (this.master && this.ctx) {
      rampParam(this.master.gain, volumeToGain(this.masterVolume), this.ctx.currentTime, VOLUME_RAMP_SECONDS)
    }
  }
}
