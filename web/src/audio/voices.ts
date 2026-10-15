// Short sound events (raindrop ticks, fire crackles, stream bubbles) built
// from fixed pools of voices. Pools are preallocated, so triggering an event
// never allocates; when a pool is full the new event is simply skipped.

const SILENT = 1e-4

/**
 * Envelopes for noise grains. `next()` returns the sum of all active
 * envelopes; the caller multiplies it by one shared noise source and filter,
 * which is far cheaper than a noise generator per grain.
 */
export class GrainPool {
  private readonly env: Float64Array
  private readonly peak: Float64Array
  private readonly rise: Float64Array
  private readonly decay: Float64Array
  private readonly attacking: Uint8Array
  private active = 0

  constructor(size: number) {
    this.env = new Float64Array(size)
    this.peak = new Float64Array(size)
    this.rise = new Float64Array(size)
    this.decay = new Float64Array(size)
    this.attacking = new Uint8Array(size)
  }

  /** Number of grains currently sounding. */
  get count(): number {
    return this.active
  }

  /**
   * Start a grain: a linear attack (never instant, so no click) to `amp`,
   * then an exponential decay with time constant `tauSamples`.
   */
  trigger(amp: number, attackSamples: number, tauSamples: number): void {
    if (this.active >= this.env.length) return
    const i = this.active++
    this.env[i] = 0
    this.peak[i] = amp
    this.rise[i] = amp / Math.max(1, attackSamples)
    this.decay[i] = Math.exp(-1 / Math.max(1, tauSamples))
    this.attacking[i] = 1
  }

  next(): number {
    let sum = 0
    for (let i = 0; i < this.active; i++) {
      let e = this.env[i]
      if (this.attacking[i]) {
        e += this.rise[i]
        if (e >= this.peak[i]) {
          e = this.peak[i]
          this.attacking[i] = 0
        }
      } else {
        e *= this.decay[i]
        if (e < SILENT) {
          this.remove(i--)
          continue
        }
      }
      this.env[i] = e
      sum += e
    }
    return sum
  }

  private remove(i: number): void {
    const last = --this.active
    this.env[i] = this.env[last]
    this.peak[i] = this.peak[last]
    this.rise[i] = this.rise[last]
    this.decay[i] = this.decay[last]
    this.attacking[i] = this.attacking[last]
  }
}

/**
 * Decaying sine voices with an optional pitch glide, for water drops and
 * bubbles (a bubble's pitch rises as it shrinks).
 */
export class TonePool {
  private readonly env: Float64Array
  private readonly peak: Float64Array
  private readonly rise: Float64Array
  private readonly decay: Float64Array
  private readonly attacking: Uint8Array
  private readonly phase: Float64Array
  private readonly inc: Float64Array
  private readonly glide: Float64Array
  private readonly sampleRate: number
  private active = 0

  constructor(size: number, sampleRate: number) {
    this.sampleRate = sampleRate
    this.env = new Float64Array(size)
    this.peak = new Float64Array(size)
    this.rise = new Float64Array(size)
    this.decay = new Float64Array(size)
    this.attacking = new Uint8Array(size)
    this.phase = new Float64Array(size)
    this.inc = new Float64Array(size)
    this.glide = new Float64Array(size)
  }

  get count(): number {
    return this.active
  }

  /**
   * Start a tone at `freqHz` whose pitch is multiplied by `glideRatio` over
   * one decay time constant.
   */
  trigger(amp: number, freqHz: number, glideRatio: number, attackSamples: number, tauSamples: number): void {
    if (this.active >= this.env.length) return
    const i = this.active++
    const tau = Math.max(1, tauSamples)
    this.env[i] = 0
    this.peak[i] = amp
    this.rise[i] = amp / Math.max(1, attackSamples)
    this.decay[i] = Math.exp(-1 / tau)
    this.attacking[i] = 1
    this.phase[i] = 0
    this.inc[i] = (2 * Math.PI * freqHz) / this.sampleRate
    this.glide[i] = Math.pow(glideRatio, 1 / tau)
  }

  next(): number {
    let sum = 0
    for (let i = 0; i < this.active; i++) {
      let e = this.env[i]
      if (this.attacking[i]) {
        e += this.rise[i]
        if (e >= this.peak[i]) {
          e = this.peak[i]
          this.attacking[i] = 0
        }
      } else {
        e *= this.decay[i]
        if (e < SILENT) {
          this.remove(i--)
          continue
        }
      }
      this.env[i] = e
      this.phase[i] += this.inc[i]
      if (this.phase[i] > 2 * Math.PI) this.phase[i] -= 2 * Math.PI
      this.inc[i] *= this.glide[i]
      sum += e * Math.sin(this.phase[i])
    }
    return sum
  }

  private remove(i: number): void {
    const last = --this.active
    this.env[i] = this.env[last]
    this.peak[i] = this.peak[last]
    this.rise[i] = this.rise[last]
    this.decay[i] = this.decay[last]
    this.attacking[i] = this.attacking[last]
    this.phase[i] = this.phase[last]
    this.inc[i] = this.inc[last]
    this.glide[i] = this.glide[last]
  }
}
