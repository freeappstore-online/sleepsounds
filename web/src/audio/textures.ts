// The textured sounds: rain, ocean waves, wind, fan, fireplace and stream.
// Nothing is a recording and nothing is a looped buffer: each sound is noise
// shaped by filters whose settings wander at random (see Drift), plus randomly
// timed events (drops, crackles, bubbles), so the output never repeats.

import { GeneratorBase } from './base'
import { BandPass, Drift, OnePoleHP, OnePoleLP } from './dsp'
import { BrownNoise, PinkNoise, WhiteNoise } from './noise'
import { GrainPool, TonePool } from './voices'

/**
 * Rain: a soft band-limited wash for the distant downpour, dense tiny noise
 * ticks for drops landing nearby, and the odd quiet "plink" of a drop in a
 * puddle. Intensity drifts slowly so the shower swells and eases.
 */
export class Rain extends GeneratorBase {
  private readonly pink = new PinkNoise(this.rng)
  private readonly white = new WhiteNoise(this.rng)
  private readonly bedHp = new OnePoleHP(this.sr, 350)
  private readonly bedLp = new OnePoleLP(this.sr, 4000)
  private readonly tickHp = new OnePoleHP(this.sr, 900)
  private readonly tickLp = new OnePoleLP(this.sr, 3500)
  private readonly tickLp2 = new OnePoleLP(this.sr, 6000)
  private readonly ticks = new GrainPool(64)
  private readonly plinks = new TonePool(6, this.sr)
  private readonly intensity = new Drift(this.rng, this.sr, 0.06)
  private nextTick = 0
  private nextPlink = 0
  private level = 1

  protected control(n: number): void {
    this.level = 0.75 + 0.5 * this.intensity.step(n)
  }

  protected sample(): number {
    if (--this.nextTick <= 0) {
      const a = this.rng.next()
      this.ticks.trigger(0.08 + 0.27 * a * a, this.ms(0.6), this.ms(this.rng.range(1.5, 6)))
      this.nextTick = this.rng.exp(400 * this.level) * this.sr
    }
    if (--this.nextPlink <= 0) {
      this.plinks.trigger(
        this.rng.range(0.02, 0.06),
        this.rng.range(1200, 2800),
        this.rng.range(1.05, 1.3),
        this.ms(1),
        this.ms(this.rng.range(8, 22)),
      )
      this.nextPlink = this.rng.exp(2.5) * this.sr
    }
    const bed = this.bedLp.process(this.bedHp.process(this.pink.next()))
    const tick = this.tickLp2.process(this.tickLp.process(this.tickHp.process(this.white.next() * this.ticks.next())))
    return (bed * 1.15 + tick * 1.7) * this.level + this.plinks.next()
  }
}

/**
 * Ocean waves: each wave is a randomly sized swell (a few seconds rising)
 * followed by a crash and a long hissing wash back down. Wave length, height
 * and trough all vary, so no two waves are alike. Low rumble is the body of
 * the water; brighter foam only comes in near the crest.
 */
export class Waves extends GeneratorBase {
  private readonly brown = new BrownNoise(this.rng)
  private readonly pink = new PinkNoise(this.rng)
  private readonly bodyLp = new OnePoleLP(this.sr, 300)
  private readonly foamHp = new OnePoleHP(this.sr, 400)
  private readonly foamLp = new OnePoleLP(this.sr, 1500)
  private readonly undertowLp = new OnePoleLP(this.sr, 120)
  private readonly dcHp = new OnePoleHP(this.sr, 20)
  private from = 0.1
  private to = 0.1
  private pos = 0
  private len = 1
  private rising = false
  private env = 0.1

  constructor(sampleRate: number, seed: number) {
    super(sampleRate, seed)
    // Start partway into a gentle wash rather than on a crest.
    this.to = 0.12
    this.len = Math.round(this.sr * this.rng.range(1, 3))
  }

  protected control(n: number): void {
    this.pos += n
    if (this.pos >= this.len) {
      this.pos -= this.len
      this.from = this.to
      this.rising = !this.rising
      if (this.rising) {
        this.to = this.rng.range(0.55, 1)
        this.len = Math.round(this.sr * this.rng.range(2.5, 5))
      } else {
        this.to = this.rng.range(0.06, 0.22)
        this.len = Math.round(this.sr * this.rng.range(4, 9))
      }
    }
    const t = Math.min(1, this.pos / this.len)
    // Rise eases in and out; the fall drops fast (the crash) then trails off.
    const shape = this.rising ? t * t * (3 - 2 * t) : 1 - (1 - t) * (1 - t) * (1 - t)
    this.env = this.from + (this.to - this.from) * shape
    this.bodyLp.setCutoff(180 + 700 * this.env)
    this.foamLp.setCutoff(700 + 2300 * this.env)
  }

