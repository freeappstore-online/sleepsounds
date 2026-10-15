// Noise sources. Each one is computed sample by sample from a PRNG, so there
// is no buffer and nothing ever loops. They are both sounds in their own right
// (white, pink, brown) and the raw material for the textured sounds.

import { Rng } from './dsp'

/** Flat spectrum, uniform in [-1, 1). */
export class WhiteNoise {
  private readonly rng: Rng

  constructor(rng: Rng) {
    this.rng = rng
  }

  next(): number {
    return this.rng.bipolar()
  }
}

/**
 * Pink noise (−3 dB/octave) using Paul Kellet's refined filter bank. Output
 * sits roughly in [-1, 1].
 */
export class PinkNoise {
  private readonly rng: Rng
  private b0 = 0
  private b1 = 0
  private b2 = 0
  private b3 = 0
  private b4 = 0
  private b5 = 0
  private b6 = 0

  constructor(rng: Rng) {
    this.rng = rng
  }

  next(): number {
    const w = this.rng.bipolar()
    this.b0 = 0.99886 * this.b0 + w * 0.0555179
    this.b1 = 0.99332 * this.b1 + w * 0.0750759
    this.b2 = 0.969 * this.b2 + w * 0.153852
    this.b3 = 0.8665 * this.b3 + w * 0.3104856
    this.b4 = 0.55 * this.b4 + w * 0.5329522
    this.b5 = -0.7616 * this.b5 - w * 0.016898
    const out = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362
    this.b6 = w * 0.115926
    return out * 0.11
  }
}

/**
 * Brown (red) noise, −6 dB/octave: a leaky integrator of white noise. The
 * leak keeps it from wandering off into a DC offset over a long night.
 */
export class BrownNoise {
  private readonly rng: Rng
  private y = 0

  constructor(rng: Rng) {
    this.rng = rng
  }

  next(): number {
    this.y = (this.y + 0.02 * this.rng.bipolar()) / 1.02
    return this.y * 3.5
  }
}
