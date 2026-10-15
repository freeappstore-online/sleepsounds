import { readFileSync } from 'node:fs'
import { expect, navTo, open, test, tile } from './fixtures'

// Privacy and launch copy. The live host's edge injects Cloudflare Web
// Analytics; the app itself must only ever talk to the FreeAppStore platform.

const ALLOWED_HOSTS = new Set(['localhost', 'api.freeappstore.online'])

test('About discloses what is and isn’t collected, including Cloudflare Web Analytics', async ({ page }) => {
  await open(page, '/about')
  const privacy = page.getByRole('region', { name: 'Privacy' })
  await expect(privacy).toContainText('never uses your microphone')
  await expect(privacy).toContainText('Nothing is recorded or uploaded')
  await expect(privacy).toContainText('without cookies')
  await expect(privacy).toContainText('Cloudflare Web Analytics')
  await expect(privacy).toContainText('static.cloudflareinsights.com')
  await expect(privacy).toContainText('IP address')
})

test('the app itself contacts only the FreeAppStore platform', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.protocol.startsWith('http')) hosts.add(url.hostname)
  })
  await open(page)
  await tile(page, 'Rain').click()
  await navTo(page, 'Mixes')
  await navTo(page, 'About')
  expect([...hosts].filter((h) => !ALLOWED_HOSTS.has(h))).toEqual([])
})

test('launch copy is the same everywhere and nothing says "coming soon"', async ({ page }) => {
  const line = 'White noise, rain, ocean and more, generated on your device'
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const manifest = JSON.parse(readFileSync('web/public/manifest.json', 'utf8'))
  expect(pkg.description).toBe(line)
  expect(manifest.description).toBe(line)
  await open(page)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', line)
  for (const path of ['/', '/mixes', '/about']) {
    await open(page, path)
    await expect(page.locator('body')).not.toContainText(/coming soon/i)
  }
})
