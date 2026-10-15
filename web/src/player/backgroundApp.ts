// Background playback for the real app: the silent keep-alive element, the
// Media Session (lock screen / notification controls), the screen Wake Lock
// and page lifecycle events, wired to the player store. See background.ts.

import { useSyncExternalStore } from 'react'
import { engine } from '../audio'
import { BackgroundAudio, KEEP_AWAKE_KEY, isIOS, keepAwakeDefault, silentWav } from './background'
import { dispatch, getPlayerState, subscribePlayer } from './store'

export const ios = isIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0)
export const supportsWakeLock = 'wakeLock' in navigator
export const supportsMediaSession = 'mediaSession' in navigator

// Safari 16.4+: a "playback" audio session plays through the silent switch
// and is the kind iOS keeps going in the background, when it does at all.
const nav = navigator as Navigator & { audioSession?: { type: string } }
try {
  if (nav.audioSession) nav.audioSession.type = 'playback'
} catch {
  // Older Safari or other browsers: nothing to set.
}

function loadKeepAwake(): string | null {
  try {
    return localStorage.getItem(KEEP_AWAKE_KEY)
  } catch {
    return null
  }
}

const keepAlive = new Audio(URL.createObjectURL(new Blob([silentWav() as BlobPart], { type: 'audio/wav' })))
keepAlive.loop = true
keepAlive.preload = 'auto'

const ARTWORK = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
]

export const background = new BackgroundAudio(
  {
    mediaSession: supportsMediaSession ? navigator.mediaSession : null,
    makeMetadata: (init) => new MediaMetadata({ ...init, artwork: ARTWORK }),
    keepAlive,
    requestWakeLock: supportsWakeLock ? () => navigator.wakeLock.request('screen') : null,
    dispatch,
    visible: () => document.visibilityState === 'visible',
  },
  keepAwakeDefault(loadKeepAwake(), ios),
)

background.update(getPlayerState())
subscribePlayer(() => background.update(getPlayerState()))

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  background.onVisible()
  // Pick up after a phone call or an iOS suspension.
  void engine.resume()
})
// Closing the app (or leaving the page) stops the sound cleanly.
window.addEventListener('pagehide', () => background.onPageHide())

const keepAwakeListeners = new Set<() => void>()

export function setKeepAwake(on: boolean): void {
  background.setKeepAwake(on)
  try {
    localStorage.setItem(KEEP_AWAKE_KEY, String(on))
  } catch {
    // Not remembered; still applies now.
  }
  for (const fn of keepAwakeListeners) fn()
}

export function useKeepAwake(): boolean {
  return useSyncExternalStore(
    subscribeKeepAwake,
    () => background.getKeepAwake(),
  )
}

function subscribeKeepAwake(fn: () => void): () => void {
  keepAwakeListeners.add(fn)
  return () => keepAwakeListeners.delete(fn)
}
