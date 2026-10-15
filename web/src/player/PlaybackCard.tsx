import { useId } from 'react'
import { ios, setKeepAwake, supportsWakeLock, useKeepAwake } from './backgroundApp'

/**
 * How playback behaves with the screen locked, said plainly per platform,
 * and the "keep screen on" switch. iOS gets the honest version: Safari may
 * pause web audio when the phone locks, whatever the app does.
 */
export function PlaybackCard() {
  const keepAwake = useKeepAwake()
  const id = useId()
  return (
    <section className="ss-card ss-playback" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="ss-card-title">
        Playing through the night
      </h2>
      {ios ? (
        <p className="ss-playback-text">
          On iPhone and iPad, Safari may pause the sound when the screen locks or you switch apps, and
          the lock-screen controls don't always appear. That's a limit of web apps on iOS, not
          something Sleep Sounds can switch off. For a night without gaps, leave Sleep Sounds open
          with the screen on and the brightness down.
        </p>
      ) : (
        <p className="ss-playback-text">
          Sound keeps playing when the screen locks or you switch apps. Play, pause and stop are on
          the lock screen and in the notifications. Closing the app stops the sound.
        </p>
      )}
      {supportsWakeLock ? (
        <label className="ss-switch-row" htmlFor={id}>
          <span>
            <span className="ss-switch-label">Keep the screen on while playing</span>
            <span className="ss-switch-hint">
              {ios ? 'Recommended on iPhone and iPad.' : 'Uses more battery; turn the brightness down.'}
            </span>
          </span>
          <input
            id={id}
            type="checkbox"
            role="switch"
            className="ss-switch"
            checked={keepAwake}
            onChange={(e) => setKeepAwake(e.target.checked)}
          />
        </label>
      ) : (
        <p className="ss-switch-hint">
          This browser can't keep the screen on for you. {ios ? 'Try setting Auto-Lock to Never while you sleep.' : ''}
        </p>
      )}
    </section>
  )
}
