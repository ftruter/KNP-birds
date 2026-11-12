import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { test, before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { DEFAULT_MODEL, modelFiles } from '../scripts/publish-models.mjs'
import { startBundledSite } from './bundle-site.js'

// This test runs the real model in real browsers. Neither the model nor a
// bird recording is in the repository, so it is skipped unless both are on
// disk:
//   IDENTIFY_MODEL  audio-model-fp16.tflite (default: the spike's models folder)
//   IDENTIFY_CLIP   a Ring-necked Dove recording (default: xeno-canto XC1149018,
//                   which spike/identify-sound/fetch-clips.mjs downloads)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = process.env.IDENTIFY_MODEL || DEFAULT_MODEL
const clipPath =
  process.env.IDENTIFY_CLIP || path.join(root, 'data/audio/files/XC1149018.mp3')
const EXPECTED = {
  name: 'Cape Turtle (Ring-necked) Dove',
  slug: 'streptopelia-capicola',
}

const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  )
const missing = [
  (await exists(modelPath)) ? null : `no model at ${modelPath}`,
  (await exists(clipPath)) ? null : `no recording at ${clipPath}`,
].filter(Boolean)
const skip = missing.length ? missing.join('; ') : false

let site

before(
  async () => {
    if (skip) return
    site = await startBundledSite()
    const bucket = await site.mf.getR2Bucket('IMAGES')
    for (const entry of await modelFiles(modelPath))
      await bucket.put(entry.key, entry.bytes)
  },
  { timeout: 180000 },
)

after(
  async () => {
    await site?.dispose()
  },
  { timeout: 60000 },
)

const PIXEL = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'

// LiteRT writes its start-up log to the console's error stream.
const RUNTIME_LOG = /^(INFO|WARNING): |^Created TensorFlow Lite /

const open = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (error) => problems.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error' && !RUNTIME_LOG.test(message.text()))
      problems.push(message.text())
  })
  // Photographs and reference calls are on other sites. Keep the test offline.
  await page.route(
    (url) => url.origin !== site.origin,
    (route) =>
      route.request().resourceType() === 'image'
        ? route.fulfill({ contentType: 'image/svg+xml', body: PIXEL })
        : route.abort(),
  )
  return { context, page, problems }
}

const ready = async (page) => {
  await page.goto(`${site.origin}/identify/sound`, { waitUntil: 'load' })
  await page.locator('#identify').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#identify-nojs').isVisible(), false)
}

const identifyFromFile = async (browser, { keepsCache }) => {
  const { context, page, problems } = await open(browser)
  try {
    await ready(page)
    // Nothing is downloaded until the visitor agrees.
    const requested = []
    page.on('request', (request) => {
      if (request.url().includes('/models/')) requested.push(request.url())
    })
    const download = page.locator('#identify-download')
    await download.waitFor({ state: 'visible' })
    assert.match(await download.textContent(), /about 35.6 MiB/)
    assert.equal(await page.locator('#identify-capture').isVisible(), false)
    assert.deepEqual(requested, [])

    await download.click()
    await page
      .locator('#identify-capture')
      .waitFor({ state: 'visible', timeout: 120000 })
    assert.match(await page.locator('#identify-status').textContent(), /^Ready/)

    await page.locator('#identify-file').setInputFiles(clipPath)
    await page
      .locator('#identify-results')
      .waitFor({ state: 'visible', timeout: 120000 })
    assert.equal(
      await page.locator('#identify-results-heading').textContent(),
      'Most likely species',
    )
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'identify-results-heading',
    )
    const items = page.locator('#identify-list > li')
    const count = await items.count()
    assert.ok(count >= 1 && count <= 5, `${count} results`)
    const first = items.first()
    assert.equal(await first.locator('h3 a').textContent(), EXPECTED.name)
    assert.equal(
      await first.locator('h3 a').getAttribute('href'),
      `/species/${EXPECTED.slug}`,
    )
    assert.equal(
      await first.locator('.latin').textContent(),
      'Streptopelia capicola',
    )
    assert.equal(await first.locator('.afrikaans').count(), 1)
    assert.match(
      await first.locator('.identify-family').textContent(),
      /^Family: /,
    )
    assert.match(
      await first.locator('.identify-verdict').textContent(),
      /^(Likely|Possible)/,
    )
    assert.ok(await first.locator('img').getAttribute('alt'))
    assert.match(
      await first.locator('audio').getAttribute('aria-label'),
      /^Reference call of /,
    )
    assert.match(
      await page.locator('#identify-summary').textContent(),
      /No result is certain/,
    )
    assert.match(
      await page.locator('#identify-status').textContent(),
      /^Finished\. \d candidates? listed below\.$/,
    )

    assert.deepEqual(problems, [])
    // Playwright's WebKit empties Cache Storage on every navigation, even
    // for a one-line entry, so the saved model can only be checked in
    // Chromium. Safari itself has to be checked on a device.
    if (!keepsCache) return

    // The model is kept on the device: a reload needs no consent and no
    // second download of it.
    const again = []
    page.on('request', (request) => {
      if (request.url().endsWith('.tflite')) again.push(request.url())
    })
    await page.reload({ waitUntil: 'load' })
    await page
      .locator('#identify-capture')
      .waitFor({ state: 'visible', timeout: 120000 })
    assert.equal(await page.locator('#identify-consent').isVisible(), false)
    assert.deepEqual(again, [])
    assert.deepEqual(problems, [])
  } finally {
    await context.close()
  }
}

test(
  'chromium identifies a recording chosen from a file',
  { skip, timeout: 300000 },
  async () => {
    const browser = await chromium.launch()
    try {
      await identifyFromFile(browser, { keepsCache: true })
    } finally {
      await browser.close()
    }
  },
)

test(
  'webkit identifies a recording chosen from a file',
  { skip, timeout: 300000 },
  async () => {
    const browser = await webkit.launch()
    try {
      await identifyFromFile(browser, { keepsCache: false })
    } finally {
      await browser.close()
    }
  },
)

test(
  'chromium records from the microphone and analyses the result',
  { skip, timeout: 300000 },
  async () => {
    // Chromium's fake microphone plays a beep, so no bird is expected: this
    // checks that capture, the countdown and the analysis all run.
    const browser = await chromium.launch({
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    })
    // The fake-UI flag answers the permission prompt. Granting the
    // permission on the context as well makes getUserMedia hang.
    const { context, page, problems } = await open(browser)
    try {
      await ready(page)
      await page.locator('#identify-download').click()
      await page
        .locator('#identify-capture')
        .waitFor({ state: 'visible', timeout: 120000 })
      await page.locator('#identify-record').click()
      const stop = page.locator('#identify-stop')
      await stop.waitFor({ state: 'visible' })
      assert.match(
        await page.locator('#identify-countdown').textContent(),
        /^Recording\. \d+ seconds left\.$/,
      )
      assert.equal(await page.locator('#identify-level').isVisible(), true)
      assert.equal(await page.locator('#identify-record').isVisible(), false)
      await page.waitForTimeout(3500)
      await stop.click()
      await page
        .locator('#identify-results')
        .waitFor({ state: 'visible', timeout: 120000 })
      assert.match(
        await page.locator('#identify-results-heading').textContent(),
        /^(Most likely species|Most likely family|No confident match)$/,
      )
      assert.equal(await page.locator('#identify-record').isVisible(), true)
      assert.deepEqual(problems, [])
    } finally {
      await context.close()
      await browser.close()
    }
  },
)
