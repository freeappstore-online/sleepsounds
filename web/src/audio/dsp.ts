// Small DSP building blocks shared by every generator. Everything here is
// plain arithmetic on numbers so it runs inside an AudioWorklet and in unit
// tests alike. Nothing allocates per sample.

/** Seeded PRNG (mulberry32). Deterministic, so tests can replay a sound. */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform in [-1, 1). */
  bipolar(): number {
    return this.next() * 2 - 1
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next()
  }

  /** Exponentially distributed wait (seconds) for a Poisson process. */
  exp(ratePerSecond: number): number {
    return -Math.log(1 - this.next()) / ratePerSecond
  }
}

/** One-pole low-pass. Gentle 6 dB/octave slope, used to tame highs. */
export class OnePoleLP {
  private readonly sampleRate: number
  private a = 0
  private y = 0

  constructor(sampleRate: number, cutoffHz: number) {
    this.sampleRate = sampleRate
    this.setCutoff(cutoffHz)
  }

  setCutoff(hz: number): void {
    this.a = 1 - Math.exp((-2 * Math.PI * hz) / this.sampleRate)
  }

  process(x: number): number {
    this.y += this.a * (x - this.y)
    return this.y
  }
}

/** One-pole high-pass (input minus its low-passed self). Removes rumble and DC. */
export class OnePoleHP {
  private readonly lp: OnePoleLP

  constructor(sampleRate: number, cutoffHz: number) {
    this.lp = new OnePoleLP(sampleRate, cutoffHz)
  }

  process(x: number): number {
    return x - this.lp.process(x)
  }
}

/**
 * Soft safety limiter: transparent below 0.5, then bends smoothly towards
 * ±1 so a rare loud event can never clip harshly.
 */
export function softLimit(x: number): number {
  const a = Math.abs(x)
  if (a <= 0.5) return x
  const over = a - 0.5
  return Math.sign(x) * (0.5 + over / (1 + 2 * over))
}
