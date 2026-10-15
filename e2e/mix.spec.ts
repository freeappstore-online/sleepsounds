import type { Page } from '@playwright/test'
import { bigButton, expect, open, soundIsRunning, status, test, tile } from './fixtures'

const volume = (page: Page, name: string) => page.getByRole('slider', { name: `${name} volume` })

test.describe('mixing sounds', () => {
  test('plays several sounds together', async ({ page }) => {
    await open(page)
    for (const name of ['Rain', 'Fireplace', 'Brown noise']) await tile(page, name).click()
    await expect(status(page)).toHaveText('Playing: Rain, Fireplace and Brown noise')
    await expect.poll(() => soundIsRunning(page, 3)).toBe(true)
  })

  test('each sound has its own volume, announced as a percentage', async ({ page }) => {
    await open(page)
    await tile(page, 'Rain').click()
    await tile(page, 'Fan').click()
    await volume(page, 'Rain').fill('0.3')
    await volume(page, 'Fan').fill('0.9')
    await expect(volume(page, 'Rain')).toHaveAttribute('aria-valuetext', '30 percent')
    await expect(volume(page, 'Fan')).toHaveAttribute('aria-valuetext', '90 percent')
    // Remembered after a reload.
    await page.reload({ waitUntil: 'networkidle' })
    await expect(volume(page, 'Rain')).toHaveValue('0.3')
    await expect(volume(page, 'Fan')).toHaveValue('0.9')
  })

  test('arrow keys adjust a volume', async ({ page }) => {
    await open(page)
    await volume(page, 'Stream').focus()
    const before = Number(await volume(page, 'Stream').inputValue())
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    expect(Number(await volume(page, 'Stream').inputValue())).toBeCloseTo(before - 0.02, 5)
  })

  test('turning one sound off leaves the rest playing', async ({ page }) => {
    await open(page)
    await tile(page, 'Rain').click()
    await tile(page, 'Wind').click()
    await tile(page, 'Rain').click()
    await expect(status(page)).toHaveText('Playing: Wind')
  })

  test('master volume and mute', async ({ page }) => {
    await open(page)
    await tile(page, 'Rain').click()
    const master = page.getByRole('slider', { name: 'Master volume' })
    await master.fill('0.5')
    await expect(master).toHaveAttribute('aria-valuetext', '50 percent')
    const mute = page.getByRole('button', { name: 'Mute' })
    await mute.click()
    await expect(mute).toHaveAttribute('aria-pressed', 'true')
    await expect(master).toHaveAttribute('aria-valuetext', '0 percent')
    await mute.click()
    await expect(master).toHaveAttribute('aria-valuetext', '50 percent')
  })

  test('stop clears the mix', async ({ page }) => {
    await open(page)
    await tile(page, 'Rain').click()
    await tile(page, 'Fan').click()
    const stop = page.getByRole('button', { name: 'Stop and clear the mix' })
    await stop.click()
    await expect(status(page)).toHaveText('Tap a sound to begin')
    await expect(tile(page, 'Rain')).toHaveAttribute('aria-pressed', 'false')
    await expect(stop).toBeDisabled()
    await expect(bigButton(page)).toHaveAccessibleName('Play')
  })

  test('binaural beats show the headphones note and an adjustable beat', async ({ page }) => {
    await open(page)
    await tile(page, 'Binaural beats').click()
    await expect(page.getByRole('note')).toContainText('Wear headphones')
    const beat = page.getByRole('slider', { name: 'Beat frequency' })
    await beat.fill('10')
    await expect(beat).toHaveAttribute('aria-valuetext', '10 hertz')
    await expect(page.locator('.ss-card-value')).toHaveText('10 Hz')
  })
})
