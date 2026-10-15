import { describe, expect, it } from 'vitest'
import { DEFAULT_BEAT_HZ, MAX_BEAT_HZ } from '../audio/binaural'
import { DEFAULT_VOLUME } from '../audio/engine'
import { SOUND_KINDS, type SoundKind } from '../audio/generators'
import { SOUNDS, soundName } from './sounds'
import {
  DEFAULT_MASTER,
  DEFAULT_SOUND,
  type EngineLike,
  type PlayerAction,
  type PlayerState,
  audible,
  initialState,
  isPlaying,
  listNames,
  parse,
  reduce,
  serialize,
  statusText,
  sync,
} from './state'

const run = (...actions: PlayerAction[]) => actions.reduce(reduce, initialState())

describe('sound catalogue', () => {
  it('lists every sound exactly once, with a name', () => {
    expect(SOUNDS.map((s) => s.kind).sort()).toEqual([...SOUND_KINDS].sort())
    for (const s of SOUNDS) expect(s.name.length).toBeGreaterThan(0)
  })

  it('flags binaural beats as needing headphones', () => {
    expect(SOUNDS.find((s) => s.kind === 'binaural')?.note).toBe('Headphones')
  })
})

describe('reduce', () => {
  it('starts empty and paused, at default levels', () => {
    const s = initialState()
    expect(s.active).toEqual([])
    expect(s.paused).toBe(true)
    expect(s.master).toBe(DEFAULT_MASTER)
    expect(s.beat).toBe(DEFAULT_BEAT_HZ)
    for (const kind of SOUND_KINDS) expect(s.volumes[kind]).toBe(DEFAULT_VOLUME)
  })

  it('plays a sound when it is tapped, and adds more to the mix', () => {
    const s = run({ type: 'toggle', kind: 'rain' }, { type: 'toggle', kind: 'fan' })
    expect(s.active).toEqual(['rain', 'fan'])
    expect(isPlaying(s)).toBe(true)
  })

  it('removes a sound when tapped again, pausing once the mix is empty', () => {
    const s = run({ type: 'toggle', kind: 'rain' }, { type: 'toggle', kind: 'fan' }, { type: 'toggle', kind: 'rain' })
    expect(s.active).toEqual(['fan'])
    expect(s.paused).toBe(false)
    const empty = reduce(s, { type: 'toggle', kind: 'fan' })
    expect(empty.active).toEqual([])
    expect(empty.paused).toBe(true)
  })

  it('pauses and resumes the whole mix, keeping its sounds', () => {
    const playing = run({ type: 'toggle', kind: 'rain' }, { type: 'toggle', kind: 'brown' })
    const paused = reduce(playing, { type: 'playPause' })
    expect(paused.active).toEqual(['rain', 'brown'])
    expect(audible(paused)).toEqual([])
    expect(audible(reduce(paused, { type: 'playPause' }))).toEqual(['rain', 'brown'])
  })

  it('plays the default sound when play is pressed with nothing chosen', () => {
    const s = run({ type: 'playPause' })
    expect(s.active).toEqual([DEFAULT_SOUND])
    expect(isPlaying(s)).toBe(true)
  })

  it('adding a sound to a paused mix resumes it', () => {
    const s = run({ type: 'toggle', kind: 'rain' }, { type: 'playPause' }, { type: 'toggle', kind: 'wind' })
    expect(audible(s)).toEqual(['rain', 'wind'])
  })

  it('stop clears the mix but keeps the levels', () => {
    const s = run({ type: 'toggle', kind: 'rain' }, { type: 'volume', kind: 'rain', value: 0.3 }, { type: 'stop' })
    expect(s.active).toEqual([])
    expect(s.paused).toBe(true)
    expect(s.volumes.rain).toBe(0.3)
  })

  it('clamps volumes and the beat', () => {
    const s = run(
      { type: 'volume', kind: 'fire', value: 4 },
      { type: 'master', value: -1 },
      { type: 'beat', hz: 500 },
    )
    expect(s.volumes.fire).toBe(1)
    expect(s.master).toBe(0)
    expect(s.beat).toBe(MAX_BEAT_HZ)
    expect(run({ type: 'volume', kind: 'fire', value: Number.NaN }).volumes.fire).toBe(0)
  })

  it('never mutates the previous state', () => {
    const before = initialState()
    const snapshot = JSON.stringify(before)
    reduce(before, { type: 'toggle', kind: 'rain' })
    reduce(before, { type: 'volume', kind: 'rain', value: 0.1 })
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('status text', () => {
  it('describes the mix in plain words', () => {
    expect(listNames([])).toBe('')
    expect(listNames(['rain'])).toBe('Rain')
    expect(listNames(['rain', 'fan'])).toBe('Rain and Fan')
    expect(listNames(['rain', 'fan', 'pink'])).toBe('Rain, Fan and Pink noise')
    expect(statusText(initialState())).toBe('Tap a sound to begin')
    const playing = run({ type: 'toggle', kind: 'waves' })
    expect(statusText(playing)).toBe('Playing: Ocean')
    expect(statusText(reduce(playing, { type: 'playPause' }))).toBe('Paused: Ocean')
    expect(soundName('waves')).toBe('Ocean')
    const many = run(...(['rain', 'fan', 'fire', 'wind'] as const).map((kind) => ({ type: 'toggle' as const, kind })))
    expect(statusText(many)).toBe('Playing: 4 sounds')
  })
})

// A stand-in engine that records what it was told.
class FakeEngine implements EngineLike {
  playing = new Set<SoundKind>()
  volumes = new Map<SoundKind, number>()
  master = 1
  beat = DEFAULT_BEAT_HZ
  log: string[] = []
  failPlay = false

  isPlaying(kind: SoundKind) {
    return this.playing.has(kind)
  }
  play(kind: SoundKind) {
    this.log.push(`play ${kind}`)
    if (this.failPlay) return Promise.reject(new Error('no audio'))
    this.playing.add(kind)
    return Promise.resolve()
  }
  stop(kind: SoundKind) {
    this.log.push(`stop ${kind}`)
    this.playing.delete(kind)
  }
  getVolume(kind: SoundKind) {
    return this.volumes.get(kind) ?? DEFAULT_VOLUME
  }
  setVolume(kind: SoundKind, v: number) {
    this.log.push(`volume ${kind} ${v}`)
    this.volumes.set(kind, v)
  }
  getMasterVolume() {
    return this.master
  }
  setMasterVolume(v: number) {
    this.log.push(`master ${v}`)
    this.master = v
  }
  getBeat() {
    return this.beat
  }
  setBeat(hz: number) {
    this.log.push(`beat ${hz}`)
    this.beat = hz
  }
}

describe('sync', () => {
  it('starts and stops sounds to match the mix', async () => {
    const engine = new FakeEngine()
    let s = run({ type: 'toggle', kind: 'rain' }, { type: 'toggle', kind: 'fire' })
    await sync(engine, s)
    expect([...engine.playing].sort()).toEqual(['fire', 'rain'])
    s = reduce(s, { type: 'toggle', kind: 'rain' })
    await sync(engine, s)
    expect([...engine.playing]).toEqual(['fire'])
    s = reduce(s, { type: 'playPause' })
    await sync(engine, s)
    expect([...engine.playing]).toEqual([])
  })

  it('sets levels before starting a sound, so it fades in to the right volume', async () => {
    const engine = new FakeEngine()
    const s = run({ type: 'volume', kind: 'rain', value: 0.4 }, { type: 'toggle', kind: 'rain' })
    await sync(engine, s)
    expect(engine.log.indexOf('volume rain 0.4')).toBeLessThan(engine.log.indexOf('play rain'))
  })

  it('only sends what changed', async () => {
    const engine = new FakeEngine()
    let s = run({ type: 'toggle', kind: 'rain' })
    await sync(engine, s)
    engine.log = []
    s = reduce(s, { type: 'volume', kind: 'rain', value: 0.5 })
    await sync(engine, s)
    expect(engine.log).toEqual(['volume rain 0.5'])
    engine.log = []
    await sync(engine, s)
    expect(engine.log).toEqual([])
  })

  it('mutes without losing the master level, and the slider unmutes', async () => {
    const engine = new FakeEngine()
    let s = run({ type: 'master', value: 0.5 }, { type: 'mute' })
    await sync(engine, s)
    expect(engine.master).toBe(0)
    expect(s.master).toBe(0.5)
    s = reduce(s, { type: 'mute' })
    await sync(engine, s)
    expect(engine.master).toBe(0.5)
    s = reduce(reduce(s, { type: 'mute' }), { type: 'master', value: 0.7 })
    expect(s.muted).toBe(false)
  })

  it('does not save the muted state', () => {
    expect(parse(serialize(run({ type: 'mute' }))).muted).toBe(false)
  })

  it('passes master volume and beat through', async () => {
    const engine = new FakeEngine()
    await sync(engine, run({ type: 'master', value: 0.5 }, { type: 'beat', hz: 10 }))
    expect(engine.master).toBe(0.5)
    expect(engine.beat).toBe(10)
  })

  it('reports when audio cannot start', async () => {
    const engine = new FakeEngine()
    engine.failPlay = true
    await expect(sync(engine, run({ type: 'toggle', kind: 'rain' }))).rejects.toThrow('no audio')
  })
})

describe('saving between visits', () => {
  it('round-trips the mix and levels, restored paused', () => {
    const s: PlayerState = run(
      { type: 'toggle', kind: 'rain' },
      { type: 'toggle', kind: 'binaural' },
      { type: 'volume', kind: 'rain', value: 0.25 },
      { type: 'master', value: 0.6 },
      { type: 'beat', hz: 8 },
    )
    const back = parse(serialize(s))
    expect(back.active).toEqual(['rain', 'binaural'])
    expect(back.paused).toBe(true)
    expect(back.volumes.rain).toBe(0.25)
    expect(back.master).toBe(0.6)
    expect(back.beat).toBe(8)
  })

  it('falls back to defaults for missing or broken data', () => {
    expect(parse(null)).toEqual(initialState())
    expect(parse('not json')).toEqual(initialState())
    expect(parse('42')).toEqual(initialState())
    const odd = parse(
      JSON.stringify({ active: ['rain', 'rain', 'kazoo', 3], volumes: { rain: 9, fan: 'loud' }, master: 'x', beat: 99 }),
    )
    expect(odd.active).toEqual(['rain'])
    expect(odd.volumes.rain).toBe(1)
    expect(odd.volumes.fan).toBe(DEFAULT_VOLUME)
    expect(odd.master).toBe(DEFAULT_MASTER)
    expect(odd.beat).toBe(MAX_BEAT_HZ)
  })
})
