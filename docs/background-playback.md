# Background playback: manual checklist

Lock-screen behaviour can't be tested in a headless browser, so check it on
real devices before a release. The logic behind it (Media Session actions,
the silent keep-alive, Wake Lock, closing the app) is unit-tested in
`web/src/player/background.test.ts`.

## How it works

- While the mix plays, a silent `<audio>` element plays alongside it. It is a
  WAV generated in code (`silentWav`), so no file is downloaded. Browsers only
  give lock-screen controls and background time to pages playing a media
  element, which Web Audio alone doesn't count as.
- The Media Session API puts the mix's name on the lock screen and wires
  play, pause and stop to the player. Pause keeps the mix; stop clears it.
- On Safari 16.4+ the audio session is set to `playback`, so sound plays
  through the silent switch.
- "Keep the screen on while playing" holds a screen Wake Lock. It's on by
  default on iOS, where it's the reliable way to get a full night, and it's
  taken again when the app comes back into view.
- Leaving or closing the page (`pagehide`) pauses the mix, so sound never
  carries on from a page you've left.
- When the app comes back into view it resumes audio the system suspended
  (for example after a phone call).

## Devices

Fill in one column per device and browser. ✓ = works, ✗ = doesn't, n/a.

| # | Check | Android Chrome | Android installed app | iPhone Safari | iPhone Home Screen app | Desktop Chrome |
|---|-------|---|---|---|---|---|
| 1 | Play Rain + Fan, lock the screen: sound continues for 10+ min | | | | | |
| 2 | Lock screen shows "Rain and Fan" with play/pause | | | | | |
| 3 | Lock-screen pause pauses; play resumes the same mix | | | | | |
| 4 | Stop (notification on Android) stops and clears the mix | | | | | |
| 5 | Switch to another app for 5 min: sound continues | | | | | |
| 6 | Android notification shade / iOS Control Centre show working controls | | | | | |
| 7 | Sleep timer (15 min) set, then locked: fades out and stops on time | | | | | |
| 8 | Keep screen on: screen stays on while playing, sleeps again when paused | | | | | |
| 9 | A phone call (or alarm) interrupts; after it ends, opening the app resumes sound | | | | | |
| 10 | Close the app / tab from the app switcher: sound stops at once | | | | | |
| 11 | Reopen: the mix is there, paused (never starts by itself) | | | | | |
| 12 | iPhone with the silent switch on: sound still plays | | | | | |

On iOS, ✗ for 1, 2, 5 or 6 is a known limit of web apps, and the app says
so in the "Playing through the night" card on the Sounds screen. If any of
these start working on newer iOS, soften that wording.
