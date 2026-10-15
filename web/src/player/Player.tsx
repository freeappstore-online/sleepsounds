import { type CSSProperties, useEffect, useId, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import { MAX_BEAT_HZ, MIN_BEAT_HZ, formatBeat } from '../audio'
import { HeadphonesIcon, PauseIcon, PlayIcon, SoundIcon, StopIcon, VolumeIcon } from './icons'
import { PlaybackCard } from './PlaybackCard'
import { SleepTimerButton } from './SleepTimer'
import { SOUNDS, soundName, type SoundInfo } from './sounds'
import { isPlaying, statusText, type PlayerAction, type PlayerState } from './state'
import { dispatch, usePlayerState } from './store'

const NO_AUDIO = "This browser can't play generated sound. Try a recent Chrome, Safari or Firefox."

const percent = (v: number) => `${Math.round(v * 100)} percent`

/**
 * The Sounds screen: a grid of sounds, each with its own volume, above a
 * player bar with one big play/pause button within reach of your thumb. On
 * short landscape screens the bar moves to the right-hand side.
 */
export function Player() {
  const state = usePlayerState()
  const [error, setError] = useState<string | null>(null)

  const act = (action: PlayerAction) => {
    setError(null)
    dispatch(action).catch(() => setError(NO_AUDIO))
  }

  // Space toggles play/pause when nothing else has focus (buttons and
  // sliders keep their own Space behaviour).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      if (t && t !== document.body && t.id !== 'main' && t.closest('button, input, select, textarea, a, [contenteditable]')) return
      e.preventDefault()
      setError(null)
      dispatch({ type: 'playPause' }).catch(() => setError(NO_AUDIO))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="ss-player">
      <div className="ss-player-main">
        <PageHeader title="Sounds" />
        <ul className="ss-grid" aria-label="Sounds">
          {SOUNDS.map((sound) => (
            <SoundTile key={sound.kind} sound={sound} state={state} act={act} />
          ))}
        </ul>
        {state.active.includes('binaural') && <BinauralSettings state={state} act={act} />}
        {error && (
          <p role="alert" className="ss-alert">
            {error}
          </p>
        )}
        <PlaybackCard />
      </div>
      <PlayerBar state={state} act={act} />
    </div>
  )
}

interface Props {
  state: PlayerState
  act: (action: PlayerAction) => void
}

function SoundTile({ sound, state, act }: Props & { sound: SoundInfo }) {
  const on = state.active.includes(sound.kind)
  const audible = on && !state.paused
  const volume = state.volumes[sound.kind]
  return (
    <li
      className="ss-tile"
      data-on={on || undefined}
      data-audible={audible || undefined}
      style={{ '--tint': sound.tint } as CSSProperties}
    >
      <button
        type="button"
        className="ss-tile-toggle"
        aria-pressed={on}
        onClick={() => act({ type: 'toggle', kind: sound.kind })}
      >
        <span className="ss-tile-icon">
          <SoundIcon kind={sound.kind} />
        </span>
        <span className="ss-tile-text">
          <span className="ss-tile-name">{sound.name}</span>
          <span className="ss-tile-note">{sound.note ?? (on ? (state.paused ? 'Paused' : 'Playing') : 'Off')}</span>
        </span>
        <span className="ss-tile-dot" aria-hidden="true" />
      </button>
      <Range
        label={`${sound.name} volume`}
        value={volume}
        min={0}
        max={1}
        step={0.01}
        valueText={percent(volume)}
        onChange={(value) => act({ type: 'volume', kind: sound.kind, value })}
      />
    </li>
  )
}

function PlayerBar({ state, act }: Props) {
  const playing = isPlaying(state)
  const master = state.muted ? 0 : state.master
  return (
    <section className="ss-bar" aria-label="Player">
      <div className="ss-bar-top">
        <p className="ss-status" role="status" aria-live="polite">
          {statusText(state)}
        </p>
        <SleepTimerButton />
      </div>
      <div className="ss-bar-buttons">
        <button
          type="button"
          className="ss-round"
          aria-label="Stop and clear the mix"
          title="Stop"
          disabled={state.active.length === 0}
          onClick={() => act({ type: 'stop' })}
        >
          <StopIcon />
        </button>
        <button
          type="button"
          className="ss-play"
          data-playing={playing || undefined}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-keyshortcuts="Space"
          onClick={() => act({ type: 'playPause' })}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="ss-round"
          aria-label="Mute"
          aria-pressed={state.muted}
          title={state.muted ? 'Unmute' : 'Mute'}
          onClick={() => act({ type: 'mute' })}
        >
          <VolumeIcon muted={state.muted} size={22} />
        </button>
      </div>
      <div className="ss-master">
        <VolumeIcon muted={master === 0} />
        <Range
          label="Master volume"
          value={master}
          min={0}
          max={1}
          step={0.01}
          valueText={percent(master)}
          onChange={(value) => act({ type: 'master', value })}
        />
      </div>
    </section>
  )
}

function BinauralSettings({ state, act }: Props) {
  const id = useId()
  return (
    <section className="ss-card" aria-labelledby={id} style={{ '--tint': 'var(--warning)' } as CSSProperties}>
      <div className="ss-card-head">
        <h2 id={id} className="ss-card-title">
          {soundName('binaural')}
        </h2>
        <span className="ss-card-value tabular-nums">{formatBeat(state.beat)}</span>
      </div>
      <p className="ss-note" role="note">
        <HeadphonesIcon />
        <span>
          <strong>Wear headphones.</strong> Each ear gets its own soft tone and the beat comes from
          the difference, so through a speaker you'll only hear a steady hum. Keep the volume low.
        </span>
      </p>
      <Range
        label="Beat frequency"
        value={state.beat}
        min={MIN_BEAT_HZ}
        max={MAX_BEAT_HZ}
        step={0.5}
        valueText={formatBeat(state.beat).replace('Hz', 'hertz')}
        onChange={(hz) => act({ type: 'beat', hz })}
      />
    </section>
  )
}

function Range({
  label,
  value,
  min,
  max,
  step,
  valueText,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  valueText: string
  onChange: (value: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      className="ss-range"
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--fill': `${fill}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}
