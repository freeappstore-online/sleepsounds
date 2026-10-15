// The app's sleep timer, wired to the real clock, localStorage, the audio
// engine and the player store.

import { useSyncExternalStore } from 'react'
import { engine } from '../audio'
import { dispatch } from './store'
import { TimerController, type TimerSnapshot } from './timerController'

function localStore() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const sleepTimer = new TimerController({
  now: Date.now,
  storage: localStore(),
  engine,
  pause: () => void dispatch({ type: 'pause' }).catch(() => {}),
  after: (fn, ms) => {
    const id = window.setTimeout(fn, ms)
    return () => window.clearTimeout(id)
  },
})

// Timers in a locked or background page may be paused or slowed; check the
// clock again the moment the app is back.
const recheck = () => sleepTimer.check()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') recheck()
})
window.addEventListener('pageshow', recheck)
window.addEventListener('focus', recheck)

export function useSleepTimer(): TimerSnapshot {
  return useSyncExternalStore(sleepTimer.subscribe, sleepTimer.getSnapshot)
}
