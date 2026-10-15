// Sleep timer maths, kept pure for testing. The timer stores an absolute end
// time (wall clock), never a countdown, so a locked screen, a throttled
// background tab or a reload can't make it lose time: the remaining time is
// always worked out fresh from the clock.

export { fadeCurve, fadeGainAt } from '../audio/fade'

export interface SleepTimer {
  /** When the sound should be silent, ms since epoch. */
  endsAt: number
  /** The length it was set for, ms (for display and the progress ring). */
  durationMs: number
}

export const PRESET_MINUTES = [15, 30, 45, 60, 90] as const
export const MIN_MINUTES = 1
export const MAX_MINUTES = 12 * 60
/** The fade at the end: a minute, or a third of a very short timer. */
export const FADE_MS = 60_000

const MINUTE = 60_000

export function startTimer(minutes: number, now: number): SleepTimer {
  const m = clampMinutes(minutes)
  return { endsAt: now + m * MINUTE, durationMs: m * MINUTE }
}

/** Add time to a running timer, keeping within the maximum. */
export function extendTimer(timer: SleepTimer, minutes: number, now: number): SleepTimer {
  const left = remainingMs(timer, now)
  const total = Math.min(MAX_MINUTES * MINUTE, left + minutes * MINUTE)
  return { endsAt: now + total, durationMs: Math.max(timer.durationMs, total) }
}

export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 30
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)))
}

/**
 * Read a custom duration typed by the user: "20", "20 min", "1:30" (h:mm),
 * "1h", "1h 30m", "90m". Returns minutes, or null if it can't be read or is
 * out of range.
 */
export function parseMinutes(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  let minutes: number
  const clock = /^(\d{1,2}):(\d{2})$/.exec(s)
  const units = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/.exec(s)
  if (clock) {
    if (Number(clock[2]) >= 60) return null
    minutes = Number(clock[1]) * 60 + Number(clock[2])
  } else if (/^\d+$/.test(s)) {
    minutes = Number(s)
  } else if (units && (units[1] || units[2])) {
    minutes = Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0)
  } else {
    return null
  }
  minutes = Math.round(minutes)
  return minutes >= MIN_MINUTES && minutes <= MAX_MINUTES ? minutes : null
}

export function remainingMs(timer: SleepTimer, now: number): number {
  return Math.max(0, timer.endsAt - now)
}

/** How long the fade at the end lasts for a timer of this length. */
export function fadeMsFor(durationMs: number): number {
  return Math.min(FADE_MS, Math.max(0, durationMs / 3))
}

export type TimerPhase = 'running' | 'fading' | 'done'

export function phase(timer: SleepTimer, now: number): TimerPhase {
  const left = remainingMs(timer, now)
  if (left === 0) return 'done'
  return left <= fadeMsFor(timer.durationMs) ? 'fading' : 'running'
}

/** "29:59", "1:05:00", rounding up so it never shows 0:00 while running. */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "15 min", "1 h", "1 h 30 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Spoken form for screen readers: "29 minutes left", "1 hour 5 minutes left". */
export function spokenRemaining(ms: number): string {
  const totalMin = Math.ceil(Math.max(0, ms) / MINUTE)
  if (totalMin <= 1) return 'less than a minute left'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const parts = []
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  return `${parts.join(' ')} left`
}

export function serializeTimer(timer: SleepTimer | null): string {
  return JSON.stringify(timer)
}

/** Restore a saved timer; null if missing, malformed or already over. */
export function parseTimer(json: string | null, now: number): SleepTimer | null {
  if (!json) return null
  try {
    const d = JSON.parse(json) as Partial<SleepTimer> | null
    if (!d || typeof d.endsAt !== 'number' || typeof d.durationMs !== 'number') return null
    if (!Number.isFinite(d.endsAt) || !Number.isFinite(d.durationMs) || d.durationMs <= 0) return null
    if (d.endsAt <= now || d.endsAt - now > MAX_MINUTES * MINUTE) return null
    return { endsAt: d.endsAt, durationMs: d.durationMs }
  } catch {
    return null
  }
}
