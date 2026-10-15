import { type CSSProperties, type FormEvent, useId, useState } from 'react'
import { useAuth } from '@freeappstore/sdk/hooks'
import { ConfirmDialog, PageHeader, useToast } from '@freeappstore/sdk/ui'
import { fas } from '../fas'
import { PauseIcon, PencilIcon, PlayIcon, SoundIcon, TrashIcon } from './icons'
import { MAX_NAME_LENGTH, type Preset, isCurrent, presetSummary } from './presets'
import { presetStore, usePresets } from './presetsApp'
import type { SyncStatus } from './presetStore'
import { soundInfo } from './sounds'
import { isPlaying, listNames, type PlayerAction } from './state'
import { dispatch, usePlayerState } from './store'

const NO_AUDIO = "This browser can't play generated sound. Try a recent Chrome, Safari or Firefox."

/** The Mixes screen: save the current mix under a name, and play saved ones. */
export function Mixes({ onOpenSounds }: { onOpenSounds: () => void }) {
  const { presets, status } = usePresets()
  const { user } = useAuth(fas)
  const [error, setError] = useState<string | null>(null)

  const act = (action: PlayerAction) => {
    setError(null)
    dispatch(action).catch(() => setError(NO_AUDIO))
  }

  return (
    <>
      <PageHeader title="Mixes" description="Save the sounds you like together and come back to them." />
      <SaveMix onOpenSounds={onOpenSounds} />
      <SyncLine status={status} signedIn={!!user} />
      {error && (
        <p role="alert" className="ss-alert">
          {error}
        </p>
      )}
      {presets.length === 0 ? (
        <p className="ss-card text-[var(--muted)]">
          No saved mixes yet. Turn on a few sounds, set their volumes, then name the mix above to keep
          it.
        </p>
      ) : (
        <ul className="ss-presets" aria-label="Saved mixes">
          {presets.map((preset) => (
            <PresetRow key={preset.id} preset={preset} act={act} signedIn={!!user} />
          ))}
        </ul>
      )}
    </>
  )
}

function SaveMix({ onOpenSounds }: { onOpenSounds: () => void }) {
  const state = usePlayerState()
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const empty = state.active.length === 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = presetStore.save(name, state)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setName('')
    toast.show(`${result.replaced ? 'Updated' : 'Saved'} “${result.preset.name}”`, { variant: 'success' })
  }

  return (
    <form className="ss-card ss-save" onSubmit={submit}>
      <label htmlFor={inputId} className="ss-card-title">
        Save the current mix
      </label>
      {empty ? (
        <p className="ss-save-empty">
          Nothing in the mix yet.{' '}
          <a
            href="/"
            className="underline"
            onClick={(e) => {
              e.preventDefault()
              onOpenSounds()
            }}
          >
            Choose some sounds
          </a>
          , then come back to save them.
        </p>
      ) : (
        <p className="ss-save-mix">
          <span className="ss-chips" aria-hidden="true">
            {state.active.map((kind) => (
              <SoundChip key={kind} kind={kind} />
            ))}
          </span>
          <span>{listNames(state.active)}</span>
        </p>
      )}
      <div className="ss-save-row">
        <input
          id={inputId}
          className="ss-input"
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Name, e.g. Rainy night"
          autoComplete="off"
          enterKeyHint="done"
          disabled={empty}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        <button type="submit" className="ss-button" disabled={empty}>
          Save
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="ss-alert">
          {error}
        </p>
      )}
    </form>
  )
}

function SyncLine({ status, signedIn }: { status: SyncStatus; signedIn: boolean }) {
  let text: string
  if (!signedIn || status === 'local') text = 'Saved on this device. Sign in to have your mixes on all your devices.'
  else if (status === 'syncing') text = 'Syncing with your account…'
  else if (status === 'error') text = "Couldn't sync just now. Your mixes are still saved on this device."
  else text = 'Synced with your account.'
  return (
    <p className="ss-sync" role="status">
      <span className="ss-sync-dot" data-status={signedIn ? status : 'local'} aria-hidden="true" />
      <span>{text}</span>
      {signedIn && status === 'error' && (
        <button type="button" className="ss-link" onClick={() => void presetStore.sync()}>
          Try again
        </button>
      )}
    </p>
  )
}

function PresetRow({ preset, act, signedIn }: { preset: Preset; act: (a: PlayerAction) => void; signedIn: boolean }) {
  const state = usePlayerState()
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const current = isCurrent(preset, state)
  const playing = current && isPlaying(state)
  const tint = soundInfo(preset.sounds[0].kind).tint

  const play = () => {
    if (current && state.active.length > 0) act({ type: 'playPause' })
    else act({ type: 'load', sounds: preset.sounds, beat: preset.beat })
  }

  return (
    <li className="ss-preset" data-current={current || undefined} style={{ '--tint': tint } as CSSProperties}>
      <button
        type="button"
        className="ss-preset-play"
        aria-label={`${playing ? 'Pause' : 'Play'} ${preset.name}`}
        onClick={play}
      >
        {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
      </button>
      <div className="ss-preset-body">
        {renaming ? (
          <RenameForm preset={preset} onDone={() => setRenaming(false)} />
        ) : (
          <>
            <p className="ss-preset-name">{preset.name}</p>
            <p className="ss-preset-sounds">
              <span className="ss-chips" aria-hidden="true">
                {preset.sounds.map((s) => (
                  <SoundChip key={s.kind} kind={s.kind} />
                ))}
              </span>
              <span>
                {presetSummary(preset)}
                {playing ? ' · Playing' : ''}
              </span>
            </p>
          </>
        )}
      </div>
      {!renaming && (
        <div className="ss-preset-actions">
          <button
            type="button"
            className="ss-icon-button"
            aria-label={`Rename ${preset.name}`}
            title="Rename"
            onClick={() => setRenaming(true)}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="ss-icon-button"
            aria-label={`Delete ${preset.name}`}
            title="Delete"
            onClick={() => setConfirming(true)}
          >
            <TrashIcon />
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Delete “${preset.name}”?`}
        message={
          signedIn
            ? 'This removes the mix from all your devices. The sounds themselves stay.'
            : 'This removes the saved mix. The sounds themselves stay.'
        }
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          presetStore.remove(preset.id)
        }}
      />
    </li>
  )
}

function RenameForm({ preset, onDone }: { preset: Preset; onDone: () => void }) {
  const [name, setName] = useState(preset.name)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = presetStore.rename(preset.id, name)
    if (result.ok) onDone()
    else setError(result.error)
  }
  return (
    <form className="ss-rename" onSubmit={submit}>
      <div className="ss-save-row">
        <input
          className="ss-input"
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          aria-label={`New name for ${preset.name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoFocus
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onDone()
          }}
        />
        <button type="submit" className="ss-button">
          Save
        </button>
        <button type="button" className="ss-link" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="ss-alert">
          {error}
        </p>
      )}
    </form>
  )
}

function SoundChip({ kind }: { kind: Preset['sounds'][number]['kind'] }) {
  return (
    <span className="ss-chip" style={{ '--tint': soundInfo(kind).tint } as CSSProperties}>
      <SoundIcon kind={kind} size={14} />
    </span>
  )
}
