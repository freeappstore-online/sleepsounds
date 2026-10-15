import { expect, open, soundIsRunning, status, test, tile } from './fixtures'

test.describe('offline', () => {
  test('after one visit the app and its sounds work with no network', async ({ page, context }) => {
    await open(page)
    // Wait for the service worker to install and take control of the page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
      }
    })

    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Sounds', level: 1 })).toBeVisible()
    await tile(page, 'Rain').click()
    await expect(status(page)).toHaveText('Playing: Rain')
    // The audio worklet itself came from the cache.
    await expect.poll(() => soundIsRunning(page)).toBe(true)

    // Other screens load offline too (SPA fallback).
    await page.goto('/about', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'About', level: 1 })).toBeVisible()
    await context.setOffline(false)
  })
})
