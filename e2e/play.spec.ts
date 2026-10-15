import { bigButton, expect, open, soundIsRunning, status, test, tile } from './fixtures'

test.describe('play and pause', () => {
  test('tapping a sound starts real audio', async ({ page }) => {
    await open(page)
    await expect(status(page)).toHaveText('Tap a sound to begin')
    await tile(page, 'Rain').click()
    await expect(tile(page, 'Rain')).toHaveAttribute('aria-pressed', 'true')
    await expect(status(page)).toHaveText('Playing: Rain')
    await expect(bigButton(page)).toHaveAccessibleName('Pause')
    await expect.poll(() => soundIsRunning(page)).toBe(true)
  })

  test('the big button pauses and resumes the mix', async ({ page }) => {
    await open(page)
    await tile(page, 'Rain').click()
    await bigButton(page).click()
    await expect(status(page)).toHaveText('Paused: Rain')
    await expect(bigButton(page)).toHaveAccessibleName('Play')
    // The sound stays chosen while paused.
    await expect(tile(page, 'Rain')).toHaveAttribute('aria-pressed', 'true')
    await bigButton(page).click()
    await expect(status(page)).toHaveText('Playing: Rain')
  })

  test('play with nothing chosen starts rain', async ({ page }) => {
    await open(page)
    await bigButton(page).click()
    await expect(status(page)).toHaveText('Playing: Rain')
    await expect.poll(() => soundIsRunning(page)).toBe(true)
  })

  test('Space toggles play/pause from the keyboard', async ({ page }) => {
    await open(page)
    await tile(page, 'Ocean').click()
    // Move focus off the tile so Space reaches the page, not the button.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Space')
    await expect(status(page)).toHaveText('Paused: Ocean')
    await page.keyboard.press('Space')
    await expect(status(page)).toHaveText('Playing: Ocean')
  })

  test('tiles work from the keyboard', async ({ page }) => {
    await open(page)
    await tile(page, 'Wind').focus()
    await page.keyboard.press('Enter')
    await expect(tile(page, 'Wind')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Space')
    await expect(tile(page, 'Wind')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the mix comes back paused after a reload, never playing by itself', async ({ page }) => {
    await open(page)
    await tile(page, 'Fireplace').click()
    await page.reload({ waitUntil: 'networkidle' })
    await expect(status(page)).toHaveText('Paused: Fireplace')
    expect(await page.evaluate(() => window.__audio.contexts.length)).toBe(0)
  })
})
