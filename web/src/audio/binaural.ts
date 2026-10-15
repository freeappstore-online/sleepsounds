// Binaural beats: a pure tone in each ear, the two a few hertz apart. Heard
// on headphones, the difference is perceived as a slow pulse (the "beat").
// It needs headphones: through one speaker the tones just mix acoustically.

import type { Generator } from './base'

/** Carrier tone (the average of the two ears). Low and soft, not piercing. */
export const CARRIER_HZ = 200
export const MIN_BEAT_HZ = 1
export const MAX_BEAT_HZ = 30
export const DEFAULT_BEAT_HZ = 6
/**
 * Peak level per ear. Pure tones sound louder than noise at the same level,
 * so this sits well below the noise sounds (~0.085 RMS against ~0.16).
 */
export const TONE_LEVEL = 0.12
/** Time constant for gliding to a new beat frequency, in seconds. */
export const GLIDE_SECONDS = 0.25

export function clampBeat(hz: number): number {
  if (!Number.isFinite(hz)) return DEFAULT_BEAT_HZ
  return Math.min(MAX_BEAT_HZ, Math.max(MIN_BEAT_HZ, hz))
}

/** The two ear frequencies for a beat, centred on the carrier. */
export function earFrequencies(beatHz: number, carrierHz = CARRIER_HZ): { left: number; right: number } {
  const half = clampBeat(beatHz) / 2
  return { left: carrierHz - half, right: carrierHz + half }
}

export class Binaural implements Generator {
  readonly channels = 2
  private readonly sampleRate: number
  private readonly carrier: number
  private readonly glide: number
  private beat: number
  private target: number
  // Phases are in cycles (0–1) and carry on across calls and beat changes,
  // so the waveform never jumps.
  private phaseL = 0
  private phaseR = 0

  constructor(sampleRate: number, beatHz = DEFAULT_BEAT_HZ, carrierHz = CARRIER_HZ) {
    this.sampleRate = sampleRate
    this.carrier = carrierHz
    this.beat = this.target = clampBeat(beatHz)
    this.glide = 1 - Math.exp(-1 / (GLIDE_SECONDS * sampleRate))
  }

  /** Change the beat; the tones glide there rather than jumping. */
  setBeat(hz: number): void {
    this.target = clampBeat(hz)
  }

  /** The beat being played right now (mid-glide, this lags the target). */
  get currentBeat(): number {
    return this.beat
  }

  /**
   * Fill the left ear into `left` and the right ear into `right`. With no
   * right buffer, only the left tone is written.
   */
  process(left: Float32Array, right?: Float32Array): void {
    const sr = this.sampleRate
    for (let i = 0; i < left.length; i++) {
      this.beat += (this.target - this.beat) * this.glide
      const half = this.beat / 2
      this.phaseL += (this.carrier - half) / sr
      this.phaseR += (this.carrier + half) / sr
      if (this.phaseL >= 1) this.phaseL -= 1
      if (this.phaseR >= 1) this.phaseR -= 1
      left[i] = Math.sin(2 * Math.PI * this.phaseL) * TONE_LEVEL
      if (right) right[i] = Math.sin(2 * Math.PI * this.phaseR) * TONE_LEVEL
    }
  }
}

/** "6 Hz", "6.5 Hz": the beat as shown next to its slider. */
export function formatBeat(hz: number): string {
  const v = Math.round(clampBeat(hz) * 10) / 10
  return `${v} Hz`
}
