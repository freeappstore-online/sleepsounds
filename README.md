# Sleep Sounds

**White noise and sleep sounds, generated on your device.** A free app on
[FreeAppStore](https://freeappstore.online), live at https://sleepsounds.freeappstore.online.

Mix rain, ocean, stream, wind, fireplace, fan, white/pink/brown noise and binaural beats, each
with its own volume. Saved mixes and a sleep timer are on the way. Progress is tracked in
[freeappstore-online/platform#162](https://github.com/freeappstore-online/platform/issues/162).

## Develop

```bash
pnpm install
pnpm dev      # local dev server
pnpm build    # production build in web/dist
pnpm test     # unit tests (audio engine)
fas check     # FreeAppStore compliance checks
```

Pushes to `main` auto-deploy via GitHub Actions.

## License

MIT.
