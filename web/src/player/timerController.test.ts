import { describe, expect, it } from 'vitest'
import type { FadePlan } from '../audio/engine'
import { FADE_MS } from './timer'
import { RESET_DELAY_MS, TIMER_KEY, TimerController } from './timerController'

const MIN = 60_000

// A fake world: a clock we move by hand and a scheduler that only runs
// callbacks when told to (like a throttled background tab).
function world(start = 1_700_000_000_000) {
  let now = start
  let tasks: { at: number; fn: () => void; id: number }[] = []
  let nextId = 0
  const storage = new Map<string, string>()
  const fades: (FadePlan | null)[] = []
  let pauses = 0
  const deps = {
    now: () => now,
    storage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) },
    engine: { setFadeOut: (plan: FadePlan | null) => void fades.push(plan) },
    pause: () => void pauses++,
    after: (fn: () => void, ms: number) => {
      const id = ++nextId
      tasks.push({ at: now + ms, fn, id })
      return () => {
        tasks = tasks.filter((t) => t.id !== id)
      }
    },
  }
  /** Move the clock, running due callbacks in order (as a live tab would). */
  const advance = (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = tasks.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      tasks = tasks.filter((t) => t !== due)
      now = due.at
      due.fn()
    }
    now = end
  }
  /** Move the clock without running anything (the tab was frozen). */
  const sleep = (ms: number) => {
    now += ms
  }
  return {
    deps,
    advance,
    sleep,
    storage,
    fades,
    get pauses() {
      return pauses
    },
    get pending() {
      return tasks.length
    },
    get now() {
      return now
    },
  }
}

describe('TimerController', () => {
  it('is off until started', () => {
    const w = world()
    const c = new TimerController(w.deps)
    expect(c.getSnapshot()).toEqual({ timer: null, remainingMs: 0, phase: 'off' })
    expect(w.pending).toBe(0)
  })

  it('counts down once a second', () => {
    const w = world()
    const c = new TimerController(w.deps)
    let updates = 0
    c.subscribe(() => updates++)
    c.start(15)
    expect(c.getSnapshot().remainingMs).toBe(15 * MIN)
    w.advance(3000)
    expect(c.getSnapshot().remainingMs).toBe(15 * MIN - 3000)
    expect(c.getSnapshot().phase).toBe('running')
    expect(updates).toBe(4)
  })

  it('schedules the fade-out with the engine for the last minute', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(30)
    expect(w.fades.at(-1)).toEqual({ startsAt: w.now + 30 * MIN - FADE_MS, endsAt: w.now + 30 * MIN })
  })

  it('shows the fading phase, then pauses the mix when time is up', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(15)
    w.advance(14 * MIN + 30_000)
    expect(c.getSnapshot().phase).toBe('fading')
    expect(w.pauses).toBe(0)
    w.advance(30_000)
    expect(w.pauses).toBe(1)
    expect(c.getSnapshot().phase).toBe('off')
  })

  it('lifts the fade only after the sounds have stopped', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(15)
    w.advance(15 * MIN)
    expect(w.fades.at(-1)).not.toBeNull()
    w.advance(RESET_DELAY_MS - 1)
    expect(w.fades.at(-1)).not.toBeNull()
    w.advance(1)
    expect(w.fades.at(-1)).toBeNull()
    expect(w.pending).toBe(0)
  })

  it('catches up after a screen lock froze its timers', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(30)
    w.sleep(40 * MIN)
    // Nothing ran while locked; on unlock the app re-checks.
    expect(w.pauses).toBe(0)
    c.check()
    expect(w.pauses).toBe(1)
    expect(c.getSnapshot().timer).toBeNull()
  })

  it('does not reset when the screen is locked mid-countdown', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(60)
    w.sleep(20 * MIN)
    c.check()
    expect(c.getSnapshot().remainingMs).toBe(40 * MIN)
    expect(w.pauses).toBe(0)
  })

  it('survives a reload', () => {
    const w = world()
    new TimerController(w.deps).start(30)
    w.sleep(10 * MIN)
    const reloaded = new TimerController(w.deps)
    expect(reloaded.getSnapshot().remainingMs).toBe(20 * MIN)
    // The fade is scheduled again for the new page.
    expect(w.fades.at(-1)).toEqual({ startsAt: w.now + 20 * MIN - FADE_MS, endsAt: w.now + 20 * MIN })
  })

  it('forgets a timer that ran out while the app was closed', () => {
    const w = world()
    new TimerController(w.deps).start(15)
    w.sleep(20 * MIN)
    expect(new TimerController(w.deps).getSnapshot().timer).toBeNull()
  })

  it('cancels: no pause, the fade is lifted, nothing left scheduled', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(15)
    w.advance(14 * MIN + 45_000)
    c.cancel()
    expect(w.fades.at(-1)).toBeNull()
    expect(w.storage.get(TIMER_KEY)).toBe('null')
    w.advance(60 * MIN)
    expect(w.pauses).toBe(0)
    expect(w.pending).toBe(0)
  })

  it('adding time during the fade reschedules it later', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(15)
    w.advance(14 * MIN + 30_000)
    c.extend(15)
    expect(c.getSnapshot().phase).toBe('running')
    expect(w.fades.at(-1)?.endsAt).toBe(w.now + 15 * MIN + 30_000)
    w.advance(15 * MIN)
    expect(w.pauses).toBe(0)
    w.advance(30_000)
    expect(w.pauses).toBe(1)
  })

  it('starting a new timer replaces the old one', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(60)
    c.start(15)
    w.advance(15 * MIN)
    expect(w.pauses).toBe(1)
    w.advance(60 * MIN)
    expect(w.pauses).toBe(1)
  })

  it('a new timer started right after expiry keeps its fade', () => {
    const w = world()
    const c = new TimerController(w.deps)
    c.start(15)
    w.advance(15 * MIN)
    c.start(30)
    w.advance(RESET_DELAY_MS)
    expect(w.fades.at(-1)).not.toBeNull()
  })
})
