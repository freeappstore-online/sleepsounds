import { type FormEvent, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal, useToast } from '@freeappstore/sdk/ui'
import { MoonIcon } from './icons'
import { PRESET_MINUTES, formatMinutes, formatRemaining, parseMinutes, spokenRemaining } from './timer'
import { sleepTimer, useSleepTimer } from './timerApp'

/**
 * The sleep timer button for the player bar. Shows the time left while a
 * timer runs; opens a dialog to set, extend or turn it off.
 */
export function SleepTimerButton() {
  const { timer, remainingMs, phase } = useSleepTimer()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="ss-timer-pill"
        data-active={timer ? true : undefined}
        aria-haspopup="dialog"
        aria-label={timer ? `Sleep timer: ${spokenRemaining(remainingMs)}. Change` : 'Set sleep timer'}
        onClick={() => setOpen(true)}
      >
        <MoonIcon />
        <span className="tabular-nums">
          {timer ? (phase === 'fading' ? `Fading · ${formatRemaining(remainingMs)}` : formatRemaining(remainingMs)) : 'Timer'}
        </span>
      </button>
      {/* Portalled to <body>: the player bar's backdrop blur would otherwise
          trap the dialog's fixed overlay inside the bar. */}
      {createPortal(
        <Modal open={open} onClose={() => setOpen(false)} title="Sleep timer">
          <TimerDialog onDone={() => setOpen(false)} />
        </Modal>,
        document.body,
      )}
    </>
  )
}

function TimerDialog({ onDone }: { onDone: () => void }) {
  const { timer, remainingMs, phase } = useSleepTimer()
  const toast = useToast()
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const customId = useId()
  const errorId = useId()

  const start = (minutes: number) => {
    sleepTimer.start(minutes)
    toast.show(`Sleep timer set for ${formatMinutes(minutes)}`)
    onDone()
  }

  const submitCustom = (e: FormEvent) => {
    e.preventDefault()
    const minutes = parseMinutes(custom)
    if (minutes === null) {
      setError('Enter a time between 1 minute and 12 hours, like 20, 1:30 or 2h.')
      return
    }
    start(minutes)
  }

  return (
    <div className="ss-timer">
      {timer ? (
        <div className="ss-timer-now">
          <p className="ss-timer-left tabular-nums" role="timer" aria-label={spokenRemaining(remainingMs)}>
            {formatRemaining(remainingMs)}
          </p>
          <p className="ss-timer-hint">
            {phase === 'fading' ? 'Fading out now…' : 'The sound fades out gently over the last minute, then stops.'}
          </p>
          <div className="ss-timer-actions">
            <button type="button" className="ss-chip-button" onClick={() => sleepTimer.extend(15)}>
              +15 min
            </button>
            <button
              type="button"
              className="ss-chip-button"
              onClick={() => {
                sleepTimer.cancel()
                toast.show('Sleep timer off')
                onDone()
              }}
            >
              Turn off
            </button>
          </div>
        </div>
      ) : (
        <p className="ss-timer-hint">Sound fades out gently over the last minute, then stops.</p>
      )}

      <p className="ss-timer-label" id={`${customId}-presets`}>
        {timer ? 'Start over with' : 'Stop after'}
      </p>
      <div className="ss-timer-presets" role="group" aria-labelledby={`${customId}-presets`}>
        {PRESET_MINUTES.map((m) => (
          <button key={m} type="button" className="ss-chip-button" onClick={() => start(m)}>
            {formatMinutes(m)}
          </button>
        ))}
      </div>

      <form className="ss-timer-custom" onSubmit={submitCustom}>
        <label htmlFor={customId} className="ss-timer-label">
          Custom time
        </label>
        <div className="ss-save-row">
          <input
            id={customId}
            className="ss-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            enterKeyHint="go"
            placeholder="e.g. 20, 1:30 or 2h"
            value={custom}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setCustom(e.target.value)
              setError(null)
            }}
          />
          <button type="submit" className="ss-button">
            Start
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="ss-alert">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
