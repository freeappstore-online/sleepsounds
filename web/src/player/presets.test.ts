import { describe, expect, it } from 'vitest'
import { MAX_BEAT_HZ } from '../audio/binaural'
import {
  MAX_NAME_LENGTH,
  MAX_PRESETS,
  TOMBSTONE_MS,
  type Preset,
  cleanName,
  deletePreset,
  isCurrent,
  live,
  mergePresets,
  presetSummary,
  renamePreset,
  samePresets,
  sanitize,
  savePreset,
  snapshot,
} from './presets'
import { type PlayerAction, audible, initialState, reduce } from './state'

const mix = (...actions: PlayerAction[]) => actions.reduce(reduce, initialState())
const rainAndFan = mix(
  { type: 'toggle', kind: 'rain' },
  { type: 'toggle', kind: 'fan' },
  { type: 'volume', kind: 'rain', value: 0.4 },
)
let n = 0
const ids = () => `id${++n}`

function saved(name: string, state = rainAndFan, at = 1000, list: Preset[] = []) {
  const r = savePreset(list, name, state, at, ids)
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('cleanName', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(cleanName('  Night   rain \n')).toBe('Night rain')
    expect(cleanName('x'.repeat(100))).toHaveLength(MAX_NAME_LENGTH)
    expect(cleanName('   ')).toBe('')
  })
})

describe('saving', () => {
  it('captures the sounds that are on and their volumes', () => {
    const { preset, replaced } = saved('Night rain')
    expect(preset.name).toBe('Night rain')
    expect(preset.sounds).toEqual([
      { kind: 'rain', volume: 0.4 },
      { kind: 'fan', volume: 0.7 },
    ])
    expect(preset.beat).toBeUndefined()
    expect(replaced).toBe(false)
  })

  it('keeps the beat only when binaural beats are in the mix', () => {
    const state = mix({ type: 'toggle', kind: 'binaural' }, { type: 'beat', hz: 4 })
    expect(snapshot(state).beat).toBe(4)
    expect(snapshot(rainAndFan).beat).toBeUndefined()
  })

  it('saves a paused mix too', () => {
    const paused = reduce(rainAndFan, { type: 'playPause' })
    expect(saved('Paused', paused).preset.sounds).toHaveLength(2)
  })

  it('updates the preset with the same name instead of duplicating it', () => {
    const first = saved('Night rain')
    const again = savePreset(first.presets, 'night RAIN', mix({ type: 'toggle', kind: 'waves' }), 2000, ids)
    expect(again.ok && again.replaced).toBe(true)
    if (!again.ok) return
    expect(live(again.presets)).toHaveLength(1)
    expect(again.preset.id).toBe(first.preset.id)
    expect(again.preset.sounds).toEqual([{ kind: 'waves', volume: 0.7 }])
    expect(again.preset.updatedAt).toBe(2000)
  })

  it('refuses an empty name or an empty mix', () => {
    expect(savePreset([], '   ', rainAndFan, 1, ids)).toEqual({ ok: false, error: 'Give the mix a name.' })
    expect(savePreset([], 'Quiet', initialState(), 1, ids).ok).toBe(false)
  })

  it(`stops at ${MAX_PRESETS} mixes, but still allows updating one`, () => {
    let list: Preset[] = []
    for (let i = 0; i < MAX_PRESETS; i++) list = saved(`Mix ${i}`, rainAndFan, i, list).presets
    expect(savePreset(list, 'One more', rainAndFan, 99, ids).ok).toBe(false)
    expect(savePreset(list, 'Mix 3', rainAndFan, 99, ids).ok).toBe(true)
  })
})

describe('loading', () => {
  it('restores exactly the saved sounds and volumes, and plays them', () => {
    const { preset } = saved('Night rain')
    const other = mix({ type: 'toggle', kind: 'fire' }, { type: 'playPause' }, { type: 'mute' })
    const loaded = reduce(other, { type: 'load', sounds: preset.sounds, beat: preset.beat })
    expect(audible(loaded)).toEqual(['rain', 'fan'])
    expect(loaded.volumes.rain).toBe(0.4)
    expect(loaded.muted).toBe(false)
    expect(isCurrent(preset, loaded)).toBe(true)
    expect(isCurrent(preset, other)).toBe(false)
  })

  it('restores the binaural beat', () => {
    const state = mix({ type: 'toggle', kind: 'binaural' }, { type: 'beat', hz: 10 })
    const { preset } = saved('Beats', state)
    const loaded = reduce(initialState(), { type: 'load', sounds: preset.sounds, beat: preset.beat })
    expect(loaded.beat).toBe(10)
  })

  it('describes a preset by its sounds', () => {
    expect(presetSummary(saved('Night rain').preset)).toBe('Rain and Fan')
  })
})

