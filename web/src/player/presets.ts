// Saved mixes ("presets"): named snapshots of which sounds are on and at what
// volume. Pure functions over plain data, so saving, loading and merging two
// devices' lists can all be tested without storage or a network.
//
// Deleting leaves a tombstone (`deletedAt`) rather than dropping the entry,
// so a delete on one device wins over a stale copy on another when synced.

import { clampBeat } from '../audio/binaural'
import { isSoundKind, type SoundKind } from '../audio/generators'
import { listNames, type PlayerState } from './state'

export interface PresetSound {
  kind: SoundKind
  volume: number
}

export interface Preset {
  id: string
  name: string
  sounds: PresetSound[]
  /** Binaural beat in Hz, kept when the mix includes binaural beats. */
  beat?: number
  /** Last change, ms since epoch. The newer copy wins when syncing. */
  updatedAt: number
  /** Set when deleted; the entry stays as a tombstone so deletes sync. */
  deletedAt?: number
}

export const MAX_NAME_LENGTH = 40
export const MAX_PRESETS = 50
/** Tombstones older than this are forgotten. */
export const TOMBSTONE_MS = 60 * 24 * 60 * 60 * 1000

export type SaveResult =
  | { ok: true; presets: Preset[]; preset: Preset; replaced: boolean }
  | { ok: false; error: string }

/** Tidy a typed name: trimmed, single spaces, at most 40 characters. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim()
}

export function live(presets: readonly Preset[]): Preset[] {
  return presets.filter((p) => p.deletedAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt)
}

function findByName(presets: readonly Preset[], name: string): Preset | undefined {
  const key = name.toLocaleLowerCase()
  return presets.find((p) => p.deletedAt === undefined && p.name.toLocaleLowerCase() === key)
}

/** The current mix as preset contents. */
export function snapshot(state: PlayerState): Pick<Preset, 'sounds' | 'beat'> {
  const sounds = state.active.map((kind) => ({ kind, volume: state.volumes[kind] }))
  return state.active.includes('binaural') ? { sounds, beat: state.beat } : { sounds }
}

/**
 * Save the current mix under `name`. Saving under an existing name (any
 * case) updates that preset rather than making a duplicate.
 */
export function savePreset(
  presets: readonly Preset[],
  name: string,
  state: PlayerState,
  now: number,
  newId: () => string,
): SaveResult {
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: 'Give the mix a name.' }
  if (state.active.length === 0) return { ok: false, error: 'Turn on at least one sound first.' }
  const existing = findByName(presets, clean)
  if (!existing && live(presets).length >= MAX_PRESETS) {
    return { ok: false, error: `You can keep up to ${MAX_PRESETS} mixes. Delete one to save another.` }
  }
  const preset: Preset = { id: existing?.id ?? newId(), name: clean, ...snapshot(state), updatedAt: now }
  const rest = presets.filter((p) => p.id !== preset.id)
  return { ok: true, presets: [...rest, preset], preset, replaced: !!existing }
}

export function renamePreset(
  presets: readonly Preset[],
  id: string,
  name: string,
  now: number,
): { ok: true; presets: Preset[] } | { ok: false; error: string } {
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: 'Give the mix a name.' }
  const clash = findByName(presets, clean)
  if (clash && clash.id !== id) return { ok: false, error: `You already have a mix called "${clash.name}".` }
  return { ok: true, presets: presets.map((p) => (p.id === id ? { ...p, name: clean, updatedAt: now } : p)) }
}

export function deletePreset(presets: readonly Preset[], id: string, now: number): Preset[] {
  return presets.map((p) =>
    p.id === id ? { id: p.id, name: p.name, sounds: [], updatedAt: now, deletedAt: now } : p,
  )
}

/**
 * Combine two copies of the list (this device and the account). For each
 * preset the most recent change wins; on a tie a delete wins, so a mix
 * deleted on one device can't come back. Old tombstones are dropped.
 */
export function mergePresets(a: readonly Preset[], b: readonly Preset[], now: number): Preset[] {
  const byId = new Map<string, Preset>()
  for (const p of [...a, ...b]) {
    const seen = byId.get(p.id)
    if (
      !seen ||
      p.updatedAt > seen.updatedAt ||
      (p.updatedAt === seen.updatedAt && p.deletedAt !== undefined && seen.deletedAt === undefined)
    ) {
      byId.set(p.id, p)
    }
  }
  return [...byId.values()]
    .filter((p) => p.deletedAt === undefined || now - p.deletedAt < TOMBSTONE_MS)
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** True if two lists hold the same presets (ignoring order). */
export function samePresets(a: readonly Preset[], b: readonly Preset[]): boolean {
  if (a.length !== b.length) return false
  const key = (list: readonly Preset[]) =>
    JSON.stringify([...list].sort((x, y) => (x.id < y.id ? -1 : 1)))
  return key(a) === key(b)
}

/** "Rain, Fan and Pink noise". */
export function presetSummary(preset: Preset): string {
  return listNames(preset.sounds.map((s) => s.kind))
}

/** True if the player is currently set to exactly this preset's sounds. */
export function isCurrent(preset: Preset, state: PlayerState): boolean {
  if (preset.sounds.length !== state.active.length) return false
  return preset.sounds.every((s) => state.active.includes(s.kind) && Math.abs(state.volumes[s.kind] - s.volume) < 0.005)
}

/**
 * Check data from storage or the network. Anything malformed is dropped
 * rather than trusted; numbers are clamped into range.
 */
export function sanitize(data: unknown): Preset[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { presets?: unknown }).presets)
      ? (data as { presets: unknown[] }).presets
      : []
  const out: Preset[] = []
  const ids = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    if (typeof p.id !== 'string' || !p.id || p.id.length > 64 || ids.has(p.id)) continue
    if (typeof p.updatedAt !== 'number' || !Number.isFinite(p.updatedAt)) continue
    const deletedAt = typeof p.deletedAt === 'number' && Number.isFinite(p.deletedAt) ? p.deletedAt : undefined
    const name = typeof p.name === 'string' ? cleanName(p.name) : ''
    const sounds: PresetSound[] = []
    if (Array.isArray(p.sounds)) {
      for (const s of p.sounds) {
        const kind = (s as { kind?: unknown })?.kind
        const volume = (s as { volume?: unknown })?.volume
        if (!isSoundKind(kind) || typeof volume !== 'number' || sounds.some((x) => x.kind === kind)) continue
        sounds.push({ kind, volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0 })
      }
    }
    if (deletedAt === undefined && (!name || sounds.length === 0)) continue
    const preset: Preset = { id: p.id, name, sounds, updatedAt: p.updatedAt }
    if (typeof p.beat === 'number') preset.beat = clampBeat(p.beat)
    if (deletedAt !== undefined) preset.deletedAt = deletedAt
    ids.add(p.id)
    out.push(preset)
  }
  return out
}

/** Stored shape, versioned so the format can change later. */
export function toStored(presets: readonly Preset[]): { v: 1; presets: Preset[] } {
  return { v: 1, presets: [...presets] }
}

export function newPresetId(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
