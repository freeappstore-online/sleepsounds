import { describe, expect, it } from 'vitest'
import {
  diff,
  envelope,
  highShare,
  maxSelfSimilarity,
  maxStep,
  mean,
  peak,
  render,
  rms,
} from './analysis'
import { OnePoleHP } from './dsp'
import { TEXTURE_KINDS, createGenerator, type SoundKind } from './generators'

const SR = 48000

/** Loudness of each second: how a sound swells and settles over time. */
const perSecond = (x: Float32Array) => Array.from(envelope(x, SR))
const spread = (xs: number[]) => Math.max(...xs) / Math.min(...xs)

describe.each(TEXTURE_KINDS)('%s', (kind) => {
  const audio = render(kind, 30, SR, 3)

  it('produces finite samples within ±1', () => {
    expect(audio.every(Number.isFinite)).toBe(true)
    expect(peak(audio)).toBeLessThan(1)
  })

  it('plays at about the same loudness as the other sounds', () => {
    expect(rms(audio)).toBeGreaterThan(0.1)
    expect(rms(audio)).toBeLessThan(0.22)
  })

  it('has no DC offset', () => {
    expect(Math.abs(mean(audio))).toBeLessThan(0.01)
  })

  it('has no harsh highs', () => {
    // Under 1% of the energy above 8 kHz (white noise has about 9%).
    expect(highShare(audio, SR, 8000)).toBeLessThan(0.01)
  })

  it('has no clicks', () => {
    // No jump between neighbouring samples bigger than raw white noise makes.
    expect(maxStep(audio)).toBeLessThan(0.65)
  })

  it('starts quietly enough for the fade-in to cover it', () => {
    expect(peak(audio.subarray(0, 128))).toBeLessThan(0.8)
  })

  it('is reproducible from its seed and differs between seeds', () => {
    const again = render(kind, 0.2, SR, 3)
    const other = render(kind, 0.2, SR, 4)
    expect(Array.from(again)).toEqual(Array.from(audio.subarray(0, again.length)))
    expect(Array.from(other)).not.toEqual(Array.from(again))
  })

  it('works whatever block size the audio thread asks for', () => {
    const whole = render(kind, 0.1, SR, 3)
    const gen = createGenerator(kind, SR, 3)
    const pieces = new Float32Array(whole.length)
    let i = 0
    for (const size of [1, 7, 128, 300, 33, 64, 65]) {
      gen.process(pieces.subarray(i, i + size))
      i += size
    }
    gen.process(pieces.subarray(i))
    expect(Array.from(pieces)).toEqual(Array.from(whole))
  })

  it('never repeats sample for sample (no looped buffer)', () => {
    const x = diff(render(kind, 3, 16000, 5))
    expect(maxSelfSimilarity(x, 512, 512)).toBeLessThan(0.6)
  })

  it('never repeats its rise and fall over two minutes', () => {
    // Compare the first 10 s of the loudness contour (100 ms steps) with
    // every later 10 s stretch. A loop would match at ~1.0.
    const env = envelope(render(kind, 120, 16000, 3), 1600)
    expect(maxSelfSimilarity(env, 100, 20)).toBeLessThan(0.9)
  })

  it('renders at least five times faster than real time', () => {
    const gen = createGenerator(kind, SR, 9)
    const block = new Float32Array(128)
    const start = performance.now()
    for (let i = 0; i < (10 * SR) / 128; i++) gen.process(block)
    expect(performance.now() - start).toBeLessThan(2000)
  })
})

describe('texture character', () => {
  const living: SoundKind[] = ['rain', 'waves', 'wind', 'fire', 'stream']

  it.each(living)('%s swells and settles over time', (kind) => {
    expect(spread(perSecond(render(kind, 30, SR, 3)))).toBeGreaterThan(1.4)
  })

  it('fan stays steady', () => {
    expect(spread(perSecond(render('fan', 30, SR, 3)))).toBeLessThan(1.2)
  })

  it('waves rise and fall more than anything else', () => {
    const waves = spread(perSecond(render('waves', 30, SR, 3)))
    for (const kind of TEXTURE_KINDS.filter((k) => k !== 'waves')) {
      expect(waves).toBeGreaterThan(spread(perSecond(render(kind, 30, SR, 3))))
    }
  })

  it('fire crackles: distinct bright transients, some in clusters', () => {
    const x = render('fire', 30, SR, 3)
    const hp = new OnePoleHP(SR, 2000)
    const bright = Array.from(x, (v) => Math.abs(hp.process(v)))
    const threshold = 5 * rms(bright)
    // Count crackle onsets: crossings above the threshold at least 3 ms apart.
    const onsets: number[] = []
    for (let i = 0; i < bright.length; i++) {
      if (bright[i] > threshold && (onsets.length === 0 || i - onsets[onsets.length - 1] > SR * 0.003)) {
        onsets.push(i)
      }
    }
    expect(onsets.length).toBeGreaterThan(30)
    expect(onsets.length).toBeLessThan(30 * 40)
    const gaps = onsets.slice(1).map((t, i) => (t - onsets[i]) / SR)
    expect(gaps.filter((g) => g < 0.05).length).toBeGreaterThan(5)
  })

  it('rain is brighter than waves, and wind darker than rain', () => {
    const hf = (kind: SoundKind) => highShare(render(kind, 10, SR, 3), SR, 2000)
    expect(hf('rain')).toBeGreaterThan(hf('waves') * 2)
    expect(hf('wind')).toBeLessThan(hf('rain'))
  })
})
