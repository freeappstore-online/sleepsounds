// The one player store for the app. It lives outside React so the mix (and
// the sound) carries on while you visit About or Mixes, and is saved to
// localStorage so it's there next time.

import { useSyncExternalStore } from 'react'
import { engine } from '../audio'
import { STORAGE_KEY, parse, reduce, serialize, sync, type PlayerAction, type PlayerState } from './state'

function load(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function save(state: PlayerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state))
  } catch {
    // Private mode or full storage: the mix just won't be remembered.
  }
}

let current: PlayerState = parse(load())
const listeners = new Set<() => void>()

function set(next: PlayerState): void {
  current = next
  for (const fn of listeners) fn()
}

/**
 * Apply an action and bring the engine in line. Call it straight from the
 * event handler: starting audio needs the user's gesture. Rejects if the
 * browser can't play generated audio; the mix is then paused.
 */
export function dispatch(action: PlayerAction): Promise<void> {
  const next = reduce(current, action)
  set(next)
  save(next)
  return sync(engine, next).catch(async (err: unknown) => {
    if (!current.paused) set({ ...current, paused: true })
    await sync(engine, current)
    throw err
  })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const snapshot = () => current

export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribe, snapshot)
}
