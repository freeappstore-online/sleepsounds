import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BEAT_HZ, MAX_BEAT_HZ, MIN_BEAT_HZ } from './binaural'
import { fadeGainAt } from './fade'
import {
  AudioEngine,
  DEFAULT_VOLUME,
  FADE_SECONDS,
  VOLUME_RAMP_SECONDS,
  FADE_RESET_SECONDS,
  rampParam,
  sourceOptions,
  volumeToGain,
} from './engine'

// A stand-in for the parts of Web Audio the engine touches. Each AudioParam
// records its automation calls so tests can check every change is a ramp.

type Call = [string, ...number[]]

class FakeParam {
  value = 1
  calls: Call[] = []
  withHold = true

  get cancelAndHoldAtTime() {
    return this.withHold ? (t: number) => this.calls.push(['hold', t]) : undefined
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancel', t])
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t])
  }
  setValueCurveAtTime(curve: Float32Array, start: number, duration: number) {
    this.calls.push(['curve', curve.length, start, duration, curve[0], curve[curve.length - 1]])
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['ramp', v, t])
    this.value = v
  }
  /** The target of the most recent ramp. */
  get target() {
    const ramps = this.calls.filter((c) => c[0] === 'ramp')
    return ramps.at(-1)
  }
}

class FakeNode {
  connections: unknown[] = []
  disconnected = false
  connect(to: unknown) {
    this.connections.push(to)
    return to
  }
  disconnect() {
    this.disconnected = true
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeSource extends FakeNode {
  messages: unknown[] = []
  options: AudioWorkletNodeOptions = {}
  port = { postMessage: (m: unknown) => this.messages.push(m) }
  readonly kind: string
  readonly seed: number
  constructor(kind: string, seed: number) {
    super()
    this.kind = kind
    this.seed = seed
  }
}

class FakeContext {
  currentTime = 10
  state: 'suspended' | 'running' = 'suspended'
  destination = new FakeNode()
  gains: FakeGain[] = []
  resumes = 0
  modules: string[] = []
  failNextModule = false
  audioWorklet = {
    addModule: (url: string) => {
      this.modules.push(url)
      if (this.failNextModule) {
        this.failNextModule = false
        return Promise.reject(new Error('load failed'))
      }
      return Promise.resolve()
    },
  }
  resume() {
    this.resumes++
    this.state = 'running'
    return Promise.resolve()
  }
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
}

function setup(opts: { worklet?: boolean; failFirstLoad?: boolean; now?: () => number } = {}) {
  const contexts: FakeContext[] = []
  const sources: FakeSource[] = []
  const engine = new AudioEngine({
    workletUrl: '/worklet.js',
    createContext: () => {
      const ctx = new FakeContext()
      ctx.failNextModule = !!opts.failFirstLoad
      contexts.push(ctx)
      return ctx as unknown as AudioContext
    },
    // Without createSource the engine loads the worklet module itself.
    createSource: opts.worklet
      ? undefined
      : (_ctx, options) => {
          const { kind, seed } = options.processorOptions as { kind: string; seed: number }
          const s = new FakeSource(kind, seed)
          s.options = options
          sources.push(s)
          return s as unknown as AudioNode
        },
    seed: () => 99,
    now: opts.now,
  })
  const ctx = () => contexts[0]
  const master = () => ctx().gains[0]
  const fade = () => ctx().gains[1]
  const gainOf = (source: FakeSource) => source.connections[0] as FakeGain
  return { engine, contexts, sources, ctx, master, fade, gainOf }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('volumeToGain', () => {
  it('maps the slider on a squared curve and clamps', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(0.5)).toBe(0.25)
    expect(volumeToGain(1)).toBe(1)
    expect(volumeToGain(2)).toBe(1)
    expect(volumeToGain(-1)).toBe(0)
    expect(volumeToGain(Number.NaN)).toBe(0)
  })
})

describe('rampParam', () => {
  it('holds the current value then ramps linearly', () => {
    const p = new FakeParam()
    rampParam(p as unknown as AudioParam, 0.5, 3, 2)
    expect(p.calls).toEqual([
      ['hold', 3],
      ['ramp', 0.5, 5],
    ])
  })

  it('falls back to pinning the current value without cancelAndHoldAtTime', () => {
    const p = new FakeParam()
    p.withHold = false
    p.value = 0.3
    rampParam(p as unknown as AudioParam, 0, 3, 1)
    expect(p.calls).toEqual([
      ['cancel', 3],
      ['set', 0.3, 3],
      ['ramp', 0, 4],
    ])
  })
})

describe('AudioEngine', () => {
  it('creates no AudioContext until unlocked by a gesture', async () => {
    const { engine, contexts, ctx } = setup()
    expect(contexts).toHaveLength(0)
    await engine.unlock()
    await engine.unlock()
    expect(contexts).toHaveLength(1)
    expect(ctx().resumes).toBe(1)
    expect(ctx().state).toBe('running')
  })

  it('wires master volume through the timer fade to the speakers', async () => {
    const { engine, ctx, master, fade } = setup()
    await engine.unlock()
    expect(master().connections).toEqual([fade()])
    expect(fade().connections).toEqual([ctx().destination])
    expect(master().gain.value).toBe(1)
    expect(fade().gain.value).toBe(1)
  })

  it('loads the worklet module once', async () => {
    const { engine, ctx } = setup({ worklet: true })
    await engine.unlock()
    await engine.unlock()
    expect(ctx().modules).toEqual(['/worklet.js'])
  })

  it('retries loading the worklet after a failed load', async () => {
    const { engine, ctx } = setup({ worklet: true, failFirstLoad: true })
    await expect(engine.unlock()).rejects.toThrow('load failed')
    await engine.unlock()
    expect(ctx().modules).toHaveLength(2)
  })

  it('fades a sound in from silence', async () => {
    const { engine, sources, master, gainOf } = setup()
    await engine.play('pink')
    expect(sources).toHaveLength(1)
    expect(sources[0].kind).toBe('pink')
    expect(sources[0].seed).toBe(99)
    const g = gainOf(sources[0])
    expect(g.connections).toEqual([master()])
    // The node starts at 0 and only reaches its volume through a ramp.
    expect(g.gain.calls[0]).toEqual(['hold', 10])
    expect(g.gain.target).toEqual(['ramp', volumeToGain(DEFAULT_VOLUME), 10 + FADE_SECONDS])
    expect(engine.isPlaying('pink')).toBe(true)
    expect(engine.playing()).toEqual(['pink'])
  })

  it('does not start a second copy of a playing sound', async () => {
    const { engine, sources } = setup()
    await engine.play('white')
    await engine.play('white')
    expect(sources).toHaveLength(1)
  })

  it('plays several sounds at once, each with its own gain', async () => {
    const { engine, sources, gainOf } = setup()
    await engine.play('white')
    await engine.play('brown')
    expect(sources.map((s) => s.kind)).toEqual(['white', 'brown'])
    expect(gainOf(sources[0])).not.toBe(gainOf(sources[1]))
  })

  it('fades a sound out before freeing it', async () => {
    const { engine, sources, gainOf, ctx } = setup()
    await engine.play('brown')
    ctx().currentTime = 20
    engine.stop('brown')
    const g = gainOf(sources[0])
    expect(g.gain.target).toEqual(['ramp', 0, 20 + FADE_SECONDS])
    expect(engine.isPlaying('brown')).toBe(false)
    // Still connected while the fade runs...
    vi.advanceTimersByTime(FADE_SECONDS * 1000)
    expect(sources[0].disconnected).toBe(false)
    // ...then disconnected and told to stop processing.
    vi.advanceTimersByTime(200)
    expect(sources[0].disconnected).toBe(true)
    expect(g.disconnected).toBe(true)
    expect(sources[0].messages).toEqual(['stop'])
    expect(engine.playing()).toEqual([])
  })

  it('fades back in if played again while fading out', async () => {
    const { engine, sources, gainOf, ctx } = setup()
    await engine.play('pink')
    engine.stop('pink')
    ctx().currentTime = 11
    await engine.play('pink')
    vi.advanceTimersByTime(10_000)
    expect(sources).toHaveLength(1)
    expect(sources[0].disconnected).toBe(false)
    expect(gainOf(sources[0]).gain.target).toEqual(['ramp', volumeToGain(DEFAULT_VOLUME), 11 + FADE_SECONDS])
    expect(engine.isPlaying('pink')).toBe(true)
  })

  it('ignores stopping a sound that is not playing', () => {
    const { engine } = setup()
    expect(() => engine.stop('white')).not.toThrow()
  })

  it('toggles a sound on and off', async () => {
    const { engine } = setup()
    await engine.toggle('white')
    expect(engine.isPlaying('white')).toBe(true)
    await engine.toggle('white')
    expect(engine.isPlaying('white')).toBe(false)
  })

  it('stops everything', async () => {
    const { engine } = setup()
    await engine.play('white')
    await engine.play('pink')
    engine.stopAll()
    expect(engine.playing()).toEqual([])
  })

  it('ramps per-sound volume changes', async () => {
    const { engine, sources, gainOf, ctx } = setup()
    await engine.play('white')
    ctx().currentTime = 30
    engine.setVolume('white', 0.5)
    expect(gainOf(sources[0]).gain.target).toEqual(['ramp', 0.25, 30 + VOLUME_RAMP_SECONDS])
    expect(engine.getVolume('white')).toBe(0.5)
  })

  it('remembers a volume set while stopped and fades in to it', async () => {
    const { engine, sources, gainOf } = setup()
    engine.setVolume('brown', 0.4)
    await engine.play('brown')
    expect(gainOf(sources[0]).gain.target?.[1]).toBeCloseTo(0.16)
  })

  it('keeps a stopping sound fading out when its volume changes', async () => {
    const { engine, sources, gainOf } = setup()
    await engine.play('white')
    engine.stop('white')
    engine.setVolume('white', 1)
    expect(gainOf(sources[0]).gain.target?.[1]).toBe(0)
  })

  it('clamps volumes to 0–1', () => {
    const { engine } = setup()
    engine.setVolume('pink', 3)
    expect(engine.getVolume('pink')).toBe(1)
    engine.setVolume('pink', Number.NaN)
    expect(engine.getVolume('pink')).toBe(0)
    engine.setMasterVolume(-2)
    expect(engine.getMasterVolume()).toBe(0)
  })

  it('ramps master volume, and applies one set before unlocking', async () => {
    const { engine, master, ctx } = setup()
    engine.setMasterVolume(0.5)
    await engine.unlock()
    expect(master().gain.value).toBe(0.25)
    ctx().currentTime = 40
    engine.setMasterVolume(0.8)
    expect(master().gain.target?.[0]).toBe('ramp')
    expect(master().gain.target?.[1]).toBeCloseTo(0.64)
    expect(master().gain.target?.[2]).toBe(40 + VOLUME_RAMP_SECONDS)
  })
})

describe('sourceOptions', () => {
  it('builds mono nodes for noise and textures', () => {
    expect(sourceOptions('rain', 5, 6)).toEqual({
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { kind: 'rain', seed: 5 },
    })
  })

  it('builds a stereo node for binaural beats, carrying the beat', () => {
    expect(sourceOptions('binaural', 5, 8)).toEqual({
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { kind: 'binaural', seed: 5, beatHz: 8 },
    })
  })
})

describe('AudioEngine binaural beats', () => {
  it('starts at the default beat, in stereo, with the usual fade-in', async () => {
    const { engine, sources, gainOf } = setup()
    expect(engine.getBeat()).toBe(DEFAULT_BEAT_HZ)
    await engine.play('binaural')
    expect(sources[0].options.outputChannelCount).toEqual([2])
    expect(sources[0].options.processorOptions).toMatchObject({ beatHz: DEFAULT_BEAT_HZ })
    expect(gainOf(sources[0]).gain.target).toEqual(['ramp', volumeToGain(DEFAULT_VOLUME), 10 + FADE_SECONDS])
  })

  it('uses a beat chosen before playing', async () => {
    const { engine, sources } = setup()
    engine.setBeat(10)
    await engine.play('binaural')
    expect(sources[0].options.processorOptions).toMatchObject({ beatHz: 10 })
    expect(sources[0].messages).toEqual([])
  })

  it('sends beat changes to the playing tones', async () => {
    const { engine, sources } = setup()
    await engine.play('binaural')
    engine.setBeat(4.5)
    expect(sources[0].messages).toEqual([{ type: 'beat', hz: 4.5 }])
  })

  it('clamps the beat to its range', () => {
    const { engine } = setup()
    engine.setBeat(500)
    expect(engine.getBeat()).toBe(MAX_BEAT_HZ)
    engine.setBeat(0)
    expect(engine.getBeat()).toBe(MIN_BEAT_HZ)
    engine.setBeat(Number.NaN)
    expect(engine.getBeat()).toBe(DEFAULT_BEAT_HZ)
  })

  it('does not message other sounds about the beat', async () => {
    const { engine, sources } = setup()
    await engine.play('rain')
    engine.setBeat(12)
    expect(sources[0].messages).toEqual([])
  })
})

describe('AudioEngine sleep-timer fade', () => {
  const T0 = 1_000_000
  // Audio clock is at 10 s in the fake context.

  it('glides to full, then lays the fade curve to end exactly on time', async () => {
    const { engine, fade } = setup({ now: () => T0 })
    await engine.unlock()
    engine.setFadeOut({ startsAt: T0 + 60_000, endsAt: T0 + 120_000 })
    const calls = fade().gain.calls
    expect(calls[0]).toEqual(['hold', 10])
    expect(calls[1]).toEqual(['ramp', 1, 10 + FADE_RESET_SECONDS])
    const [kind, points, start, duration, first, last] = calls[2]
    expect(kind).toBe('curve')
    expect(start).toBeCloseTo(70, 6)
    expect(start + (duration as number)).toBeCloseTo(130, 6)
    expect(points).toBe(600)
    expect(first).toBe(1)
    expect(last).toBe(0)
  })

  it('joins a fade already under way at the right point', async () => {
    const { engine, fade } = setup({ now: () => T0 + 30_000 })
    await engine.unlock()
    engine.setFadeOut({ startsAt: T0, endsAt: T0 + 60_000 })
    const [, rampTo] = fade().gain.calls[1]
    expect(rampTo).toBeCloseTo(fadeGainAt(31 / 60), 6)
    const [, , start, duration, first] = fade().gain.calls[2]
    expect(start).toBeCloseTo(11.01, 6)
    expect((start as number) + (duration as number)).toBeCloseTo(40, 6)
    expect(first).toBeCloseTo(fadeGainAt(31.01 / 60), 4)
  })

  it('goes quiet within a second if the end has already passed', async () => {
    const { engine, fade } = setup({ now: () => T0 + 5000 })
    await engine.unlock()
    engine.setFadeOut({ startsAt: T0 - 60_000, endsAt: T0 })
    expect(fade().gain.calls.at(-1)).toEqual(['ramp', 0, 10 + FADE_RESET_SECONDS])
  })

  it('applies a fade set before audio was unlocked', async () => {
    const { engine, fade } = setup({ now: () => T0 })
    engine.setFadeOut({ startsAt: T0 + 60_000, endsAt: T0 + 120_000 })
    expect(engine.getFadeOut()).not.toBeNull()
    await engine.unlock()
    expect(fade().gain.calls.some((c) => c[0] === 'curve')).toBe(true)
  })

  it('brings the sound back up smoothly when cancelled', async () => {
    const { engine, fade } = setup({ now: () => T0 })
    await engine.unlock()
    engine.setFadeOut({ startsAt: T0, endsAt: T0 + 60_000 })
    engine.setFadeOut(null)
    expect(fade().gain.target).toEqual(['ramp', 1, 10 + FADE_RESET_SECONDS])
    expect(engine.getFadeOut()).toBeNull()
  })

  it('leaves master volume to the user during a fade', async () => {
    const { engine, master, fade } = setup({ now: () => T0 })
    await engine.unlock()
    engine.setFadeOut({ startsAt: T0, endsAt: T0 + 60_000 })
    const fadeCalls = fade().gain.calls.length
    engine.setMasterVolume(0.5)
    expect(master().gain.target?.[1]).toBeCloseTo(0.25)
    expect(fade().gain.calls).toHaveLength(fadeCalls)
  })
})
