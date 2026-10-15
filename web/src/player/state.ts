// What the player is doing, kept apart from React and Web Audio so it can be
// tested. The UI dispatches actions; `sync` then makes the engine match the
// new state. Sync runs inside the tap handler, because browsers (iOS above
// all) only let audio start from a user gesture.

import { DEFAULT_BEAT_HZ, clampBeat } from '../audio/binaural'
import { DEFAULT_VOLUME, type AudioEngine } from '../audio/engine'
import { SOUND_KINDS, isSoundKind, type SoundKind } from '../audio/generators'
import { soundName } from './sounds'

export interface PlayerState {
  /** Sounds in the mix, in the order they were added. */
  active: SoundKind[]
  /** A paused mix keeps its sounds; it just isn't playing them. */
  paused: boolean
  /** Per-sound volume, 0–1. */
  volumes: Record<SoundKind, number>
  /** Overall volume, 0–1. */
  master: number
  /** Silences everything without losing the master level. Not saved. */
  muted: boolean
  /** Binaural beat frequency in Hz. */
  beat: number
}

export type PlayerAction =
  | { type: 'toggle'; kind: SoundKind }
  | { type: 'playPause' }
  /** Pause if playing (the sleep timer uses this; it never resumes). */
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'volume'; kind: SoundKind; value: number }
  | { type: 'master'; value: number }
  | { type: 'mute' }
  | { type: 'beat'; hz: number }
  /** Load a saved mix: exactly these sounds at these volumes, playing. */
  | { type: 'load'; sounds: readonly { kind: SoundKind; volume: number }[]; beat?: number }

/** What the big button plays when the mix is empty. */
export const DEFAULT_SOUND: SoundKind = 'rain'
export const DEFAULT_MASTER = 0.8

export function initialState(): PlayerState {
  return {
    active: [],
    paused: true,
    volumes: Object.fromEntries(SOUND_KINDS.map((k) => [k, DEFAULT_VOLUME])) as Record<SoundKind, number>,
    master: DEFAULT_MASTER,
    muted: false,
    beat: DEFAULT_BEAT_HZ,
  }
}

const unit = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

export function reduce(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'toggle': {
      if (state.active.includes(action.kind)) {
        const active = state.active.filter((k) => k !== action.kind)
        return { ...state, active, paused: active.length === 0 ? true : state.paused }
      }
      // Turning a sound on plays it, resuming the rest of a paused mix too.
      return { ...state, active: [...state.active, action.kind], paused: false }
    }
    case 'playPause':
      if (state.active.length === 0) return { ...state, active: [DEFAULT_SOUND], paused: false }
      return { ...state, paused: !state.paused }
    case 'pause':
      return state.paused ? state : { ...state, paused: true }
    case 'stop':
      return { ...state, active: [], paused: true }
    case 'volume':
      return { ...state, volumes: { ...state.volumes, [action.kind]: unit(action.value) } }
    case 'master':
      // Moving the slider is a clear sign you want to hear it again.
      return { ...state, master: unit(action.value), muted: false }
    case 'mute':
      return { ...state, muted: !state.muted }
    case 'beat':
      return { ...state, beat: clampBeat(action.hz) }
    case 'load': {
      const volumes = { ...state.volumes }
      for (const s of action.sounds) volumes[s.kind] = unit(s.volume)
      const active = [...new Set(action.sounds.map((s) => s.kind))]
      return {
        ...state,
        active,
        volumes,
        beat: action.beat === undefined ? state.beat : clampBeat(action.beat),
        paused: active.length === 0,
        muted: false,
      }
    }
  }
}

/** Sounds that should be heard right now. */
export function audible(state: PlayerState): SoundKind[] {
  return state.paused ? [] : state.active
}

export function isPlaying(state: PlayerState): boolean {
  return audible(state).length > 0
}

export type EngineLike = Pick<
  AudioEngine,
  'isPlaying' | 'play' | 'stop' | 'getVolume' | 'setVolume' | 'getMasterVolume' | 'setMasterVolume' | 'getBeat' | 'setBeat'
>

/**
 * Make the engine match `state`: levels first (so a sound starting up fades
 * in to the right volume), then start and stop sounds. Only changed values
 * are sent, so dragging one slider doesn't re-ramp every other sound.
 */
export function sync(engine: EngineLike, state: PlayerState): Promise<void> {
  const master = state.muted ? 0 : state.master
  if (engine.getMasterVolume() !== master) engine.setMasterVolume(master)
  if (engine.getBeat() !== state.beat) engine.setBeat(state.beat)
  const want = new Set(audible(state))
  const starting: Promise<void>[] = []
  for (const kind of SOUND_KINDS) {
    if (engine.getVolume(kind) !== state.volumes[kind]) engine.setVolume(kind, state.volumes[kind])
    const on = engine.isPlaying(kind)
    if (want.has(kind) && !on) starting.push(engine.play(kind))
    else if (!want.has(kind) && on) engine.stop(kind)
  }
  return Promise.all(starting).then(() => undefined)
}

/** "Rain", "Rain and Fan", "Rain, Fan and Pink noise". */
export function listNames(kinds: readonly SoundKind[]): string {
  const names = kinds.map(soundName)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** One line for the status area (and screen readers) describing the mix. */
export function statusText(state: PlayerState): string {
  if (state.active.length === 0) return 'Tap a sound to begin'
  // Past three names the line gets long; a count reads better.
  if (state.active.length > 3) return `${state.paused ? 'Paused' : 'Playing'}: ${state.active.length} sounds`
  return `${state.paused ? 'Paused' : 'Playing'}: ${listNames(state.active)}`
}

// Saved between visits. The mix is restored paused: the app never starts
// making sound on its own.

export const STORAGE_KEY = 'sleepsounds:player'

export function serialize(state: PlayerState): string {
  const { active, volumes, master, beat } = state
  return JSON.stringify({ v: 1, active, volumes, master, beat })
}

export function parse(json: string | null): PlayerState {
  const state = initialState()
  if (!json) return state
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return state
  }
  if (!data || typeof data !== 'object') return state
  const d = data as Record<string, unknown>
  if (Array.isArray(d.active)) state.active = [...new Set(d.active.filter(isSoundKind))]
  if (d.volumes && typeof d.volumes === 'object') {
    for (const kind of SOUND_KINDS) {
      const v = (d.volumes as Record<string, unknown>)[kind]
      if (typeof v === 'number') state.volumes[kind] = unit(v)
    }
  }
  if (typeof d.master === 'number') state.master = unit(d.master)
  if (typeof d.beat === 'number') state.beat = clampBeat(d.beat)
  return state
}
