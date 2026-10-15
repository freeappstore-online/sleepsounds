// Every Sleep Sounds sound, by name. Each is generated sample by sample from a
// seeded PRNG: there are no audio files and no looped buffers, so nothing
// ever repeats.

import { GeneratorBase, type Generator } from './base'
import { OnePoleHP } from './dsp'
import { BrownNoise, PinkNoise, WhiteNoise } from './noise'
import { Fan, Fire, Rain, Stream, Waves, Wind } from './textures'

export type { Generator } from './base'

export const NOISE_KINDS = ['white', 'pink', 'brown'] as const
export const TEXTURE_KINDS = ['rain', 'waves', 'wind', 'fan', 'fire', 'stream'] as const
export const SOUND_KINDS = [...NOISE_KINDS, ...TEXTURE_KINDS] as const

export type SoundKind = (typeof SOUND_KINDS)[number]

export function isSoundKind(value: unknown): value is SoundKind {
  return typeof value === 'string' && (SOUND_KINDS as readonly string[]).includes(value)
}

/** Name the worklet registers its processor under (see worklet.ts). */
export const PROCESSOR_NAME = 'sleep-sound'

// Output gains below bring every sound to roughly the same loudness (about
// 0.16 RMS), leaving headroom for mixing several together.

class White extends GeneratorBase {
  private readonly noise = new WhiteNoise(this.rng)
  protected sample(): number {
    return this.noise.next() * 0.3
  }
}

class Pink extends GeneratorBase {
  private readonly noise = new PinkNoise(this.rng)
  private readonly hp = new OnePoleHP(this.sr, 20)
  protected sample(): number {
    return this.hp.process(this.noise.next()) * 0.95
  }
}

class Brown extends GeneratorBase {
  private readonly noise = new BrownNoise(this.rng)
  private readonly hp = new OnePoleHP(this.sr, 20)
  protected sample(): number {
    return this.hp.process(this.noise.next()) * 0.9
  }
}

const FACTORIES: Record<SoundKind, new (sampleRate: number, seed: number) => Generator> = {
  white: White,
  pink: Pink,
  brown: Brown,
  rain: Rain,
  waves: Waves,
  wind: Wind,
  fan: Fan,
  fire: Fire,
  stream: Stream,
}

export function createGenerator(kind: SoundKind, sampleRate: number, seed: number): Generator {
  return new FACTORIES[kind](sampleRate, seed)
}
