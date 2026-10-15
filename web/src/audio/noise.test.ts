import { describe, expect, it } from 'vitest'
import { diff, highShare, maxSelfSimilarity, maxStep, mean, peak, render, rms } from './analysis'
import { NOISE_KINDS, createGenerator, isSoundKind } from './generators'

const SR = 48000

describe.each(NOISE_KINDS)('%s noise', (kind) => {
  const audio = render(kind, 10, SR)

  it('produces finite samples within ±1', () => {
    expect(audio.every(Number.isFinite)).toBe(true)
    expect(peak(audio)).toBeLessThan(1)
  })

  it('plays at a comfortable, consistent level', () => {
    expect(rms(audio)).toBeGreaterThan(0.12)
    expect(rms(audio)).toBeLessThan(0.22)
  })

  it('has no DC offset', () => {
    expect(Math.abs(mean(audio))).toBeLessThan(0.01)
  })

  it('is reproducible from its seed and differs between seeds', () => {
    const again = render(kind, 0.1, SR, 1)
    const other = render(kind, 0.1, SR, 2)
    expect(Array.from(again)).toEqual(Array.from(audio.subarray(0, again.length)))
    expect(Array.from(other)).not.toEqual(Array.from(again))
  })

  it('works whatever block size the audio thread asks for', () => {
    const whole = render(kind, 0.05, SR)
    const gen = createGenerator(kind, SR, 1)
    const pieces = new Float32Array(whole.length)
    let i = 0
    for (const size of [1, 7, 128, 300, 33]) {
      gen.process(pieces.subarray(i, i + size))
      i += size
    }
    gen.process(pieces.subarray(i))
    expect(Array.from(pieces)).toEqual(Array.from(whole))
  })

  it('never repeats (no looped buffer)', () => {
    // Every lag over 3 s of 16 kHz audio is checked, so a loop of any length
    // up to that would show up as a correlation near 1. Comparing sample-to-
    // sample differences whitens the signal, so slow (brown) noise is judged
    // as fairly as white.
    const x = diff(render(kind, 3, 16000, 5))
    expect(maxSelfSimilarity(x, 512, 512)).toBeLessThan(0.35)
  })
})

describe('noise colours', () => {
  const share = (kind: (typeof NOISE_KINDS)[number]) => highShare(render(kind, 5, SR), SR, 4000)

  it('get darker from white to pink to brown', () => {
    const white = share('white')
    const pink = share('pink')
    const brown = share('brown')
    expect(white).toBeGreaterThan(0.15)
    expect(pink).toBeLessThan(white / 3)
    expect(brown).toBeLessThan(pink / 4)
  })

  it('brown noise moves smoothly (no crackle)', () => {
    expect(maxStep(render('brown', 5, SR))).toBeLessThan(0.15)
  })
})

describe('isSoundKind', () => {
  it('accepts known kinds only', () => {
    for (const kind of NOISE_KINDS) expect(isSoundKind(kind)).toBe(true)
    for (const bad of ['', 'WHITE', 'purple', 3, null, undefined]) expect(isSoundKind(bad)).toBe(false)
  })
})
