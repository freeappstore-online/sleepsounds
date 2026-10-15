// The app's preset store, synced to the signed-in account through fas.kv.

import { useSyncExternalStore } from 'react'
import { fas } from '../fas'
import { PresetStore, type PresetSnapshot, type StorageLike } from './presetStore'

function localStore(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const presetStore = new PresetStore({ storage: localStore() })

// Sync on sign-in (and stop on sign-out). Fires at once with the current user.
fas.auth.onChange((user) => void presetStore.connect(user ? fas.kv : null))

// Pick up changes from other devices when the app comes back into view or
// back online.
window.addEventListener('online', () => void presetStore.sync())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void presetStore.sync()
})

export function usePresets(): PresetSnapshot {
  return useSyncExternalStore(presetStore.subscribe, presetStore.getSnapshot)
}
