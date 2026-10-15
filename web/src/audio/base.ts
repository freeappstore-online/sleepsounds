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

  private untilControl = 0

  process(out: Float32Array): void {
    // The control clock runs across calls, so the output is the same
    // whatever block size the caller uses.
    for (let i = 0; i < out.length; i++) {
      if (this.untilControl === 0) {
        this.control(CHUNK)
        this.untilControl = CHUNK
      }
      this.untilControl--
      out[i] = softLimit(this.sample())
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
