// Saved mixes, kept on this device and, when signed in, synced to the
// account through fas.kv. Every change is saved locally first, so presets
// work offline and signed out; syncing merges the two copies (see
// mergePresets) and writes the result back to both.
//
// Storage and kv are passed in, so the tests can use in-memory fakes.

import {
  type Preset,
  type SaveResult,
  deletePreset,
  live,
  mergePresets,
  newPresetId,
  renamePreset,
  samePresets,
  sanitize,
  savePreset,
  toStored,
} from './presets'
import type { PlayerState } from './state'

export interface KvLike {
  get<T = unknown>(key: string): Promise<T | null>
  set<T = unknown>(key: string, value: T): Promise<void>
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** local: this device only · syncing · synced: matches the account · error: last sync failed */
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error'

export interface PresetSnapshot {
  /** Saved mixes, most recently changed first (no deleted ones). */
  presets: Preset[]
  status: SyncStatus
}

export const LOCAL_KEY = 'sleepsounds:presets'
export const KV_KEY = 'presets'

export interface PresetStoreOptions {
  storage: StorageLike | null
  now?: () => number
  newId?: () => string
}

export class PresetStore {
  private all: Preset[]
  private kv: KvLike | null = null
  private status: SyncStatus = 'local'
  private snap: PresetSnapshot
  private queue: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<() => void>()
  private readonly storage: StorageLike | null
  private readonly now: () => number
  private readonly newId: () => string

  constructor(options: PresetStoreOptions) {
    this.storage = options.storage
    this.now = options.now ?? Date.now
    this.newId = options.newId ?? newPresetId
    this.all = this.readLocal()
    this.snap = this.makeSnapshot()
  }

  // React's useSyncExternalStore needs a stable snapshot between changes.
  getSnapshot = (): PresetSnapshot => this.snap

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Save the current mix under a name (updating a preset of the same name). */
  save(name: string, state: PlayerState): SaveResult {
    const result = savePreset(this.all, name, state, this.now(), this.newId)
    if (result.ok) this.change(result.presets)
    return result
  }

  rename(id: string, name: string): { ok: true } | { ok: false; error: string } {
    const result = renamePreset(this.all, id, name, this.now())
    if (!result.ok) return result
    this.change(result.presets)
    return { ok: true }
  }

  remove(id: string): void {
    this.change(deletePreset(this.all, id, this.now()))
  }

  /**
   * Start syncing with an account's kv (on sign-in), or stop (null, on
   * sign-out). Presets stay on the device either way.
   */
  connect(kv: KvLike | null): Promise<void> {
    if (kv === this.kv) return this.queue
    this.kv = kv
    if (!kv) {
      this.setStatus('local')
      return this.queue
    }
    return this.sync()
  }

  /** Pull, merge and push. Runs one at a time; never rejects. */
  sync(): Promise<void> {
    const kv = this.kv
    if (!kv) return this.queue
    this.setStatus('syncing')
    this.queue = this.queue.then(() => this.syncOnce(kv))
    return this.queue
  }

  private async syncOnce(kv: KvLike): Promise<void> {
    // Signed out or switched account since this was queued.
    if (this.kv !== kv) return
    try {
      const remote = sanitize(await kv.get(KV_KEY))
      if (this.kv !== kv) return
      // Merge with what's local *now*, including edits made while fetching.
      const merged = mergePresets(this.all, remote, this.now())
      if (!samePresets(merged, this.all)) this.setAll(merged)
      if (!samePresets(merged, remote)) await kv.set(KV_KEY, toStored(merged))
      if (this.kv === kv) this.setStatus('synced')
    } catch {
      if (this.kv === kv) this.setStatus('error')
    }
  }

  private change(next: Preset[]): void {
    this.setAll(next)
    if (this.kv) void this.sync()
  }

  private setAll(next: Preset[]): void {
    this.all = next
    this.writeLocal()
    this.publish()
  }

  private setStatus(status: SyncStatus): void {
    if (status === this.status) return
    this.status = status
    this.publish()
  }

  private publish(): void {
    this.snap = this.makeSnapshot()
    for (const fn of this.listeners) fn()
  }

  private makeSnapshot(): PresetSnapshot {
    return { presets: live(this.all), status: this.status }
  }

  private readLocal(): Preset[] {
    try {
      const raw = this.storage?.getItem(LOCAL_KEY)
      return raw ? sanitize(JSON.parse(raw)) : []
    } catch {
      return []
    }
  }

  private writeLocal(): void {
    try {
      this.storage?.setItem(LOCAL_KEY, JSON.stringify(toStored(this.all)))
    } catch {
      // Storage full or blocked: presets still work for this session.
    }
  }
}
