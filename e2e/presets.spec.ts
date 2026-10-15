import type { Page } from '@playwright/test'
import { bigButton, expect, navTo, open, soundIsRunning, status, test, tile } from './fixtures'

const nameField = (page: Page) => page.getByLabel('Save the current mix')
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })
const presetNames = (page: Page) => page.locator('.ss-preset-name')

/** Turn on some sounds, then go to Mixes in-app. */
async function makeMix(page: Page, sounds: string[], rainVolume?: string) {
  await open(page)
  for (const s of sounds) await tile(page, s).click()
  if (rainVolume) await page.getByRole('slider', { name: 'Rain volume' }).fill(rainVolume)
  await navTo(page, 'Mixes')
}

test.describe('presets', () => {
  test('nothing to save until a sound is on', async ({ page }) => {
    await open(page, '/mixes')
    await expect(saveButton(page)).toBeDisabled()
    await expect(page.getByText('No saved mixes yet.')).toBeVisible()
    await page.getByRole('link', { name: 'Choose some sounds' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Sounds', level: 1 })).toBeVisible()
  })

  test('save, load, rename and delete a mix; it survives a reload', async ({ page }) => {
    await makeMix(page, ['Rain', 'Fan'], '0.35')
    await nameField(page).fill('  Rainy   night ')
    await saveButton(page).click()
    await expect(presetNames(page)).toHaveText(['Rainy night'])
    await expect(page.locator('.ss-preset-sounds')).toContainText('Rain and Fan')

    // Saving under the same name (any case) updates instead of duplicating.
    await nameField(page).fill('RAINY NIGHT')
    await saveButton(page).click()
    await expect(presetNames(page)).toHaveCount(1)

    await page.reload({ waitUntil: 'networkidle' })
    await expect(presetNames(page)).toHaveText(['RAINY NIGHT'])

    // Load it over a different mix: exactly its sounds and volumes, playing.
    await navTo(page, 'Sounds')
    await page.getByRole('button', { name: 'Stop and clear the mix' }).click()
    await tile(page, 'Ocean').click()
    await page.getByRole('slider', { name: 'Rain volume' }).fill('0.9')
    await navTo(page, 'Mixes')
    await page.getByRole('button', { name: 'Play RAINY NIGHT' }).click()
    await expect(page.getByRole('button', { name: 'Pause RAINY NIGHT' })).toBeVisible()
    await expect.poll(() => soundIsRunning(page)).toBe(true)
    await navTo(page, 'Sounds')
    await expect(status(page)).toHaveText('Playing: Rain and Fan')
    await expect(page.getByRole('slider', { name: 'Rain volume' })).toHaveValue('0.35')
    await expect(tile(page, 'Ocean')).toHaveAttribute('aria-pressed', 'false')

    await navTo(page, 'Mixes')
    await page.getByRole('button', { name: 'Rename RAINY NIGHT' }).click()
    await page.getByLabel('New name for RAINY NIGHT').fill('Soft rain')
    await page.keyboard.press('Enter')
    await expect(presetNames(page)).toHaveText(['Soft rain'])

    await page.getByRole('button', { name: 'Delete Soft rain' }).click()
    await expect(page.getByText('Delete “Soft rain”?')).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(presetNames(page)).toHaveCount(0)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(presetNames(page)).toHaveCount(0)
  })

  test("a preset's button pauses and resumes it", async ({ page }) => {
    await makeMix(page, ['Stream'])
    await nameField(page).fill('Brook')
    await saveButton(page).click()
    await page.getByRole('button', { name: 'Pause Brook' }).click()
    await expect(page.getByRole('button', { name: 'Play Brook' })).toBeVisible()
    await navTo(page, 'Sounds')
    await expect(bigButton(page)).toHaveAccessibleName('Play')
    await navTo(page, 'Mixes')
    await page.getByRole('button', { name: 'Play Brook' }).click()
    await expect(page.getByRole('button', { name: 'Pause Brook' })).toBeVisible()
  })

  test('explains a missing name and a duplicate rename', async ({ page }) => {
    await makeMix(page, ['Rain'])
    await nameField(page).fill('   ')
    await saveButton(page).click()
    await expect(page.getByRole('alert')).toHaveText('Give the mix a name.')
    await nameField(page).fill('One')
    await saveButton(page).click()
    await nameField(page).fill('Two')
    await saveButton(page).click()
    await page.getByRole('button', { name: 'Rename Two' }).click()
    await page.getByLabel('New name for Two').fill('one')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText('You already have a mix called "One".')
    await page.keyboard.press('Escape')
    await expect(presetNames(page)).toHaveText(['Two', 'One'])
  })

  test('says mixes are saved on this device when signed out', async ({ page }) => {
    await open(page, '/mixes')
    await expect(page.locator('.ss-sync')).toContainText('Saved on this device')
  })
})
