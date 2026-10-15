import { describe, expect, it } from 'vitest'
import { OnePoleHP, OnePoleLP, Rng, softLimit } from './dsp'

describe('Rng', () => {
  it('replays the same sequence for the same seed', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('gives different sequences for different seeds', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    const same = Array.from({ length: 100 }, () => a.next() === b.next()).filter(Boolean)
    expect(same.length).toBeLessThan(3)
  })

  it('stays in range and averages out', () => {
    const r = new Rng(7)
    let sum = 0
    for (let i = 0; i < 100_000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      sum += r.bipolar()
    }
    expect(Math.abs(sum / 100_000)).toBeLessThan(0.01)
  })

  it('draws Poisson waits with the requested mean', () => {
    const r = new Rng(3)
    let sum = 0
    for (let i = 0; i < 50_000; i++) sum += r.exp(10)
    expect(sum / 50_000).toBeCloseTo(0.1, 2)
  })
})

describe('one-pole filters', () => {
  const sr = 48000
  const sine = (hz: number, n: number) => Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr))
  const level = (xs: number[]) => Math.sqrt(xs.slice(-4800).reduce((s, x) => s + x * x, 0) / 4800)

  it('low-pass keeps lows and cuts highs', () => {
    const lp = (hz: number) => {
      const f = new OnePoleLP(sr, 500)
      return level(sine(hz, 48000).map((x) => f.process(x)))
    }
    expect(lp(50)).toBeGreaterThan(0.69)
    expect(lp(10000)).toBeLessThan(0.05)
  })

  it('high-pass removes DC and keeps highs', () => {
    const hp = new OnePoleHP(sr, 20)
    let y = 1
    for (let i = 0; i < sr; i++) y = hp.process(1)
    expect(Math.abs(y)).toBeLessThan(1e-3)
    const f = new OnePoleHP(sr, 20)
    expect(level(sine(2000, 48000).map((x) => f.process(x)))).toBeGreaterThan(0.7)
  })
})

describe('softLimit', () => {
  it('is transparent at normal levels', () => {
    for (const x of [-0.5, -0.2, 0, 0.3, 0.5]) expect(softLimit(x)).toBe(x)
  })

  it('never exceeds ±1 and stays smooth and monotonic', () => {
    let prev = softLimit(-100)
    for (let x = -100; x <= 100; x += 0.01) {
      const y = softLimit(x)
      expect(Math.abs(y)).toBeLessThan(1)
      expect(y).toBeGreaterThanOrEqual(prev)
      expect(y - prev).toBeLessThan(0.0101)
      prev = y
    }
  })
})
