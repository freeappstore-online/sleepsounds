import { describe, expect, it } from 'vitest'
import {
  BackgroundAudio,
  type BackgroundDeps,
  type MediaAction,
  type WakeLockSentinelLike,
  isIOS,
  keepAwakeDefault,
  nowPlaying,
  silentWav,
} from './background'
import { type PlayerAction, initialState, reduce } from './state'

const mix = (...actions: PlayerAction[]) => actions.reduce(reduce, initialState())
const playing = mix({ type: 'toggle', kind: 'rain' }, { type: 'toggle', kind: 'fan' })
const paused = reduce(playing, { type: 'playPause' })
const flush = () => new Promise((r) => setTimeout(r, 0))

function fakes(opts: { wakeLock?: boolean; mediaSession?: boolean; visible?: boolean } = {}) {
  const handlers = new Map<MediaAction, (() => void) | null>()
  const session = {
    metadata: null as unknown,
    playbackState: 'none' as 'none' | 'paused' | 'playing',
    setActionHandler: (a: MediaAction, h: (() => void) | null) => void handlers.set(a, h),
  }
  const keepAlive = {
    paused: true,
    plays: 0,
    async play() {
      this.paused = false
      this.plays++
    },
    pause() {
      this.paused = true
    },
  }
  const locks: WakeLockSentinelLike[] = []
  const dispatched: PlayerAction[] = []
  let visible = opts.visible ?? true
  const deps: BackgroundDeps = {
    mediaSession: opts.mediaSession === false ? null : session,
    makeMetadata: (init) => ({ ...init }),
    keepAlive,
    requestWakeLock:
      opts.wakeLock === false
        ? null
        : async () => {
            const lock = {
              released: false,
              async release() {
                lock.released = true
              },
            }
            locks.push(lock)
            return lock
          },
    dispatch: async (a) => void dispatched.push(a),
    visible: () => visible,
  }
  return {
    deps,
    session,
    handlers,
    keepAlive,
    locks,
    dispatched,
    setVisible: (v: boolean) => {
      visible = v
    },
    held: () => locks.filter((l) => !l.released).length,
  }
}

describe('nowPlaying', () => {
  it('names the mix and its state for the lock screen', () => {
    expect(nowPlaying(initialState())).toEqual({ playbackState: 'none', title: 'Sleep Sounds' })
    expect(nowPlaying(playing)).toEqual({ playbackState: 'playing', title: 'Rain and Fan' })
    expect(nowPlaying(paused).playbackState).toBe('paused')
    const many = mix(...(['rain', 'fan', 'fire', 'wind'] as const).map((kind) => ({ type: 'toggle' as const, kind })))
    expect(nowPlaying(many).title).toBe('4 sounds')
  })
})

describe('lock-screen controls', () => {
  it('registers play, pause and stop', () => {
    const f = fakes()
    new BackgroundAudio(f.deps, false)
    expect([...f.handlers.keys()].sort()).toEqual(['pause', 'play', 'stop'])
  })

  it('pause pauses the mix, stop clears it, play resumes it', async () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, false)
    bg.update(playing)
    f.handlers.get('pause')!()
    f.handlers.get('stop')!()
    bg.update(paused)
    f.handlers.get('play')!()
    await flush()
    expect(f.dispatched).toEqual([{ type: 'pause' }, { type: 'stop' }, { type: 'playPause' }])
  })

  it('play does nothing if already playing (no accidental pause)', () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, false)
    bg.update(playing)
    f.handlers.get('play')!()
    expect(f.dispatched).toEqual([])
  })

  it('shows what is playing and whether it is paused', () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, false)
    bg.update(playing)
    expect(f.session.playbackState).toBe('playing')
    expect(f.session.metadata).toEqual({ title: 'Rain and Fan', artist: 'Sleep Sounds', album: 'Sleep Sounds' })
    bg.update(paused)
    expect(f.session.playbackState).toBe('paused')
    bg.update(initialState())
    expect(f.session.playbackState).toBe('none')
    expect(f.session.metadata).toBeNull()
  })

  it('copes without the Media Session API', () => {
    const f = fakes({ mediaSession: false })
    const bg = new BackgroundAudio(f.deps, false)
    expect(() => bg.update(playing)).not.toThrow()
    expect(f.keepAlive.paused).toBe(false)
  })
})

