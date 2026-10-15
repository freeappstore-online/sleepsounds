// The sounds as the player shows them: display order, names and the tint
// each tile glows with when it's on. Tints are the template's own accent
// colours, so the grid stays on-brand in both themes.

import type { SoundKind } from '../audio/generators'

export interface SoundInfo {
  kind: SoundKind
  name: string
  /** CSS colour for the tile's icon and glow. */
  tint: string
  /** Shown under the name on the tile. */
  note?: string
}

export const SOUNDS: readonly SoundInfo[] = [
  { kind: 'rain', name: 'Rain', tint: 'var(--sky)' },
  { kind: 'waves', name: 'Ocean', tint: 'var(--sky)' },
  { kind: 'stream', name: 'Stream', tint: 'var(--mint)' },
  { kind: 'wind', name: 'Wind', tint: 'var(--mint)' },
  { kind: 'fire', name: 'Fireplace', tint: 'var(--accent)' },
  { kind: 'fan', name: 'Fan', tint: 'var(--muted)' },
  { kind: 'white', name: 'White noise', tint: 'var(--ink)' },
  { kind: 'pink', name: 'Pink noise', tint: 'var(--accent)' },
  { kind: 'brown', name: 'Brown noise', tint: 'var(--warning)' },
  { kind: 'binaural', name: 'Binaural beats', tint: 'var(--warning)', note: 'Headphones' },
]

const BY_KIND = new Map(SOUNDS.map((s) => [s.kind, s]))

export function soundInfo(kind: SoundKind): SoundInfo {
  return BY_KIND.get(kind)!
}

export function soundName(kind: SoundKind): string {
  return soundInfo(kind).name
}
