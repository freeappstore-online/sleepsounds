import { describe, expect, it } from 'vitest'
import { BandPass, Drift, OnePoleHP, OnePoleLP, Rng, softLimit } from './dsp'

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

describe('BandPass', () => {
  const sr = 48000
  const through = (f: BandPass, hz: number) => {
    let s = 0
    for (let i = 0; i < sr; i++) {
      const y = f.process(Math.sin((2 * Math.PI * hz * i) / sr))
      if (i >= sr / 2) s += y * y
    }
    return Math.sqrt(s / (sr / 2))
  }

  it('passes its centre at unity and cuts either side', () => {
    expect(through(new BandPass(sr, 1000, 2), 1000)).toBeCloseTo(Math.SQRT1_2, 2)
    expect(through(new BandPass(sr, 1000, 2), 100)).toBeLessThan(0.05)
    expect(through(new BandPass(sr, 1000, 2), 10000)).toBeLessThan(0.05)
  })

  it('can be retuned while running', () => {
    const f = new BandPass(sr, 300, 2)
    f.set(3000)
    expect(through(f, 3000)).toBeCloseTo(Math.SQRT1_2, 2)
  })

  it('stays stable when asked for frequencies above Nyquist', () => {
    const f = new BandPass(sr, 40000, 1)
    expect(Number.isFinite(through(f, 1000))).toBe(true)
  })
})

describe('Drift', () => {
  it('wanders within [0, 1] without jumps', () => {
    const d = new Drift(new Rng(5), 1000, 2)
    let prev = d.step()
    let lo = 1
    let hi = 0
    for (let i = 0; i < 100_000; i++) {
      const v = d.step()
      expect(Math.abs(v - prev)).toBeLessThan(0.01)
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
      prev = v
    }
    expect(lo).toBeGreaterThanOrEqual(0)
    expect(hi).toBeLessThanOrEqual(1)
    expect(hi - lo).toBeGreaterThan(0.8)
  })

  it('gives the same path whether stepped one sample or many at a time', () => {
    const a = new Drift(new Rng(9), 1000, 3)
    const b = new Drift(new Rng(9), 1000, 3)
    let va = 0
    for (let i = 0; i < 5000; i++) va = a.step()
    let vb = 0
    for (let i = 0; i < 100; i++) vb = b.step(50)
    expect(vb).toBeCloseTo(va, 10)
  })
})
