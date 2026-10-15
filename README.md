# Sleep Sounds

**White noise and sleep sounds, generated on your device.** A free app on
[FreeAppStore](https://freeappstore.online), live at https://sleepsounds.freeappstore.online.

Mix rain, ocean, stream, wind, fireplace, fan, white/pink/brown noise and binaural beats, each
with its own volume, save mixes by name (synced to your account when signed in), and set a sleep
timer that fades the sound out gently. Progress is tracked in
[freeappstore-online/platform#162](https://github.com/freeappstore-online/platform/issues/162).

## Develop

```bash
pnpm install
pnpm dev      # local dev server
pnpm build    # production build in web/dist
pnpm test     # unit tests (vitest)
pnpm e2e      # build + end-to-end and accessibility tests (Playwright)
fas check     # FreeAppStore compliance checks
```

Pushes to `main` auto-deploy via GitHub Actions.

## License

MIT.