describe('background keep-alive', () => {
  it('plays the silent element only while the mix plays', () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, false)
    bg.update(playing)
    expect(f.keepAlive.paused).toBe(false)
    bg.update(playing)
    expect(f.keepAlive.plays).toBe(1)
    bg.update(paused)
    expect(f.keepAlive.paused).toBe(true)
  })

  it('stops cleanly when the app is closed', () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, true)
    bg.update(playing)
    bg.onPageHide()
    expect(f.dispatched).toEqual([{ type: 'pause' }])
    expect(f.keepAlive.paused).toBe(true)
  })

  it('does nothing extra on close when already paused', () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, false)
    bg.update(paused)
    bg.onPageHide()
    expect(f.dispatched).toEqual([])
  })
})

describe('keep screen on', () => {
  it('holds a wake lock only while playing, when switched on', async () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, true)
    bg.update(paused)
    await flush()
    expect(f.held()).toBe(0)
    bg.update(playing)
    await flush()
    expect(f.held()).toBe(1)
    expect(bg.holdsWakeLock).toBe(true)
    bg.update(paused)
    await flush()
    expect(f.held()).toBe(0)
  })

  it('follows the setting', async () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, false)
    bg.update(playing)
    await flush()
    expect(f.held()).toBe(0)
    bg.setKeepAwake(true)
    await flush()
    expect(f.held()).toBe(1)
    bg.setKeepAwake(false)
    await flush()
    expect(f.held()).toBe(0)
  })

  it('asks only once at a time', async () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, true)
    bg.update(playing)
    bg.update(playing)
    bg.update(playing)
    await flush()
    expect(f.locks).toHaveLength(1)
  })

  it('takes the lock again when the page comes back into view', async () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, true)
    bg.update(playing)
    await flush()
    // The browser drops wake locks when the page is hidden.
    f.locks[0].released = true
    f.setVisible(true)
    bg.onVisible()
    await flush()
    expect(f.held()).toBe(1)
    expect(f.locks).toHaveLength(2)
  })

  it('does not ask while hidden', async () => {
    const f = fakes({ visible: false })
    const bg = new BackgroundAudio(f.deps, true)
    bg.update(playing)
    await flush()
    expect(f.locks).toHaveLength(0)
  })

  it('carries on without Wake Lock support, or if refused', async () => {
    const f = fakes({ wakeLock: false })
    const bg = new BackgroundAudio(f.deps, true)
    bg.update(playing)
    await flush()
    expect(bg.holdsWakeLock).toBe(false)

    const g = fakes()
    g.deps.requestWakeLock = () => Promise.reject(new Error('NotAllowedError'))
    const bg2 = new BackgroundAudio(g.deps, true)
    bg2.update(playing)
    await flush()
    expect(bg2.holdsWakeLock).toBe(false)
  })

  it('lets go on close', async () => {
    const f = fakes()
    const bg = new BackgroundAudio(f.deps, true)
    bg.update(playing)
    await flush()
    bg.onPageHide()
    await flush()
    expect(f.held()).toBe(0)
  })

  it('defaults on for iOS only, then follows the saved choice', () => {
    expect(keepAwakeDefault(null, true)).toBe(true)
    expect(keepAwakeDefault(null, false)).toBe(false)
    expect(keepAwakeDefault('false', true)).toBe(false)
    expect(keepAwakeDefault('true', false)).toBe(true)
  })
})

describe('silentWav', () => {
  const wav = silentWav(10, 4000)
  const text = (from: number, len: number) => String.fromCharCode(...wav.slice(from, from + len))
  const view = new DataView(wav.buffer)

  it('is a valid 8-bit mono PCM WAV of the right length', () => {
    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 4)).toBe('WAVE')
    expect(text(12, 4)).toBe('fmt ')
    expect(text(36, 4)).toBe('data')
    expect(view.getUint32(4, true)).toBe(wav.length - 8)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(4000)
    expect(view.getUint16(34, true)).toBe(8)
    expect(view.getUint32(40, true)).toBe(40_000)
    // Over 5 s, so Chrome counts it as media with controls.
    expect(view.getUint32(40, true) / view.getUint32(24, true)).toBeGreaterThan(5)
  })

  it('is completely silent', () => {
    expect(wav.slice(44).every((b) => b === 128)).toBe(true)
  })
})

describe('isIOS', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5, true],
    ['Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari', 0, false],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5, false],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0, false],
  ])('%s (touch %i) → %s', (ua, touch, expected) => {
    expect(isIOS(ua, touch)).toBe(expected)
  })
})

