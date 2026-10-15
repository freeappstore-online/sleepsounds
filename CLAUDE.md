# sleepsounds

Sleep Sounds: a white-noise and sleep-sound generator on FreeAppStore, every sound generated
with Web Audio. In development (Sounds, Mixes, About; only binaural beats are wired into the UI so far); see
freeappstore-online/platform#162.

- Live: https://sleepsounds.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test` (vitest; audio engine unit tests)
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.

- Audio lives in `web/src/audio/`: pure generators (no Web Audio, unit-tested) run inside an
  AudioWorklet (`worklet.ts`); `engine.ts` owns the AudioContext, master gain and per-sound
  fades. Every gain change is a ramp. No audio files and no looped buffers.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
