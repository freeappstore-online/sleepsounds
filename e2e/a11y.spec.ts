import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, navTo, open, test, tile, useTheme } from './fixtures'

// Accessibility audit: axe-core (WCAG 2.0/2.1/2.2 A and AA) on every screen
// and the main states in both themes, plus explicit touch-target, contrast
// and keyboard-focus checks.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// The top bar (logo, nav, text size, theme, Sign in) is the platform's
// shared Shell from @freeappstore/sdk, identical in every app and styled by
// the platform. Its Sign in button's text contrast is a platform issue, so
// the app's audit excludes the header and records its findings instead.
const PLATFORM_HEADER = 'body > div#root header'

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).exclude(PLATFORM_HEADER).analyze()
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  )
  expect(summary, `axe violations on ${label}`).toEqual([])
}

async function contrast(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).exclude(PLATFORM_HEADER).analyze()
  const bad = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary}`))
  expect(bad, `contrast failures on ${label}`).toEqual([])
}

/** Note (not fail) what axe finds in the platform's header. */
async function notePlatformHeader(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).include(PLATFORM_HEADER).analyze()
  for (const v of results.violations) {
    test.info().annotations.push({
      type: 'platform header',
      description: `${label}: ${v.id}: ${v.nodes.map((n) => n.failureSummary?.split('\n').at(-1)?.trim()).join('; ')}`,
    })
  }
}

/** Every visible control's tap area, in CSS pixels. */
async function targets(page: Page) {
  return page.evaluate(() => {
    const selector = 'button, a[href], input, select, textarea, [role="switch"], [role="button"], [tabindex="0"]'
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[aria-hidden="true"]')
      })
      .map((el) => {
        // Tapping a <label> works its input, so the label is the target.
        const area = (el.closest('label') ?? el).getBoundingClientRect()
        const inSentence = el.tagName === 'A' && !!el.closest('p') && (el.closest('p')?.textContent ?? '').trim() !== el.textContent?.trim()
        return {
          name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName.toLowerCase(),
          width: Math.round(area.width),
          height: Math.round(area.height),
          platformHeader: !!el.closest('header'),
          inSentence,
        }
      })
  })
}

async function touchTargets(page: Page, label: string) {
  const all = await targets(page)
  expect(all.length).toBeGreaterThan(0)
  // The app's own controls: 44×44 or larger (WCAG 2.5.5 enhanced).
  const small = all
    .filter((t) => !t.platformHeader && !t.inSentence)
    .filter((t) => t.width < 44 || t.height < 44)
    .map((t) => `${t.name}: ${t.width}×${t.height}`)
  expect(small, `targets under 44×44 on ${label}`).toEqual([])
  // The platform's shared header isn't ours to resize; hold it to the AA
  // minimum of 24×24 (WCAG 2.5.8).
  const tinyHeader = all
    .filter((t) => t.platformHeader)
    .filter((t) => t.width < 24 || t.height < 24)
    .map((t) => `${t.name}: ${t.width}×${t.height}`)
  expect(tinyHeader, `platform header targets under 24×24 on ${label}`).toEqual([])
}

const STATES: { name: string; setup: (page: Page) => Promise<void> }[] = [
  { name: 'Sounds', setup: (page) => open(page) },
  {
    name: 'Sounds, playing with binaural beats',
    setup: async (page) => {
      await open(page)
      await tile(page, 'Rain').click()
      await tile(page, 'Binaural beats').click()
    },
  },
  {
    name: 'Sleep timer dialog',
    setup: async (page) => {
      await open(page)
      await page.locator('.ss-timer-pill').click()
      await page.getByRole('button', { name: '30 min', exact: true }).click()
      await page.locator('.ss-timer-pill').click()
      await expect(page.getByRole('timer')).toBeVisible()
    },
  },
  { name: 'Mixes, empty', setup: (page) => open(page, '/mixes') },
  {
    name: 'Mixes, with a saved mix',
    setup: async (page) => {
      await open(page)
      await tile(page, 'Rain').click()
      await navTo(page, 'Mixes')
      await page.getByLabel('Save the current mix').fill('Night')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.locator('.ss-preset-name')).toHaveText(['Night'])
    },
  },
  {
    name: 'Delete confirmation',
    setup: async (page) => {
      await open(page)
      await tile(page, 'Fan').click()
      await navTo(page, 'Mixes')
      await page.getByLabel('Save the current mix').fill('Fan')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.getByRole('button', { name: 'Delete Fan' }).click()
      await expect(page.getByRole('dialog', { name: 'Delete “Fan”?' })).toBeVisible()
    },
  },
  { name: 'About', setup: (page) => open(page, '/about') },
]

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await useTheme(page, theme)
      // No animations mid-transition while measuring colours.
      await page.emulateMedia({ reducedMotion: 'reduce' })
    })

    for (const state of STATES) {
      test(state.name, async ({ page }) => {
        await state.setup(page)
        expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'light')).toBe(theme)
        // Let fades and dialog animations finish before checking colours.
        await page.waitForTimeout(700)
        await audit(page, `${state.name} (${theme})`)
        await contrast(page, `${state.name} (${theme})`)
        await touchTargets(page, `${state.name} (${theme})`)
        await notePlatformHeader(page, `${state.name} (${theme})`)
      })
    }
  })
}

test.describe('keyboard', () => {
  test('every stop in the tab order shows where focus is', async ({ page }) => {
    await open(page)
    const seen: string[] = []
    const missing: string[] = []
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        const cs = getComputedStyle(el)
        const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
        return { name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName, visible }
      })
      if (!info) continue
      seen.push(info.name)
      if (!info.visible) missing.push(info.name)
    }
    expect(seen.length).toBeGreaterThan(20)
    expect(missing, 'focused without a visible indicator').toEqual([])
  })

  test('the sounds grid, volumes and player are all reachable by Tab', async ({ page }) => {
    await open(page)
    const names = new Set<string>()
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const n = await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return ''
        const by = el.getAttribute('aria-labelledby')
        const labelled = by ? document.getElementById(by)?.textContent?.trim() : null
        return el.getAttribute('aria-label') || labelled || el.textContent?.trim() || ''
      })
      names.add(n)
    }
    for (const n of ['Rain', 'Rain volume', 'Binaural beats', 'Binaural beats volume', 'Play', 'Master volume', 'Set sleep timer']) {
      expect([...names], `tab order includes ${n}`).toContain(n)
    }
  })
})