  protected sample(): number {
    const e = this.env
    const body = this.bodyLp.process(this.brown.next()) * (0.25 + 0.75 * e)
    const foam = this.foamLp.process(this.foamHp.process(this.pink.next())) * e * e
    const undertow = this.undertowLp.process(this.brown.next())
    return this.dcHp.process(body * 1.1 + foam * 1.1 + undertow * 0.6)
  }
}

/**
 * Wind: noise through two band-pass filters whose centre frequencies drift
 * independently (the "howl"), with slow gusts and a faster flutter on the
 * level, over a low rumble.
 */
export class Wind extends GeneratorBase {
  private readonly pink = new PinkNoise(this.rng)
  private readonly brown = new BrownNoise(this.rng)
  private readonly band1 = new BandPass(this.sr, 400, 1.2)
  private readonly band2 = new BandPass(this.sr, 900, 3)
  private readonly rumbleLp = new OnePoleLP(this.sr, 180)
  private readonly dcHp = new OnePoleHP(this.sr, 20)
  private readonly pitch1 = new Drift(this.rng, this.sr, 0.15)
  private readonly pitch2 = new Drift(this.rng, this.sr, 0.1)
  private readonly gust = new Drift(this.rng, this.sr, 0.07)
  private readonly flutter = new Drift(this.rng, this.sr, 0.9)
  private level = 0.5

  protected control(n: number): void {
    const g = this.gust.step(n)
    this.level = (0.3 + 0.7 * g * Math.sqrt(g)) * (0.9 + 0.2 * this.flutter.step(n))
    // Stronger gusts sound higher, as with real wind.
    this.band1.set(220 + 380 * this.pitch1.step(n) + 200 * g)
    this.band2.set(550 + 700 * this.pitch2.step(n) + 250 * g)
  }

  protected sample(): number {
    const p = this.pink.next()
    const howl = this.band1.process(p) * 1.6 + this.band2.process(p) * 0.6
    const rumble = this.rumbleLp.process(this.brown.next())
    return this.dcHp.process((howl * this.level + rumble * (0.3 + 0.5 * this.level)) * 1.5)
  }
}

/**
 * Fan: a steady, dark airflow with a faint pulse at the blade-pass rate and a
 * quiet motor hum. The speed wobbles very slightly, like a real motor, so the
 * hum never sounds like a test tone.
 */
export class Fan extends GeneratorBase {
  private readonly pink = new PinkNoise(this.rng)
  private readonly brown = new BrownNoise(this.rng)
  private readonly airLp = new OnePoleLP(this.sr, 1100)
  private readonly airHp = new OnePoleHP(this.sr, 40)
  private readonly whoosh = new BandPass(this.sr, 1300, 0.8)
  private readonly speed = new Drift(this.rng, this.sr, 0.2)
  private readonly bladeHz = this.rng.range(22, 30)
  private phase = 0
  private inc = 0
  private humPhase = 0

  protected control(n: number): void {
    const hz = this.bladeHz * (1 + 0.006 * (this.speed.step(n) - 0.5))
    this.inc = (2 * Math.PI * hz) / this.sr
  }

  protected sample(): number {
    this.phase += this.inc
    if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI
    // Motor hum sits an octave-and-a-bit above the blade pulse.
    this.humPhase += this.inc * 3
    if (this.humPhase > 2 * Math.PI) this.humPhase -= 2 * Math.PI
    const p = this.pink.next()
    const air = this.airHp.process(this.airLp.process(p) + this.brown.next() * 0.4)
    const pulse = 1 + 0.07 * Math.sin(this.phase)
    return (air * 1.1 + this.whoosh.process(p) * 0.25) * pulse + Math.sin(this.humPhase) * 0.012
  }
}

/**
 * Fireplace: a low flickering roar, a faint hiss of gas, and crackles that
 * come in clusters (a log catching), with the occasional louder, duller pop.
 * Crackle activity drifts so the fire flares and settles.
 */
export class Fire extends GeneratorBase {
  private readonly brown = new BrownNoise(this.rng)
  private readonly pink = new PinkNoise(this.rng)
  private readonly white = new WhiteNoise(this.rng)
  private readonly roarLp = new OnePoleLP(this.sr, 350)
  private readonly dcHp = new OnePoleHP(this.sr, 25)
  private readonly hiss = new BandPass(this.sr, 2800, 0.7)
  private readonly crackleHp = new OnePoleHP(this.sr, 1200)
  private readonly crackleLp = new OnePoleLP(this.sr, 4500)
  private readonly crackleLp2 = new OnePoleLP(this.sr, 7000)
  private readonly popBand = new BandPass(this.sr, 700, 1.5)
  private readonly crackles = new GrainPool(24)
  private readonly pops = new GrainPool(4)
  private readonly flicker = new Drift(this.rng, this.sr, 1.8)
  private readonly glow = new Drift(this.rng, this.sr, 0.12)
  private readonly activity = new Drift(this.rng, this.sr, 0.2)
  private roarLevel = 0.5
  private crackleRate = 4
  private nextCrackle = 0
  private nextPop = 0
  private burst = 0

