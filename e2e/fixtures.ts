// Shared e2e setup.
//
// - Requests leaving localhost are blocked, so runs never depend on (or
//   touch) the live platform API or analytics.
// - Any uncaught page error fails the test.
// - A probe installed before the app loads records every AudioContext and
//   worklet node, and the Media Session action handlers, so tests can check
//   that sound really started and press lock-screen buttons.

import { test as base, expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    __audio: { contexts: AudioContext[]; nodes: number }
    __media: Partial<Record<'play' | 'pause' | 'stop', () => void>>
  }
}

function probe() {
  const w = window
  w.__audio = { contexts: [], nodes: 0 }
  const NativeContext = w.AudioContext
  w.AudioContext = class extends NativeContext {
    constructor(options?: AudioContextOptions) {
      super(options)
      w.__audio.contexts.push(this)
    }
  }
  const NativeNode = w.AudioWorkletNode
  w.AudioWorkletNode = class extends NativeNode {
    constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
      super(context, name, options)
      w.__audio.nodes++
    }
  }
  w.__media = {}
  const session = navigator.mediaSession
  if (session) {
    const register = session.setActionHandler.bind(session)
    session.setActionHandler = (action, handler) => {
      w.__media[action as 'play' | 'pause' | 'stop'] = handler as () => void
      register(action, handler)
    }
  }
}

export const test = base.extend<{ pageErrors: string[] }>({
  context: async ({ context }, use) => {
    await context.route(
      (url) => url.hostname !== 'localhost' && url.protocol !== 'data:' && url.protocol !== 'blob:',
      (route) => route.abort(),
    )
    await context.addInitScript(probe)
    await use(context)
  },
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
      expect(errors, 'uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Open a screen and wait for the app to settle. */
export async function open(page: Page, path = '/') {
  await page.goto(path, { waitUntil: 'networkidle' })
}

/** True once an AudioContext is running and at least `nodes` sounds were created. */
export async function soundIsRunning(page: Page, nodes = 1) {
  return page.evaluate(
    (n) => window.__audio.contexts.some((c) => c.state === 'running') && window.__audio.nodes >= n,
    nodes,
  )
}

export const tile = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const bigButton = (page: Page) => page.locator('.ss-play')
export const status = (page: Page) => page.locator('.ss-status')

/** Set the stored theme before the app loads (the inline script reads it). */
export async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => localStorage.setItem('stores-theme', t), theme)
}

/**
 * Go to another screen through the app's own nav (no page load, so sound
 * keeps playing). On phones the nav sits behind the Menu button.
 */
export async function navTo(page: Page, name: 'Sounds' | 'Mixes' | 'About') {
  const nav = page.getByRole('navigation', { name: 'Main' })
  const link = nav.getByRole('link', { name, exact: true })
  if (!(await link.isVisible())) await nav.getByRole('button', { name: 'Menu' }).click()
  await link.click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}
