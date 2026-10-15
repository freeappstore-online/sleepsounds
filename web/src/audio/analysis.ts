// Measurements used by the generator tests. Not imported by the app.

import { OnePoleHP } from './dsp'
import { createGenerator, type SoundKind } from './generators'

/** Render `seconds` of a sound in worklet-sized blocks of 128 samples. */
export function render(kind: SoundKind, seconds: number, sampleRate = 48000, seed = 1): Float32Array {
  const gen = createGenerator(kind, sampleRate, seed)
  const total = Math.ceil((seconds * sampleRate) / 128) * 128
  const out = new Float32Array(total)
  for (let i = 0; i < total; i += 128) gen.process(out.subarray(i, i + 128))
  return out
}

export function rms(x: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return Math.sqrt(s / x.length)
}

export function mean(x: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i]
  return s / x.length
}

export function peak(x: ArrayLike<number>): number {
  let p = 0
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]))
  return p
}

/** Largest jump between neighbouring samples: big jumps are heard as clicks. */
export function maxStep(x: ArrayLike<number>): number {
  let m = 0
  for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]))
  return m
}

/**
 * Share of the signal's energy above `cutoffHz` (two cascaded one-pole
 * high-passes, so a rough 12 dB/octave split). Harsh highs show up here.
 */
export function highShare(x: ArrayLike<number>, sampleRate: number, cutoffHz: number): number {
  const a = new OnePoleHP(sampleRate, cutoffHz)
  const b = new OnePoleHP(sampleRate, cutoffHz)
  let hi = 0
  let all = 0
  for (let i = 0; i < x.length; i++) {
    const h = b.process(a.process(x[i]))
    hi += h * h
    all += x[i] * x[i]
  }
  return hi / all
}

/** RMS of consecutive windows of `windowSamples`: the loudness contour. */
export function envelope(x: ArrayLike<number>, windowSamples: number): Float64Array {
  const n = Math.floor(x.length / windowSamples)
  const env = new Float64Array(n)
  for (let w = 0; w < n; w++) {
    let s = 0
    for (let i = w * windowSamples; i < (w + 1) * windowSamples; i++) s += x[i] * x[i]
    env[w] = Math.sqrt(s / windowSamples)
  }
  return env
}

/** Pearson correlation of two equal-length sequences. */
export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const ma = mean(a)
  const mb = mean(b)
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    ab += da * db
    aa += da * da
    bb += db * db
  }
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb)
}

/**
 * Highest correlation between the first `window` values and any later
 * stretch of the same length, from `minLag` on. A looped buffer would score
 * ~1 at its loop length; fresh noise stays near 0.
 */
export function maxSelfSimilarity(x: ArrayLike<number>, window: number, minLag: number): number {
  const m = mean(Array.from({ length: window }, (_, i) => x[i]))
  const head = new Float64Array(window)
  let hh = 0
  for (let i = 0; i < window; i++) {
    head[i] = x[i] - m
    hh += head[i] * head[i]
  }
  // Running sums give each later window's variance in O(1).
  let s = 0
  let ss = 0
  for (let i = minLag; i < minLag + window; i++) {
    s += x[i]
    ss += x[i] * x[i]
  }
  let best = -1
  for (let lag = minLag; lag + window <= x.length; lag++) {
    if (lag > minLag) {
      const out = x[lag - 1]
      const inn = x[lag + window - 1]
      s += inn - out
      ss += inn * inn - out * out
    }
    // head is zero-mean, so its dot product with the raw tail is the covariance.
    let dot = 0
    for (let i = 0; i < window; i++) dot += head[i] * x[lag + i]
    const tt = ss - (s * s) / window
    if (tt > 0 && hh > 0) best = Math.max(best, dot / Math.sqrt(hh * tt))
  }
  return best
}

/** Sample-to-sample differences (a simple whitening filter). */
export function diff(x: ArrayLike<number>): Float64Array {
  const d = new Float64Array(Math.max(0, x.length - 1))
  for (let i = 1; i < x.length; i++) d[i - 1] = x[i] - x[i - 1]
  return d
}