describe('renaming and deleting', () => {
  it('renames, refusing a name another mix already has', () => {
    const a = saved('Rain')
    const b = saved('Fan', rainAndFan, 2000, a.presets)
    const r = renamePreset(b.presets, a.preset.id, '  Soft rain ', 3000)
    expect(r.ok && live(r.presets).find((p) => p.id === a.preset.id)?.name).toBe('Soft rain')
    expect(renamePreset(b.presets, a.preset.id, 'fan', 3000).ok).toBe(false)
    expect(renamePreset(b.presets, a.preset.id, 'RAIN', 3000).ok).toBe(true)
  })

  it('deletes by leaving a tombstone that is hidden from the list', () => {
    const { presets, preset } = saved('Rain')
    const after = deletePreset(presets, preset.id, 5000)
    expect(live(after)).toEqual([])
    expect(after[0]).toMatchObject({ id: preset.id, deletedAt: 5000, updatedAt: 5000 })
  })

  it('lists the most recently changed first', () => {
    const a = saved('A', rainAndFan, 1)
    const b = saved('B', rainAndFan, 2, a.presets)
    expect(live(b.presets).map((p) => p.name)).toEqual(['B', 'A'])
  })
})

describe('mergePresets', () => {
  const p = (id: string, name: string, updatedAt: number, deletedAt?: number): Preset => ({
    id,
    name,
    sounds: deletedAt ? [] : [{ kind: 'rain', volume: 0.5 }],
    updatedAt,
    ...(deletedAt ? { deletedAt } : {}),
  })
  const NOW = 10_000_000_000

  it('keeps presets from both sides', () => {
    const merged = mergePresets([p('a', 'A', 1)], [p('b', 'B', 2)], NOW)
    expect(merged.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('takes the newer copy of the same preset', () => {
    expect(mergePresets([p('a', 'Old', 1)], [p('a', 'New', 2)], NOW)[0].name).toBe('New')
    expect(mergePresets([p('a', 'New', 2)], [p('a', 'Old', 1)], NOW)[0].name).toBe('New')
  })

  it('lets a newer delete win, and a delete win a tie', () => {
    expect(live(mergePresets([p('a', 'A', 1)], [p('a', 'A', 5, 5)], NOW))).toEqual([])
    expect(live(mergePresets([p('a', 'A', 5)], [p('a', 'A', 5, 5)], NOW))).toEqual([])
    // An edit made after the delete brings it back.
    expect(live(mergePresets([p('a', 'A', 9)], [p('a', 'A', 5, 5)], NOW))).toHaveLength(1)
  })

  it('forgets old tombstones', () => {
    const merged = mergePresets([p('a', 'A', 1, NOW - TOMBSTONE_MS - 1)], [p('b', 'B', 1, NOW - 10)], NOW)
    expect(merged.map((x) => x.id)).toEqual(['b'])
  })

  it('gives the same result whichever side is which', () => {
    const a = [p('a', 'A', 3), p('b', 'B', 1), p('c', 'C', 4, 4)]
    const b = [p('a', 'A2', 2), p('b', 'B2', 6), p('d', 'D', 1)]
    expect(samePresets(mergePresets(a, b, NOW), mergePresets(b, a, NOW))).toBe(true)
  })
})

describe('sanitize', () => {
  it('accepts the stored shape and a bare list', () => {
    const { presets } = saved('Rain')
    expect(sanitize({ v: 1, presets })).toEqual(presets)
    expect(sanitize(presets)).toEqual(presets)
  })

  it('drops or repairs anything malformed', () => {
    expect(sanitize(null)).toEqual([])
    expect(sanitize('nope')).toEqual([])
    const out = sanitize([
      { id: 'ok', name: '  Good ', updatedAt: 1, beat: 99, sounds: [{ kind: 'rain', volume: 5 }, { kind: 'rain', volume: 0.1 }, { kind: 'kazoo', volume: 1 }] },
      { id: 'ok', name: 'Duplicate id', updatedAt: 1, sounds: [{ kind: 'fan', volume: 1 }] },
      { id: 'no-sounds', name: 'Empty', updatedAt: 1, sounds: [] },
      { id: 'no-name', name: '', updatedAt: 1, sounds: [{ kind: 'fan', volume: 1 }] },
      { id: 'bad-time', name: 'X', updatedAt: 'yesterday', sounds: [{ kind: 'fan', volume: 1 }] },
      { id: 'gone', name: '', updatedAt: 5, deletedAt: 5, sounds: [] },
      42,
    ])
    expect(out).toEqual([
      { id: 'ok', name: 'Good', updatedAt: 1, beat: MAX_BEAT_HZ, sounds: [{ kind: 'rain', volume: 1 }] },
      { id: 'gone', name: '', updatedAt: 5, deletedAt: 5, sounds: [] },
    ])
  })
})
