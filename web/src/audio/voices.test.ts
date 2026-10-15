import { describe, expect, it } from 'vitest'
import { GrainPool, TonePool } from './voices'

const run = (next: () => number, n: number) => Array.from({ length: n }, next)

describe('GrainPool', () => {
  it('rises linearly to its peak, then decays and frees itself', () => {
    const pool = new GrainPool(4)
    pool.trigger(0.5, 10, 20)
    const env = run(() => pool.next(), 400)
    // No instant jump at the start.
    expect(env[0]).toBeCloseTo(0.05)
    expect(env[9]).toBeCloseTo(0.5)
    expect(Math.max(...env)).toBeCloseTo(0.5)
    // One time constant (20 samples) into the decay, ~37% remains.
    const top = env.indexOf(Math.max(...env))
    expect(env[top + 20] / env[top]).toBeCloseTo(Math.exp(-1), 2)
    expect(env.at(-1)).toBe(0)
    expect(pool.count).toBe(0)
  })

  it('sums overlapping grains', () => {
    const pool = new GrainPool(4)
    pool.trigger(0.2, 1, 1000)
    pool.trigger(0.3, 1, 1000)
    expect(pool.next()).toBeCloseTo(0.5)
  })

  it('skips new grains when full instead of allocating', () => {
    const pool = new GrainPool(2)
    for (let i = 0; i < 5; i++) pool.trigger(0.1, 1, 1000)
    expect(pool.count).toBe(2)
  })
})

describe('TonePool', () => {
  const crossings = (xs: number[]) => xs.slice(1).filter((x, i) => xs[i] <= 0 && x > 0).length

  it('starts from silence and dies away', () => {
    const pool = new TonePool(2, 48000)
    pool.trigger(0.2, 1000, 1, 48, 480)
    const out = run(() => pool.next(), 20000)
    expect(Math.abs(out[0])).toBeLessThan(0.01)
    expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(0.2)
    expect(pool.count).toBe(0)
  })

  it('plays the requested pitch', () => {
    const pool = new TonePool(1, 48000)
    pool.trigger(0.5, 1000, 1, 1, 48000)
    expect(crossings(run(() => pool.next(), 4800))).toBeGreaterThanOrEqual(99)
  })

  it('glides upwards, like a bubble', () => {
    const pool = new TonePool(1, 48000)
    pool.trigger(0.5, 500, 2, 1, 4800)
    const out = run(() => pool.next(), 9600)
    expect(crossings(out.slice(4800, 9600))).toBeGreaterThan(crossings(out.slice(0, 4800)) * 1.3)
  })
})
