import type { Page } from '@playwright/test'
import { bigButton, expect, open, status, test, tile } from './fixtures'

// Real lock screens can't be driven from a headless browser (see
// docs/background-playback.md for the device checklist). These tests check
// what the app hands the browser: Media Session state, metadata and action
// handlers, the silent keep-alive, and stopping cleanly on close.

const session = (page: Page) =>
  page.evaluate(() => ({
    state: navigator.mediaSession.playbackState,
    title: navigator.mediaSession.metadata?.title ?? null,
    artist: navigator.mediaSession.metadata?.artist ?? null,
    handlers: Object.keys(window.__media).sort(),
  }))

const press = (page: Page, action: 'play' | 'pause' | 'stop') =>
  page.evaluate((a) => window.__media[a]?.(), action)

test.describe('background playback and lock-screen controls', () => {
  test('lock-screen controls are offered and show the mix', async ({ page }) => {
    await open(page)
    expect(await session(page)).toEqual({ state: 'none', title: null, artist: null, handlers: ['pause', 'play', 'stop'] })
    await tile(page, 'Rain').click()
    await tile(page, 'Fan').click()
    await expect.poll(() => session(page)).toMatchObject({ state: 'playing', title: 'Rain and Fan', artist: 'Sleep Sounds' })
  })

  test('lock-screen pause, play and stop drive the player', async ({ page }) => {
    await open(page)
    await tile(page, 'Rain').click()
    await press(page, 'pause')
    await expect(bigButton(page)).toHaveAccessibleName('Play')
    await expect.poll(async () => (await session(page)).state).toBe('paused')
    await press(page, 'play')
    await expect(bigButton(page)).toHaveAccessibleName('Pause')
    await expect.poll(async () => (await session(page)).state).toBe('playing')
    await press(page, 'stop')
    await expect(status(page)).toHaveText('Tap a sound to begin')
    await expect.poll(async () => (await session(page)).state).toBe('none')
  })

  test('a silent media element plays only while the mix does', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as Window & { __keepAlive?: HTMLMediaElement }
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        w.__keepAlive = this
        return play.call(this)
      }
    })
    await open(page)
    await tile(page, 'Stream').click()
    const keepAlivePaused = () =>
      page.evaluate(() => (window as Window & { __keepAlive?: HTMLMediaElement }).__keepAlive?.paused ?? null)
    await expect.poll(keepAlivePaused).toBe(false)
    expect(await page.evaluate(() => (window as Window & { __keepAlive?: HTMLMediaElement }).__keepAlive?.src.startsWith('blob:'))).toBe(true)
    await bigButton(page).click()
    await expect.poll(keepAlivePaused).toBe(true)
  })

  test('closing or leaving the app stops the sound and keeps the mix paused', async ({ page }) => {
    await open(page)
    await tile(page, 'Fireplace').click()
    await page.goto('about:blank')
    await open(page)
    await expect(status(page)).toHaveText('Paused: Fireplace')
  })

  test('the keep-screen-on switch is remembered', async ({ page }) => {
    await open(page)
    const toggle = page.getByRole('switch', { name: /Keep the screen on/ })
    await expect(toggle).not.toBeChecked()
    await toggle.check()
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('switch', { name: /Keep the screen on/ })).toBeChecked()
  })
})

test.describe('on iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  })

  test('says honestly that iOS may pause sound when locked, and keeps the screen on by default', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ss-playback-text')).toContainText('Safari may pause the sound when the screen locks')
    await expect(page.getByRole('switch', { name: /Keep the screen on/ })).toBeChecked()
  })
})
