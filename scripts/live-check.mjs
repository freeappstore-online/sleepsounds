// Live launch check against the deployed app (default
// https://sleepsounds.freeappstore.online), in Chromium at phone width, in
// light and dark themes. Unlike the e2e suite this hits the real host and
// records the app's actual audio output, so it can show sound is produced
// and that starting and stopping don't click.
//
//   node scripts/live-check.mjs [url]       (or: pnpm live-check)
//
// Prints a JSON report and saves screenshots to live-check-out/. Exits 1 if
// any check fails.

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const URL_BASE = process.argv[2] ?? 'https://sleepsounds.freeappstore.online'
const OUT = 'live-check-out'
mkdirSync(OUT, { recursive: true })

const SOUNDS = ['Rain', 'Ocean', 'Stream', 'Wind', 'Fireplace', 'Fan', 'White noise', 'Pink noise', 'Brown noise', 'Binaural beats']

// Runs in the page before the app. Taps whatever the app connects to the
// speakers, so every output sample can be analysed. The tap is a
// ScriptProcessorNode: it needs no module to load, so the live host's CSP
// (no blob: worklets) doesn't apply, and it feeds a muted gain, so it adds
// nothing to what's heard.
function recorderProbe() {
  const w = window
  w.__rec = { on: false, chunks: [], sampleRate: 0, tapped: false }
  w.__media = {}
  const session = navigator.mediaSession
  if (session) {
    const register = session.setActionHandler.bind(session)
    session.setActionHandler = (a, h) => {
      w.__media[a] = h
      register(a, h)
    }
  }
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (dest, ...rest) {
    const result = connect.call(this, dest, ...rest)
    if (dest instanceof AudioDestinationNode && !w.__rec.tapped) {
      w.__rec.tapped = true
      const ctx = this.context
      w.__rec.sampleRate = ctx.sampleRate
      const tap = ctx.createScriptProcessor(2048, 2, 1)
      tap.onaudioprocess = (e) => {
        if (w.__rec.on) w.__rec.chunks.push(e.inputBuffer.getChannelData(0).slice(0))
      }
      const mute = ctx.createGain()
      mute.gain.value = 0
      connect.call(this, tap)
      connect.call(tap, mute)
      connect.call(mute, dest)
    }
    return result
  }
}

// Page-side helpers for recording and analysis.
const startRec = (page) => page.evaluate(() => { window.__rec.chunks = []; window.__rec.on = true })
const stopRec = (page) =>
  page.evaluate(() => {
    window.__rec.on = false
    const n = window.__rec.chunks.reduce((s, c) => s + c.length, 0)
    const all = new Float32Array(n)
    let o = 0
    for (const c of window.__rec.chunks) { all.set(c, o); o += c.length }
    window.__rec.last = all
    return { samples: n, sampleRate: window.__rec.sampleRate }
  })

/** Stats on the last recording, optionally a slice in seconds. */
const stats = (page, from = 0, to = Infinity) =>
  page.evaluate(([from, to]) => {
    const x = window.__rec.last
    const sr = window.__rec.sampleRate
    const a = Math.floor(from * sr)
    const b = Math.min(x.length, Math.floor(to * sr))
    let ss = 0, peak = 0, step = 0
    for (let i = a; i < b; i++) {
      ss += x[i] * x[i]
      peak = Math.max(peak, Math.abs(x[i]))
      if (i > a) step = Math.max(step, Math.abs(x[i] - x[i - 1]))
    }
    const n = Math.max(1, b - a)
    return { rms: Math.sqrt(ss / n), peak, maxStep: step, seconds: n / sr }
  }, [from, to])

/** RMS in dB per window across the last recording (the loudness curve). */
const envelope = (page, windowSec) =>
  page.evaluate((w) => {
    const x = window.__rec.last
    const n = Math.floor(w * window.__rec.sampleRate)
    const out = []
    for (let i = 0; i + n <= x.length; i += n) {
      let s = 0
      for (let j = i; j < i + n; j++) s += x[j] * x[j]
      out.push(Math.round(20 * Math.log10(Math.sqrt(s / n) + 1e-9) * 10) / 10)
    }
    return out
  }, windowSec)

/** Index (seconds) of the first sample louder than `level`. */
/** Time (seconds) of the last sample louder than `level`. */
const lastAbove = (page, level) =>
  page.evaluate((lv) => {
    const x = window.__rec.last
    for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) > lv) return i / window.__rec.sampleRate
    return null
  }, level)

/** Seconds from `from` until a 20 ms window first reaches `rms`. */
const riseTime = (page, from, rms) =>
  page.evaluate(([from, target]) => {
    const x = window.__rec.last
    const sr = window.__rec.sampleRate
    const n = Math.floor(0.02 * sr)
    for (let i = Math.floor(from * sr); i + n <= x.length; i += n) {
      let s = 0
      for (let j = i; j < i + n; j++) s += x[j] * x[j]
      if (Math.sqrt(s / n) >= target) return i / sr - from
    }
    return null
  }, [from, rms])

