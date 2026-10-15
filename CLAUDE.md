# sleepsounds

Sleep Sounds: a white-noise and sleep-sound generator on FreeAppStore, every sound generated
with Web Audio. Currently a "Coming soon" shell (Sounds, Mixes, About); see
freeappstore-online/platform#162.

- Live: https://sleepsounds.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
