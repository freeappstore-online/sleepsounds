import type { Page } from '@playwright/test'
import { bigButton, expect, open, status, test, tile } from './fixtures'

const MIN = 60_000
const pill = (page: Page) => page.locator('.ss-timer-pill')

async function setTimer(page: Page, label: string) {
  await pill(page).click()
  await page.getByRole('button', { name: label, exact: true }).click()
}

test.describe('sleep timer', () => {
  // A fake clock: minutes pass in an instant.
  test.beforeEach(async ({ page }) => {
    await page.clock.install()
  })

  test('counts down, fades for the last minute, then pauses the mix', async ({ page }) => {
    await open(page)
    await tile(page, 'Rain').click()
    await expect(pill(page)).toHaveAccessibleName('Set sleep timer')
    await setTimer(page, '15 min')

    await page.clock.runFor(2000)
    await expect(pill(page)).toHaveText(/^14:5\d$/)
    await expect(pill(page)).toHaveAccessibleName('Sleep timer: 15 minutes left. Change')

    await page.clock.runFor(10 * MIN)
    await expect(pill(page)).toHaveText(/^4:5\d$/)

    await page.clock.runFor(4 * MIN + 20_000)
    await expect(pill(page)).toHaveText(/^Fading · 0:3\d$/)
    await expect(bigButton(page)).toHaveAccessibleName('Pause')

    await page.clock.runFor(45_000)
    await expect(pill(page)).toHaveText('Timer')
    await expect(bigButton(page)).toHaveAccessibleName('Play')
    await expect(status(page)).toHaveText('Paused: Rain')
  })

  test('survives a reload', async ({ page }) => {
    await open(page)
    await setTimer(page, '1 h')
    await page.clock.runFor(5 * MIN)
    await page.reload({ waitUntil: 'networkidle' })
    await page.clock.runFor(1500)
    await expect(pill(page)).toHaveText(/^5[45]:\d\d$/)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sleepsounds:timer') ?? 'null'))
    expect(saved.durationMs).toBe(60 * MIN)
  })

  test('catches up at once after the page was frozen (screen locked)', async ({ page }) => {
    await open(page)
    await tile(page, 'Fan').click()
    await setTimer(page, '15 min')
    // Jump the clock without running timers, as a locked phone would.
    await page.clock.setSystemTime(Date.now() + 20 * MIN)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(bigButton(page)).toHaveAccessibleName('Play')
    await expect(pill(page)).toHaveText('Timer')
  })

  test('custom time, adding time and turning it off', async ({ page }) => {
    await open(page)
    await pill(page).click()
    const custom = page.getByLabel('Custom time')
    await custom.fill('soon')
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('alert')).toContainText('between 1 minute and 12 hours')
    await custom.fill('1:30')
    await page.getByRole('button', { name: 'Start' }).click()
    await page.clock.runFor(1500)
    await expect(pill(page)).toHaveText(/^1:29:5\d$/)

    await pill(page).click()
    await expect(page.getByRole('timer')).toHaveText(/^1:29:5\d$/)
    await page.getByRole('button', { name: '+15 min' }).click()
    await expect(page.getByRole('timer')).toHaveText(/^1:44:5\d$/)
    await page.getByRole('button', { name: 'Turn off' }).click()
    await expect(pill(page)).toHaveText('Timer')
    expect(await page.evaluate(() => localStorage.getItem('sleepsounds:timer'))).toBe('null')
  })

  test('the dialog is a centred modal and closes with Escape', async ({ page }) => {
    await open(page)
    await pill(page).click()
    await expect(page.getByText('Stop after')).toBeVisible()
    const dialog = page.getByRole('dialog', { name: 'Sleep timer' })
    const box = (await dialog.boundingBox())!
    const view = page.viewportSize()!
    expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThan(2)
    expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThan(2)
    await page.keyboard.press('Escape')
    await expect(page.getByText('Stop after')).toBeHidden()
  })
})