  protected control(n: number): void {
    this.roarLevel = (0.55 + 0.45 * this.flicker.step(n)) * (0.8 + 0.4 * this.glow.step(n))
    const a = this.activity.step(n)
    this.crackleRate = 1.5 + 9 * a * a
  }

  protected sample(): number {
    if (--this.nextCrackle <= 0) {
      const u = this.rng.next()
      this.crackles.trigger(0.1 + 0.6 * u * u * u, this.ms(0.3), this.ms(this.rng.range(0.8, 6)))
      if (this.burst > 0) {
        // Inside a cluster: the next crackle follows within a few ms.
        this.burst--
        this.nextCrackle = this.ms(this.rng.range(4, 45))
      } else {
        if (this.rng.next() < 0.35) this.burst = 1 + Math.floor(this.rng.next() * 4)
        this.nextCrackle = this.rng.exp(this.crackleRate) * this.sr
      }
    }
    if (--this.nextPop <= 0) {
      this.pops.trigger(this.rng.range(0.3, 0.7), this.ms(1), this.ms(this.rng.range(10, 25)))
      this.nextPop = this.rng.exp(0.25) * this.sr
    }
    const w = this.white.next()
    const roar = this.roarLp.process(this.brown.next()) * this.roarLevel
    const hiss = this.hiss.process(this.pink.next()) * 0.18 * this.roarLevel
    const crackle = this.crackleLp2.process(this.crackleLp.process(this.crackleHp.process(w * this.crackles.next())))
    const pop = this.popBand.process(w * this.pops.next())
    return this.dcHp.process(roar * 1.2 + hiss + crackle * 0.9 + pop * 1.4)
  }
}

/**
 * Stream: a soft bed of running water, three narrow resonances that dart
 * around quickly (the babble), and small bubbles whose pitch rises as they
 * collapse.
 */
export class Stream extends GeneratorBase {
  private readonly pink = new PinkNoise(this.rng)
  private readonly bedHp = new OnePoleHP(this.sr, 200)
  private readonly bedLp = new OnePoleLP(this.sr, 2200)
  private readonly bands: BandPass[]
  private readonly pitches: Drift[]
  private readonly levels: Drift[]
  private readonly gains = new Float64Array(3)
  private readonly bubbles = new TonePool(10, this.sr)
  private readonly flow = new Drift(this.rng, this.sr, 0.05)
  private nextBubble = 0
  private flowLevel = 1

  private static readonly RANGES: readonly (readonly [number, number])[] = [
    [300, 800],
    [650, 1500],
    [1100, 2300],
  ]

  constructor(sampleRate: number, seed: number) {
    super(sampleRate, seed)
    this.bands = Stream.RANGES.map(([lo]) => new BandPass(this.sr, lo, 5))
    this.pitches = Stream.RANGES.map(() => new Drift(this.rng, this.sr, this.rng.range(3, 6)))
    this.levels = Stream.RANGES.map(() => new Drift(this.rng, this.sr, this.rng.range(1.5, 3)))
  }

  protected control(n: number): void {
    this.flowLevel = 0.85 + 0.3 * this.flow.step(n)
    for (let i = 0; i < 3; i++) {
      const [lo, hi] = Stream.RANGES[i]
      this.bands[i].set(lo + (hi - lo) * this.pitches[i].step(n))
      const l = this.levels[i].step(n)
      this.gains[i] = l * l
    }
  }

  protected sample(): number {
    if (--this.nextBubble <= 0) {
      this.bubbles.trigger(
        this.rng.range(0.015, 0.07),
        this.rng.range(450, 1400),
        this.rng.range(1.2, 1.6),
        this.ms(1.5),
        this.ms(this.rng.range(10, 35)),
      )
      this.nextBubble = this.rng.exp(9 * this.flowLevel) * this.sr
    }
    const p = this.pink.next()
    const bed = this.bedLp.process(this.bedHp.process(p))
    let babble = 0
    for (let i = 0; i < 3; i++) babble += this.bands[i].process(p) * this.gains[i]
    return (bed * 0.9 + babble * 2.4) * this.flowLevel + this.bubbles.next()
  }
}

