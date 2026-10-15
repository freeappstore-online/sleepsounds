import { describe, expect, it } from 'vitest'
import { KV_KEY, LOCAL_KEY, type KvLike, PresetStore, type StorageLike } from './presetStore'
import { type PlayerAction, initialState, reduce } from './state'

const mix = (...actions: PlayerAction[]) => actions.reduce(reduce, initialState())
const rain = mix({ type: 'toggle', kind: 'rain' })
const fan = mix({ type: 'toggle', kind: 'fan' })

class MemoryStorage implements StorageLike {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

class FakeKv implements KvLike {
  data = new Map<string, unknown>()
  gets = 0
  sets = 0
  fail = false
  async get<T>(key: string): Promise<T | null> {
    this.gets++
    if (this.fail) throw new Error('offline')
    const v = this.data.get(key)
    return v === undefined ? null : (structuredClone(v) as T)
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.sets++
    if (this.fail) throw new Error('offline')
    this.data.set(key, structuredClone(value))
  }
}

let devices = 0

function makeStore(storage = new MemoryStorage(), start = 1000) {
  let t = start
  let id = 0
  // Each fake device makes its own ids, as real random ids would differ.
  const device = ++devices
  const store = new PresetStore({ storage, now: () => ++t, newId: () => `d${device}-p${++id}` })
  return { store, storage }
}

const names = (store: PresetStore) => store.getSnapshot().presets.map((p) => p.name)

describe('on this device', () => {
  it('saves, lists and survives a restart', () => {
    const { store, storage } = makeStore()
    expect(store.save('Night rain', rain).ok).toBe(true)
    expect(store.save('Fan', fan).ok).toBe(true)
    expect(names(store)).toEqual(['Fan', 'Night rain'])
    expect(storage.getItem(LOCAL_KEY)).toContain('Night rain')

    const restarted = new PresetStore({ storage })
    expect(names(restarted)).toEqual(['Fan', 'Night rain'])
    expect(restarted.getSnapshot().status).toBe('local')
  })

  it('renames and deletes, and remembers that too', () => {
    const { store, storage } = makeStore()
    store.save('Rain', rain)
    const id = store.getSnapshot().presets[0].id
    expect(store.rename(id, 'Soft rain').ok).toBe(true)
    expect(names(new PresetStore({ storage }))).toEqual(['Soft rain'])
    store.remove(id)
    expect(names(store)).toEqual([])
    expect(names(new PresetStore({ storage }))).toEqual([])
  })

  it('reports errors without changing anything', () => {
    const { store } = makeStore()
    const r = store.save('  ', rain)
    expect(r.ok).toBe(false)
    expect(names(store)).toEqual([])
  })

  it('starts empty if storage is missing or corrupt', () => {
    const storage = new MemoryStorage()
    storage.setItem(LOCAL_KEY, '{oops')
    expect(names(new PresetStore({ storage }))).toEqual([])
    expect(names(new PresetStore({ storage: null }))).toEqual([])
  })

  it('notifies subscribers and keeps a stable snapshot between changes', () => {
    const { store } = makeStore()
    let calls = 0
    const off = store.subscribe(() => calls++)
    const before = store.getSnapshot()
    expect(store.getSnapshot()).toBe(before)
    store.save('Rain', rain)
    expect(calls).toBe(1)
    expect(store.getSnapshot()).not.toBe(before)
    off()
    store.save('Fan', fan)
    expect(calls).toBe(1)
  })
})

describe('syncing with the account', () => {
  it('uploads local presets on sign-in', async () => {
    const { store } = makeStore()
    store.save('Rain', rain)
    const kv = new FakeKv()
    await store.connect(kv)
    expect(store.getSnapshot().status).toBe('synced')
    const remote = kv.data.get(KV_KEY) as { v: number; presets: { name: string }[] }
    expect(remote.v).toBe(1)
    expect(remote.presets.map((p) => p.name)).toEqual(['Rain'])
  })

  it('downloads presets saved on another device and keeps them locally', async () => {
    const kv = new FakeKv()
    const phone = makeStore(new MemoryStorage(), 1000)
    phone.store.save('From phone', rain)
    await phone.store.connect(kv)

    const laptop = makeStore(new MemoryStorage(), 5000)
    laptop.store.save('From laptop', fan)
    await laptop.store.connect(kv)
    expect(names(laptop.store).sort()).toEqual(['From laptop', 'From phone'])
    // Now on the laptop's disk too, so it's there signed out or offline.
    expect(laptop.storage.getItem(LOCAL_KEY)).toContain('From phone')

    await phone.store.sync()
    expect(names(phone.store).sort()).toEqual(['From laptop', 'From phone'])
  })

  it('pushes each change while signed in', async () => {
    const { store } = makeStore()
    const kv = new FakeKv()
    await store.connect(kv)
    store.save('Rain', rain)
    await store.sync()
    expect((kv.data.get(KV_KEY) as { presets: unknown[] }).presets).toHaveLength(1)
  })

  it('carries a delete to other devices', async () => {
    const kv = new FakeKv()
    const a = makeStore(new MemoryStorage(), 1000)
    a.store.save('Rain', rain)
    await a.store.connect(kv)
    const b = makeStore(new MemoryStorage(), 2000)
    await b.store.connect(kv)
    expect(names(b.store)).toEqual(['Rain'])

    b.store.remove(b.store.getSnapshot().presets[0].id)
    await b.store.sync()
    await a.store.sync()
    expect(names(a.store)).toEqual([])
  })

  it('does not write when nothing changed', async () => {
    const { store } = makeStore()
    store.save('Rain', rain)
    const kv = new FakeKv()
    await store.connect(kv)
    const sets = kv.sets
    await store.sync()
    expect(kv.sets).toBe(sets)
  })

  it('keeps working locally when the network fails, and recovers', async () => {
    const { store } = makeStore()
    const kv = new FakeKv()
    kv.fail = true
    await store.connect(kv)
    expect(store.getSnapshot().status).toBe('error')
    expect(store.save('Rain', rain).ok).toBe(true)
    expect(names(store)).toEqual(['Rain'])
    kv.fail = false
    await store.sync()
    expect(store.getSnapshot().status).toBe('synced')
    expect((kv.data.get(KV_KEY) as { presets: unknown[] }).presets).toHaveLength(1)
  })

  it('ignores junk in the account copy', async () => {
    const { store } = makeStore()
    const kv = new FakeKv()
    kv.data.set(KV_KEY, { v: 1, presets: [{ id: 'x', name: 'Bad', updatedAt: 1, sounds: [{ kind: 'kazoo', volume: 1 }] }, 'junk'] })
    await store.connect(kv)
    expect(names(store)).toEqual([])
    expect(store.getSnapshot().status).toBe('synced')
  })

  it('stops syncing on sign-out but keeps the presets on the device', async () => {
    const { store } = makeStore()
    const kv = new FakeKv()
    await store.connect(kv)
    store.save('Rain', rain)
    await store.sync()
    await store.connect(null)
    expect(store.getSnapshot().status).toBe('local')
    const sets = kv.sets
    store.save('Fan', fan)
    await store.sync()
    expect(kv.sets).toBe(sets)
    expect(names(store)).toEqual(['Fan', 'Rain'])
  })

  it('drops a sync that finishes after switching accounts', async () => {
    const { store } = makeStore()
    store.save('Mine', rain)
    let release!: () => void
    let started!: () => void
    const fetching = new Promise<void>((r) => (started = r))
    const slow: KvLike = {
      get: () =>
        new Promise((r) => {
          release = () => r(null)
          started()
        }),
      set: async () => {
        throw new Error('should not write to the old account')
      },
    }
    const pending = store.connect(slow)
    await fetching
    const other = new FakeKv()
    void store.connect(other)
    release()
    await pending
    await store.sync()
    expect(store.getSnapshot().status).toBe('synced')
    expect((other.data.get(KV_KEY) as { presets: { name: string }[] }).presets[0].name).toBe('Mine')
  })
})
