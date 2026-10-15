// Runs the sleep timer: keeps the end time (saved, so it survives reloads),
// hands the fade-out to the engine to schedule on the audio clock, and
// pauses the mix once time is up. A once-a-second tick drives the countdown
// display and notices expiry; it is also run whenever the app comes back
// into view, so a locked screen or a throttled tab can't make it miss.
//
// Clock, storage, engine and scheduling are passed in so tests can fake them.

import type { FadePlan } from '../audio/engine'
import {
  type SleepTimer,
  type TimerPhase,
  extendTimer,
  fadeMsFor,
  parseTimer,
  phase,
  remainingMs,
  serializeTimer,
  startTimer,
} from './timer'

export interface TimerSnapshot {
  timer: SleepTimer | null
  remainingMs: number
  phase: TimerPhase | 'off'
}

export interface TimerDeps {
  now: () => number
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null
  engine: { setFadeOut(plan: FadePlan | null): void }
  /** Pause the mix (sounds then stop with their own short fade). */
  pause: () => void
  /** Run `fn` after `ms`; returns a cancel function. */
  after: (fn: () => void, ms: number) => () => void
}

export const TIMER_KEY = 'sleepsounds:timer'
const TICK_MS = 1000
/** After pausing, wait for the sounds' own fade before lifting the timer fade. */
export const RESET_DELAY_MS = 2500

export function fadePlanFor(timer: SleepTimer): FadePlan {
  return { startsAt: timer.endsAt - fadeMsFor(timer.durationMs), endsAt: timer.endsAt }
}

export class TimerController {
  private timer: SleepTimer | null
  private snap: TimerSnapshot
  private cancelTick: (() => void) | null = null
  private cancelReset: (() => void) | null = null
  private readonly listeners = new Set<() => void>()
  private readonly deps: TimerDeps

  constructor(deps: TimerDeps) {
    this.deps = deps
    this.timer = parseTimer(this.read(), deps.now())
    this.snap = this.makeSnapshot()
    if (this.timer) {
      deps.engine.setFadeOut(fadePlanFor(this.timer))
      this.scheduleTick()
    }
  }

  getSnapshot = (): TimerSnapshot => this.snap

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  start(minutes: number): void {
    this.set(startTimer(minutes, this.deps.now()))
  }

  /** Add minutes to the running timer (also lifts a fade in progress). */
  extend(minutes: number): void {
    if (this.timer) this.set(extendTimer(this.timer, minutes, this.deps.now()))
  }

  /** Turn the timer off; any fade in progress comes back up. */
  cancel(): void {
    if (!this.timer) return
    this.timer = null
    this.write()
    this.stopTick()
    this.deps.engine.setFadeOut(null)
    this.publish()
  }

  /** Re-check against the clock now (e.g. when the screen is unlocked). */
  check(): void {
    if (!this.timer) return
    if (remainingMs(this.timer, this.deps.now()) === 0) this.expire()
    else this.publish()
  }

  private set(timer: SleepTimer): void {
    this.cancelReset?.()
    this.cancelReset = null
    this.timer = timer
    this.write()
    this.deps.engine.setFadeOut(fadePlanFor(timer))
    this.stopTick()
    this.scheduleTick()
    this.publish()
  }

  private expire(): void {
    this.timer = null
    this.write()
    this.stopTick()
    // The audio is already silent: the fade ran on the audio clock.
    this.deps.pause()
    this.cancelReset?.()
    this.cancelReset = this.deps.after(() => {
      this.cancelReset = null
      if (!this.timer) this.deps.engine.setFadeOut(null)
    }, RESET_DELAY_MS)
    this.publish()
  }

  private scheduleTick(): void {
    this.cancelTick = this.deps.after(() => {
      this.cancelTick = null
      this.check()
      if (this.timer) this.scheduleTick()
    }, TICK_MS)
  }

  private stopTick(): void {
    this.cancelTick?.()
    this.cancelTick = null
  }

  private publish(): void {
    this.snap = this.makeSnapshot()
    for (const fn of this.listeners) fn()
  }

  private makeSnapshot(): TimerSnapshot {
    if (!this.timer) return { timer: null, remainingMs: 0, phase: 'off' }
    const now = this.deps.now()
    return { timer: this.timer, remainingMs: remainingMs(this.timer, now), phase: phase(this.timer, now) }
  }

  private read(): string | null {
    try {
      return this.deps.storage?.getItem(TIMER_KEY) ?? null
    } catch {
      return null
    }
  }

  private write(): void {
    try {
      this.deps.storage?.setItem(TIMER_KEY, serializeTimer(this.timer))
    } catch {
      // Not saved: the timer still runs for this session.
    }
  }
}
