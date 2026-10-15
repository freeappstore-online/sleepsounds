// The app's single audio engine. The worklet is bundled as its own file by
// Vite (`?worker&url`) and loaded into the AudioContext on first play.

import workletUrl from './worklet.ts?worker&url'
import { AudioEngine } from './engine'

export { AudioEngine, DEFAULT_VOLUME, FADE_SECONDS, volumeToGain } from './engine'
export { NOISE_KINDS, SOUND_KINDS, TEXTURE_KINDS, TONE_KINDS, isSoundKind, type SoundKind } from './generators'
export { DEFAULT_BEAT_HZ, MAX_BEAT_HZ, MIN_BEAT_HZ, clampBeat, formatBeat } from './binaural'

export const engine = new AudioEngine({ workletUrl })
