// Background playback and lock-screen controls.
//
// Browsers only treat a page as "playing media" (lock-screen and
// notification controls, carrying on in the background) when an HTML media
// element is playing. Web Audio alone doesn't count, and iOS suspends it in
// the background. So while the mix plays we also play a silent <audio>
// element, generated in code as a WAV (no file is downloaded), and wire the
// Media Session API's play / pause / stop to the player. Optionally a screen
// Wake Lock keeps the display on, the most reliable choice on iOS.
//
// Everything browser-facing is passed in, so the logic is testable.

import type { PlayerAction, PlayerState } from './state'
import { isPlaying, listNames } from './state'

export type MediaAction = 'play' | 'pause' | 'stop'

/** The parts of navigator.mediaSession we use. */
export interface MediaSessionLike {
  metadata: unknown
  playbackState: 'none' | 'paused' | 'playing'
  setActionHandler(action: MediaAction, handler: (() => void) | null): void
}

/** The parts of HTMLAudioElement we use for the silent keep-alive. */
export interface KeepAliveLike {
  paused: boolean
  play(): Promise<void>
  pause(): void
}

export interface WakeLockSentinelLike {
  released: boolean
  release(): Promise<void>
}

export interface BackgroundDeps {
  mediaSession: MediaSessionLike | null
  makeMetadata: (init: { title: string; artist: string; album: string }) => unknown
  keepAlive: KeepAliveLike | null
  requestWakeLock: (() => Promise<WakeLockSentinelLike>) | null
  dispatch: (action: PlayerAction) => Promise<void>
  /** Is the page visible? (Wake locks are dropped while hidden.) */
  visible: () => boolean
}

/** What the lock screen shows for this state. */
export function nowPlaying(state: PlayerState): {
  playbackState: MediaSessionLike['playbackState']
  title: string
} {
  if (state.active.length === 0) return { playbackState: 'none', title: 'Sleep Sounds' }
  const title = state.active.length > 3 ? `${state.active.length} sounds` : listNames(state.active)
  return { playbackState: isPlaying(state) ? 'playing' : 'paused', title }
}

export class BackgroundAudio {
  private readonly deps: BackgroundDeps
  private state: PlayerState | null = null
  private keepAwake: boolean
  private wakeLock: WakeLockSentinelLike | null = null
  private wakePending = false
  private lastTitle = ''

  constructor(deps: BackgroundDeps, keepAwake: boolean) {
    this.deps = deps
    this.keepAwake = keepAwake
    const session = deps.mediaSession
    if (session) {
      // Lock-screen / notification buttons. Play resumes the mix (or starts
      // the default sound); pause keeps the mix; stop clears it.
      const run = (action: PlayerAction) => () => void deps.dispatch(action).catch(() => {})
      session.setActionHandler('play', () => {
        if (!this.state || !isPlaying(this.state)) run({ type: 'playPause' })()
      })
      session.setActionHandler('pause', run({ type: 'pause' }))
      session.setActionHandler('stop', run({ type: 'stop' }))
    }
  }

  /** Call with every new player state. */
  update(state: PlayerState): void {
    this.state = state
    const playing = isPlaying(state)
    const { playbackState, title } = nowPlaying(state)
    const session = this.deps.mediaSession
    if (session) {
      session.playbackState = playbackState
      if (title !== this.lastTitle) {
        this.lastTitle = title
        session.metadata =
          playbackState === 'none' ? null : this.deps.makeMetadata({ title, artist: 'Sleep Sounds', album: 'Sleep Sounds' })
      }
    }
    const keep = this.deps.keepAlive
    if (keep) {
      if (playing && keep.paused) keep.play().catch(() => {})
      else if (!playing && !keep.paused) keep.pause()
    }
    this.syncWakeLock()
  }

  getKeepAwake(): boolean {
    return this.keepAwake
  }

  setKeepAwake(on: boolean): void {
    this.keepAwake = on
    this.syncWakeLock()
  }

  /** The page came back into view: wake locks are lost while hidden. */
  onVisible(): void {
    if (this.wakeLock?.released) this.wakeLock = null
    this.syncWakeLock()
  }

  /** The app is being closed or left: stop cleanly rather than mid-sound. */
  onPageHide(): void {
    if (this.state && isPlaying(this.state)) void this.deps.dispatch({ type: 'pause' }).catch(() => {})
    this.deps.keepAlive?.pause()
    this.releaseWakeLock()
  }

  get holdsWakeLock(): boolean {
    return !!this.wakeLock && !this.wakeLock.released
  }

  private syncWakeLock(): void {
    const want = this.keepAwake && !!this.state && isPlaying(this.state) && this.deps.visible()
    if (want) this.acquireWakeLock()
    else this.releaseWakeLock()
  }

  private acquireWakeLock(): void {
    const request = this.deps.requestWakeLock
    if (!request || this.wakePending || this.holdsWakeLock) return
    this.wakePending = true
    request()
      .then((lock) => {
        this.wakePending = false
        this.wakeLock = lock
        // Things may have changed while we waited.
        this.syncWakeLock()
      })
      .catch(() => {
        // Denied (low battery, not visible…): the sound plays on regardless.
        this.wakePending = false
      })
  }

  private releaseWakeLock(): void {
    const lock = this.wakeLock
    this.wakeLock = null
    if (lock && !lock.released) void lock.release().catch(() => {})
  }
}

/**
 * A silent WAV: 8-bit mono PCM (silence is 128). Long enough (by default
 * 10 s) that Chrome treats it as real media and shows its controls, small
 * enough to make in memory (about 40 KB at 4 kHz).
 */
export function silentWav(seconds = 10, sampleRate = 4000): Uint8Array {
  const samples = Math.max(1, Math.round(seconds * sampleRate))
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true) // byte rate
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44)
  return bytes
}

/**
 * iPhone, iPad and iPod, including iPadOS which reports itself as a Mac
 * (told apart by its touch screen).
 */
export function isIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

export const KEEP_AWAKE_KEY = 'sleepsounds:keepAwake'

/** Saved choice, else the default: on for iOS, where it matters most. */
export function keepAwakeDefault(saved: string | null, ios: boolean): boolean {
  if (saved === 'true') return true
  if (saved === 'false') return false
  return ios
}
