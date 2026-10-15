import { describe, expect, it } from 'vitest'
import { highShare, maxStep, peak, render, rms } from './analysis'
import {
  Binaural,
  CARRIER_HZ,
  DEFAULT_BEAT_HZ,
  MAX_BEAT_HZ,
  MIN_BEAT_HZ,
  TONE_LEVEL,
  clampBeat,
  earFrequencies,
  formatBeat,
} from './binaural'
import { createGenerator, isSoundKind } from './generators'

const SR = 48000

/** Render both ears in worklet-sized blocks. */
function renderStereo(gen: Binaural, seconds: number) {
  const n = Math.ceil((seconds * SR) / 128) * 128
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  for (let i = 0; i < n; i += 128) gen.process(left.subarray(i, i + 128), right.subarray(i, i + 128))
  return { left, right }
}

/**
 * Frequency from the first and last rising zero crossings, interpolated
 * between samples: accurate to well under 0.01 Hz over a few seconds.
 */
function frequency(x: Float32Array): number {
  const crossings: number[] = []
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) crossings.push(i - 1 + -x[i - 1] / (x[i] - x[i - 1]))
  }
  return ((crossings.length - 1) * SR) / (crossings.at(-1)! - crossings[0])
}

describe('earFrequencies', () => {
  it('centres the two tones on the carrier, a beat apart', () => {
    expect(earFrequencies(6)).toEqual({ left: CARRIER_HZ - 3, right: CARRIER_HZ + 3 })
    const { left, right } = earFrequencies(10, 300)
    expect(right - left).toBe(10)
    expect((left + right) / 2).toBe(300)
  })

  it('clamps the beat to its range', () => {
    expect(clampBeat(0)).toBe(MIN_BEAT_HZ)
    expect(clampBeat(-5)).toBe(MIN_BEAT_HZ)
    expect(clampBeat(100)).toBe(MAX_BEAT_HZ)
    expect(clampBeat(Number.NaN)).toBe(DEFAULT_BEAT_HZ)
    expect(clampBeat(7.5)).toBe(7.5)
  })
})

describe('Binaural', () => {
  it.each([1, 4, 6.5, 10, 30])('plays ears exactly %s Hz apart', (beat) => {
    const { left, right } = renderStereo(new Binaural(SR, beat), 4)
    const expected = earFrequencies(beat)
    expect(frequency(left)).toBeCloseTo(expected.left, 2)
    expect(frequency(right)).toBeCloseTo(expected.right, 2)
    expect(frequency(right) - frequency(left)).toBeCloseTo(beat, 2)
  })

  it('plays gently: quieter than the noise sounds and never above its level', () => {
    const { left, right } = renderStereo(new Binaural(SR), 2)
    expect(peak(left)).toBeLessThanOrEqual(TONE_LEVEL)
    expect(peak(right)).toBeLessThanOrEqual(TONE_LEVEL)
    expect(TONE_LEVEL).toBeLessThanOrEqual(0.15)
    expect(rms(left)).toBeLessThan(rms(render('pink', 2)) * 0.7)
  })

  it('is a low, soft tone with no harsh highs', () => {
    const { left } = renderStereo(new Binaural(SR), 2)
    expect(highShare(left, SR, 2000)).toBeLessThan(0.001)
  })

  it('starts from silence', () => {
    const { left, right } = renderStereo(new Binaural(SR), 0.01)
    expect(Math.abs(left[0])).toBeLessThan(0.005)
    expect(Math.abs(right[0])).toBeLessThan(0.005)
  })

  it('glides to a new beat without a click', () => {
    const gen = new Binaural(SR, 4)
    const before = renderStereo(gen, 0.5)
    gen.setBeat(20)
    expect(gen.currentBeat).toBe(4)
    const after = renderStereo(gen, 3)
    // A sine at ~210 Hz and this level moves at most ~0.0033 per sample;
    // any jump at the change would show up far above that.
    const joined = new Float32Array([...before.right, ...after.right])
    expect(maxStep(joined)).toBeLessThan(0.004)
    expect(gen.currentBeat).toBeCloseTo(20, 2)
    // Once settled, the ears are 20 Hz apart.
    const tailL = after.left.subarray(SR * 2)
    const tailR = after.right.subarray(SR * 2)
    expect(frequency(tailR) - frequency(tailL)).toBeCloseTo(20, 1)
  })

  it('clamps beats set while playing', () => {
    const gen = new Binaural(SR)
    gen.setBeat(1000)
    renderStereo(gen, 3)
    expect(gen.currentBeat).toBeCloseTo(MAX_BEAT_HZ, 2)
  })

  it('works whatever block size the audio thread asks for', () => {
    const whole = renderStereo(new Binaural(SR, 7), 0.05)
    const gen = new Binaural(SR, 7)
    const left = new Float32Array(whole.left.length)
    const right = new Float32Array(whole.right.length)
    let i = 0
    for (const size of [1, 7, 128, 300, 33]) {
      gen.process(left.subarray(i, i + size), right.subarray(i, i + size))
      i += size
    }
    gen.process(left.subarray(i), right.subarray(i))
    expect(Array.from(left)).toEqual(Array.from(whole.left))
    expect(Array.from(right)).toEqual(Array.from(whole.right))
  })

  it('writes only the left tone when given one channel', () => {
    const out = new Float32Array(SR * 2)
    new Binaural(SR, 6).process(out)
    expect(frequency(out)).toBeCloseTo(earFrequencies(6).left, 2)
  })
})

describe('binaural in the sound registry', () => {
  it('is a known stereo sound that takes its starting beat', () => {
    expect(isSoundKind('binaural')).toBe(true)
    const gen = createGenerator('binaural', SR, 1, { beatHz: 12 })
    expect(gen.channels).toBe(2)
    expect((gen as Binaural).currentBeat).toBe(12)
  })
})

describe('formatBeat', () => {
  it('shows whole and half hertz without stray decimals', () => {
    expect(formatBeat(6)).toBe('6 Hz')
    expect(formatBeat(6.5)).toBe('6.5 Hz')
    expect(formatBeat(6.04)).toBe('6 Hz')
    expect(formatBeat(99)).toBe('30 Hz')
  })
})