const firstAbove = (page, level) =>
  page.evaluate((lv) => {
    const x = window.__rec.last
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > lv) return i / window.__rec.sampleRate
    return null
  }, level)

const report = { url: URL_BASE, at: new Date().toISOString(), themes: {}, failures: [] }
const check = (theme, name, ok, detail) => {
  report.themes[theme].checks.push({ name, ok, ...detail })
  if (!ok) report.failures.push(`${theme}: ${name}`)
}

const browser = await chromium.launch()

for (const theme of ['dark', 'light']) {
  report.themes[theme] = { checks: [] }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await context.addInitScript((t) => localStorage.setItem('stores-theme', t), theme)
  await context.addInitScript(recorderProbe)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tile = (name) => page.getByRole('button', { name, exact: true })

  await page.goto(URL_BASE, { waitUntil: 'networkidle' })
  const appliedTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light')
  check(theme, 'theme applied', appliedTheme === theme, { appliedTheme })

  // ── Installable PWA ──
  const cdp = await context.newCDPSession(page)
  const install = await cdp.send('Page.getInstallabilityErrors')
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.href
    return href ? (await fetch(href)).json() : null
  })
  check(theme, 'installable as a PWA (Chromium installability check)', install.installabilityErrors.length === 0, {
    installabilityErrors: install.installabilityErrors,
    manifest: manifest && { name: manifest.name, display: manifest.display, start_url: manifest.start_url, icons: manifest.icons.map((i) => i.sizes) },
  })
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 10000) })
    }
    return !!navigator.serviceWorker.controller
  })
  check(theme, 'service worker controls the page', controlled, {})

  // ── Play each sound; no click at start or stop ──
  const perSound = []
  for (const name of SOUNDS) {
    await startRec(page)
    await page.waitForTimeout(300) // silence before
    await tile(name).click()
    await page.waitForTimeout(3000) // 1.5 s fade-in, then steady
    await tile(name).click()
    await page.waitForTimeout(2300) // 1.5 s fade-out, node freed
    const { sampleRate } = await stopRec(page)
    // Use the start of real signal (the click lands up to ~100 ms after the
    // recording started) to align the windows.
    const onset = await firstAbove(page, 1e-4)
    if (onset === null) {
      perSound.push({ name, ok: false, reason: 'no signal' })
      continue
    }
    // A click is an instant jump in level. So: the first and last 30 ms of
    // sound must be near-silent (no sample step over 10% of the sound's own),
    // the sound must take a while to swell up, and stopping must glide down
    // for at least a second before silence.
    const offset = await lastAbove(page, 1e-4)
    const steady = await stats(page, onset + 1.8, onset + 2.6)
    const first30ms = await stats(page, onset, onset + 0.03)
    const last30ms = await stats(page, offset - 0.03, offset)
    const riseToHalf = await riseTime(page, onset, steady.rms / 2)
    // The stop tap lands ~3 s after the start tap.
    const fadeOutSeconds = offset - (onset + 3.0)
    const tail = await stats(page, offset + 0.05, Infinity)
    const ok =
      steady.rms > 0.01 &&
      steady.peak < 1 &&
      first30ms.maxStep < steady.maxStep * 0.1 &&
      last30ms.maxStep < steady.maxStep * 0.1 &&
      riseToHalf !== null &&
      riseToHalf >= 0.4 &&
      fadeOutSeconds >= 1.0 &&
      tail.rms === 0
    perSound.push({
      name,
      ok,
      sampleRate,
      steadyRms: +steady.rms.toFixed(4),
      peak: +steady.peak.toFixed(3),
      steadyMaxStep: +steady.maxStep.toFixed(4),
      first30msMaxStep: +first30ms.maxStep.toFixed(5),
      last30msMaxStep: +last30ms.maxStep.toFixed(5),
      secondsToHalfLevel: riseToHalf === null ? null : +riseToHalf.toFixed(2),
      fadeOutSeconds: +fadeOutSeconds.toFixed(2),
      afterStopRms: tail.rms,
    })
  }
  for (const s of perSound) check(theme, `sound plays and starts/stops without a click: ${s.name}`, s.ok, s)

  // ── Mix, save and load a preset ──
  const nav = async (name) => {
    const navEl = page.getByRole('navigation', { name: 'Main' })
    const link = navEl.getByRole('link', { name, exact: true })
    if (!(await link.isVisible())) await navEl.getByRole('button', { name: 'Menu' }).click()
    await link.click()
    await page.getByRole('heading', { level: 1, name }).waitFor()
  }
  await tile('Rain').click()
  await tile('Fireplace').click()
  await page.getByRole('slider', { name: 'Rain volume' }).fill('0.4')
  await nav('Mixes')
  const presetName = `Live check ${theme}`
  await page.getByLabel('Save the current mix').fill(presetName)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const saved = await page.locator('.ss-preset-name').allTextContents()
  await nav('Sounds')
  await page.getByRole('button', { name: 'Stop and clear the mix' }).click()
  await tile('Wind').click()
  await nav('Mixes')
  await page.getByRole('button', { name: `Play ${presetName}` }).click()
  await nav('Sounds')
  const loadedStatus = await page.locator('.ss-status').textContent()
  const rainVol = await page.getByRole('slider', { name: 'Rain volume' }).inputValue()
  check(theme, 'mix, save and load a preset', saved.includes(presetName) && loadedStatus === 'Playing: Rain and Fireplace' && rainVol === '0.4', {
    saved,
    afterLoad: loadedStatus,
    rainVolume: rainVol,
  })
  await page.screenshot({ path: `${OUT}/${theme}-sounds-playing.png` })

  // ── Lock-screen controls (Media Session) ──
  const sessionState = () =>
    page.evaluate(() => ({
      state: navigator.mediaSession.playbackState,
      title: navigator.mediaSession.metadata?.title ?? null,
      artist: navigator.mediaSession.metadata?.artist ?? null,
      artwork: (navigator.mediaSession.metadata?.artwork ?? []).map((a) => a.sizes),
      handlers: Object.keys(window.__media).sort(),
    }))
  const before = await sessionState()
  await page.evaluate(() => window.__media.pause())
  await page.waitForTimeout(300)
  const afterPause = await sessionState()
  const bigAfterPause = await page.locator('.ss-play').getAttribute('aria-label')
  await page.evaluate(() => window.__media.play())
  await page.waitForTimeout(300)
  const afterPlay = await sessionState()
  await page.evaluate(() => window.__media.stop())
  await page.waitForTimeout(300)
  const afterStop = await sessionState()
  check(
    theme,
    'lock-screen controls (Media Session play/pause/stop)',
    before.state === 'playing' && before.title === 'Rain and Fireplace' && afterPause.state === 'paused' && bigAfterPause === 'Play' && afterPlay.state === 'playing' && afterStop.state === 'none' && before.handlers.join() === 'pause,play,stop',
    { before, afterPause: afterPause.state, afterPlay: afterPlay.state, afterStop: afterStop.state },
  )
  // Clean up the preset made for the check.
  await nav('Mixes')
  await page.getByRole('button', { name: `Delete ${presetName}` }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await nav('Sounds')

  // ── Sleep timer fade (a real 1-minute timer: 20 s fade at the end) ──
  await tile('Pink noise').click()
  await page.locator('.ss-timer-pill').click()
  await page.getByLabel('Custom time').fill('1')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(30_000)
  await startRec(page)
  await page.waitForTimeout(15_000)
  const pillFading = await page.locator('.ss-timer-pill').textContent()
  await page.screenshot({ path: `${OUT}/${theme}-timer-fading.png` })
  await page.waitForTimeout(19_000)
  await stopRec(page)
  const curve = await envelope(page, 2)
  const pillAfter = await page.locator('.ss-timer-pill').textContent()
  const statusAfter = await page.locator('.ss-status').textContent()
  // Recording spans ~30 s→64 s: steady until 40 s, fading 40→60 s, silent after.
  const steadyDb = curve[0]
  const finalDb = curve.at(-1)
  const fadePart = curve.slice(5, 10)
  const falling = fadePart.every((v, i) => i === 0 || v <= fadePart[i - 1] + 0.5)
  // Largest drop between neighbouring windows while still audible. The last
  // step into exact digital silence (log of zero, -180 dB) isn't a jump: the
  // window before it is already below -70 dB.
  const maxDrop = Math.max(...curve.slice(1).map((v, i) => (curve[i] > -70 ? curve[i] - Math.max(v, -70) : 0)))
  check(theme, 'sleep timer fades out smoothly, then pauses', /Fading/.test(pillFading ?? '') && falling && finalDb < steadyDb - 40 && maxDrop < 25 && pillAfter === 'Timer' && statusAfter === 'Paused: Pink noise', {
    pillDuringFade: pillFading,
    loudnessDbEvery2s: curve,
    largestDropBetween2sWindowsDb: Math.round(maxDrop * 10) / 10,
    after: { pill: pillAfter, status: statusAfter },
  })

  // ── Offline: works with the network cut ──
  await page.getByRole('button', { name: 'Stop and clear the mix' }).click()
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { level: 1, name: 'Sounds' }).waitFor()
  await startRec(page)
  await tile('Stream').click()
  await page.waitForTimeout(2500)
  await stopRec(page)
  const offline = await stats(page, 1.6, 2.4)
  check(theme, 'works offline (reload with network cut, sound plays)', offline.rms > 0.01, { offlineRms: +offline.rms.toFixed(4) })
  await page.screenshot({ path: `${OUT}/${theme}-offline.png` })
  await context.setOffline(false)

  check(theme, 'no page errors', errors.length === 0, { errors })
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(report.failures.length ? 1 : 0)
