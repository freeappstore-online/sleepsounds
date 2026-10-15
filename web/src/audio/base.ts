// The shape every sound generator shares. Generators are pure TypeScript with
// no Web Audio dependency: the worklet (worklet.ts) runs them on the audio
// thread and the unit tests run them directly.

import { Rng, softLimit } from './dsp'

export interface Generator {
  /** Fill `out` with the next out.length samples (mono, roughly ±1). */
  process(out: Float32Array): void
}

// Filters and modulators are retuned once per chunk rather than per sample.
// 64 samples is ~1.3 ms: far too short to hear as steps, and it keeps the
// trig and exp calls off the per-sample path.
const CHUNK = 64

export abstract class GeneratorBase implements Generator {
  protected readonly sr: number
  protected readonly rng: Rng

  constructor(sampleRate: number, seed: number) {
    this.sr = sampleRate
    this.rng = new Rng(seed)
  }

  process(out: Float32Array): void {
    for (let start = 0; start < out.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, out.length)
      this.control(end - start)
      for (let i = start; i < end; i++) out[i] = softLimit(this.sample())
    }
  }

  /** Update slow parameters; `n` samples follow before the next call. */
  protected control(n: number): void {
    void n
  }

  protected abstract sample(): number

  protected ms(milliseconds: number): number {
    return (milliseconds / 1000) * this.sr
  }
}
