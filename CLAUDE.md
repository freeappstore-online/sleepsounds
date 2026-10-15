# sleepsounds

Sleep Sounds: a white-noise and sleep-sound generator on FreeAppStore, every sound generated
with Web Audio. Sounds (player: sound grid, per-sound volume, play/pause, sleep timer, background playback), Mixes (saved presets, local + fas.kv sync), About; see
freeappstore-online/platform#162.

- Live: https://sleepsounds.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test` (vitest; audio engine, player state, presets + sync, sleep timer)
- E2E: `pnpm e2e` (builds, then Playwright in `e2e/`: play, mix, presets, timer, background, offline, a11y)
- Check: `fas check`; layout: `pnpm build && fas screencheck --skip-build` (the screen must never scroll; screens scroll inside the app frame)
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way. On the live host the
  platform edge also injects Cloudflare Web Analytics (static.cloudflareinsights.com);
  About > Privacy discloses both.

- Audio lives in `web/src/audio/`: pure generators (no Web Audio, unit-tested) run inside an
  AudioWorklet (`worklet.ts`); `engine.ts` owns the AudioContext, master gain and per-sound
  fades. Every gain change is a ramp. No audio files and no looped buffers.

- Lock-screen controls and background play rely on a silent generated `<audio>` element plus
  Media Session (`web/src/player/background.ts`); iOS limits are stated in the UI. Device
  checklist: `docs/background-playback.md`.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
