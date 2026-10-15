import { describe, expect, it } from 'vitest'
import {
  FADE_MS,
  MAX_MINUTES,
  PRESET_MINUTES,
  extendTimer,
  fadeCurve,
  fadeGainAt,
  fadeMsFor,
  formatMinutes,
  formatRemaining,
  parseMinutes,
  parseTimer,
  phase,
  remainingMs,
  serializeTimer,
  spokenRemaining,
  startTimer,
} from './timer'

const MIN = 60_000
const T0 = 1_700_000_000_000

describe('countdown', () => {
  it('offers the common durations', () => {
    expect(PRESET_MINUTES).toEqual(expect.arrayContaining([15, 30, 60]))
  })

  it('counts down from the wall clock', () => {
    const t = startTimer(30, T0)
    expect(t).toEqual({ endsAt: T0 + 30 * MIN, durationMs: 30 * MIN })
    expect(remainingMs(t, T0)).toBe(30 * MIN)
    expect(remainingMs(t, T0 + 10 * MIN)).toBe(20 * MIN)
    expect(remainingMs(t, T0 + 99 * MIN)).toBe(0)
  })

  it('keeps time across a long gap, as when the screen was locked', () => {
    const t = startTimer(60, T0)
    // Nothing ticked for 45 minutes; the remaining time is still right.
    expect(remainingMs(t, T0 + 45 * MIN)).toBe(15 * MIN)
  })

  it('runs, then fades for the last minute, then is done', () => {
    const t = startTimer(30, T0)
    expect(phase(t, T0)).toBe('running')
    expect(phase(t, T0 + 29 * MIN - 1)).toBe('running')
    expect(phase(t, T0 + 29 * MIN)).toBe('fading')
    expect(phase(t, T0 + 30 * MIN)).toBe('done')
  })

  it('uses a shorter fade for very short timers', () => {
    expect(fadeMsFor(30 * MIN)).toBe(FADE_MS)
    expect(fadeMsFor(1 * MIN)).toBe(20_000)
  })

  it('clamps and rounds durations', () => {
    expect(startTimer(0, T0).durationMs).toBe(MIN)
    expect(startTimer(10_000, T0).durationMs).toBe(MAX_MINUTES * MIN)
    expect(startTimer(12.4, T0).durationMs).toBe(12 * MIN)
  })

  it('adds time to a running timer', () => {
    const t = startTimer(15, T0)
    const later = extendTimer(t, 15, T0 + 10 * MIN)
    expect(remainingMs(later, T0 + 10 * MIN)).toBe(20 * MIN)
    expect(extendTimer(t, 100_000, T0).endsAt).toBe(T0 + MAX_MINUTES * MIN)
  })
})

describe('custom durations', () => {
  it.each([
    ['20', 20],
    ['20 min', 20],
    ['20m', 20],
    ['1:30', 90],
    ['1h', 60],
    ['1h 30m', 90],
    ['2 hours', 120],
    ['1.5h', 90],
    ['  45  ', 45],
  ])('reads "%s" as %i minutes', (input, minutes) => {
    expect(parseMinutes(input)).toBe(minutes)
  })

  it.each(['', 'soon', '0', '-5', '1:75', '13h', 'h', '20 seconds'])('rejects "%s"', (input) => {
    expect(parseMinutes(input)).toBeNull()
  })
})

describe('display', () => {
  it('formats the remaining time, never showing 0:00 while running', () => {
    expect(formatRemaining(30 * MIN)).toBe('30:00')
    expect(formatRemaining(29 * MIN + 59_001)).toBe('30:00')
    expect(formatRemaining(65 * MIN)).toBe('1:05:00')
    expect(formatRemaining(400)).toBe('0:01')
    expect(formatRemaining(0)).toBe('0:00')
  })

  it('formats durations and spoken time', () => {
    expect(formatMinutes(15)).toBe('15 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(90)).toBe('1 h 30 min')
    expect(spokenRemaining(29 * MIN + 1)).toBe('30 minutes left')
    expect(spokenRemaining(61 * MIN)).toBe('1 hour 1 minute left')
    expect(spokenRemaining(30_000)).toBe('less than a minute left')
  })
})

describe('fade-out shape', () => {
  it('starts at full volume and ends in silence', () => {
    expect(fadeGainAt(0)).toBe(1)
    expect(fadeGainAt(1)).toBe(0)
  })

  it('falls steadily, with no step big enough to hear as a drop', () => {
    const curve = fadeCurve(600)
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeLessThan(curve[i - 1])
      expect(curve[i - 1] - curve[i]).toBeLessThan(0.01)
    }
  })

  it('is halfway down in loudness by halfway through (even in dB)', () => {
    const db = 20 * Math.log10(fadeGainAt(0.5))
    expect(db).toBeGreaterThan(-26)
    expect(db).toBeLessThan(-23)
  })

  it('can start partway through, continuing the same shape', () => {
    const curve = fadeCurve(11, 0.5)
    expect(curve[0]).toBeCloseTo(fadeGainAt(0.5), 6)
    expect(curve[10]).toBe(0)
  })
})

describe('saving between visits', () => {
  it('restores a running timer', () => {
    const t = startTimer(30, T0)
    expect(parseTimer(serializeTimer(t), T0 + MIN)).toEqual(t)
  })

  it('drops a timer that ran out while the app was closed, or bad data', () => {
    const t = startTimer(30, T0)
    expect(parseTimer(serializeTimer(t), T0 + 31 * MIN)).toBeNull()
    expect(parseTimer(serializeTimer(null), T0)).toBeNull()
    expect(parseTimer(null, T0)).toBeNull()
    expect(parseTimer('{bad', T0)).toBeNull()
    expect(parseTimer(JSON.stringify({ endsAt: 'x', durationMs: 1 }), T0)).toBeNull()
    expect(parseTimer(JSON.stringify({ endsAt: T0 + 1e12, durationMs: 1 }), T0)).toBeNull()
  })
})
