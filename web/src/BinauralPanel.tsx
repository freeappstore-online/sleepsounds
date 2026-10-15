import { useId, useState } from 'react'
import { MAX_BEAT_HZ, MIN_BEAT_HZ, engine, formatBeat } from './audio'

// Binaural beats: play/stop, the beat frequency, a volume, and a clear
// note that it needs headphones. Wording stays descriptive: the app makes no
// claims about what binaural beats do.
export function BinauralPanel() {
  const [playing, setPlaying] = useState(() => engine.isPlaying('binaural'))
  const [beat, setBeat] = useState(() => engine.getBeat())
  const [volume, setVolume] = useState(() => engine.getVolume('binaural'))
  const [error, setError] = useState<string | null>(null)
  const beatId = useId()
  const volumeId = useId()

  // The tap itself unlocks audio, so this must run straight from the click.
  const toggle = () => {
    setError(null)
    engine.toggle('binaural').then(
      () => setPlaying(engine.isPlaying('binaural')),
      () => {
        setPlaying(false)
        setError("This browser can't play generated sound. Try a recent Chrome, Safari or Firefox.")
      },
    )
    // Show the new state straight away; the fade takes care of the sound.
    setPlaying(!playing)
  }

  return (
    <section
      aria-labelledby={`${beatId}-title`}
      className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id={`${beatId}-title`} className="display-font text-2xl">
            Binaural beats
          </h2>
          <p className="mt-1 text-[var(--muted)]">
            A soft tone in each ear, {formatBeat(beat)} apart, heard as a slow pulse.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          className="min-h-12 min-w-28 rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-white"
        >
          {playing ? 'Stop' : 'Play'}
        </button>
      </div>

      <div
        role="note"
        className="mt-4 flex gap-3 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--panel-strong)] p-3"
      >
        <HeadphonesIcon />
        <p>
          <strong>Wear headphones.</strong> Each ear gets its own tone and the beat comes from the
          difference, so through a speaker you'll only hear a steady hum. Keep the volume low and
          comfortable.
        </p>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="flex justify-between">
            <label htmlFor={beatId} className="font-semibold">
              Beat
            </label>
            <output htmlFor={beatId} className="tabular-nums">
              {formatBeat(beat)}
            </output>
          </div>
          <input
            id={beatId}
            type="range"
            min={MIN_BEAT_HZ}
            max={MAX_BEAT_HZ}
            step={0.5}
            value={beat}
            aria-valuetext={formatBeat(beat).replace('Hz', 'hertz')}
            onChange={(e) => {
              engine.setBeat(Number(e.target.value))
              setBeat(engine.getBeat())
            }}
            className="mt-2 w-full accent-[var(--accent)]"
          />
        </div>
        <div>
          <div className="flex justify-between">
            <label htmlFor={volumeId} className="font-semibold">
              Volume
            </label>
            <output htmlFor={volumeId} className="tabular-nums">
              {Math.round(volume * 100)}%
            </output>
          </div>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-valuetext={`${Math.round(volume * 100)} percent`}
            onChange={(e) => {
              engine.setVolume('binaural', Number(e.target.value))
              setVolume(engine.getVolume('binaural'))
            }}
            className="mt-2 w-full accent-[var(--accent)]"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[var(--danger)]">
          {error}
        </p>
      )}
    </section>
  )
}

function HeadphonesIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mt-0.5 h-6 w-6 shrink-0 text-[var(--accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
    </svg>
  )
}
