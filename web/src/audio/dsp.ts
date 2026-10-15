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
 * RBJ band-pass biquad (constant 0 dB peak gain). Coefficients can be
 * changed while running; callers retune at most once per block and with
 * smoothed targets, so there is no zipper noise.
 */
export class BandPass {
  private readonly sampleRate: number
  private q: number
  private b0 = 0
  private a1 = 0
  private a2 = 0
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  constructor(sampleRate: number, freqHz: number, q: number) {
    this.sampleRate = sampleRate
    this.q = q
    this.set(freqHz, q)
  }

  set(freqHz: number, q = this.q): void {
    this.q = q
    const w = (2 * Math.PI * Math.min(freqHz, this.sampleRate * 0.45)) / this.sampleRate
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b0 = alpha / a0
    this.a1 = (-2 * Math.cos(w)) / a0
    this.a2 = (1 - alpha) / a0
  }

  process(x: number): number {
    // b1 is 0 and b2 is -b0 for this band-pass form.
    const y = this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

/**
 * A slowly wandering control value in [0, 1]. It glides (smoothstep) between
 * random targets, and every glide gets a random length around 1 / rateHz, so
 * the movement never settles into a period the ear could pick out.
 */
export class Drift {
  private readonly rng: Rng
  private readonly sampleRate: number
  private readonly rateHz: number
  private from: number
  private to: number
  private pos = 0
  private len = 1

  constructor(rng: Rng, sampleRate: number, rateHz: number) {
    this.rng = rng
    this.sampleRate = sampleRate
    this.rateHz = rateHz
    this.from = rng.next()
    this.to = rng.next()
    this.newSegment()
  }

  private newSegment(): void {
    this.pos = 0
    this.len = Math.max(1, Math.round((this.sampleRate / this.rateHz) * this.rng.range(0.5, 1.5)))
  }

  /** Advance by n samples and return the current value. */
  step(n = 1): number {
    this.pos += n
    while (this.pos >= this.len) {
      const over = this.pos - this.len
      this.from = this.to
      this.to = this.rng.next()
      this.newSegment()
      this.pos = over
    }
    const t = this.pos / this.len
    return this.from + (this.to - this.from) * t * t * (3 - 2 * t)
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
