import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { test, before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import {
  DEFAULT_PHOTO_MODEL,
  photoModelFiles,
  runtimeFiles,
} from '../scripts/publish-models.mjs'
import { photoDownloadMb } from '../src/identify.js'
import { startBundledSite } from './bundle-site.js'

// This test runs the real photo model in real browsers. The model is not in
// the repository, so the test is skipped unless it is on disk:
//   IDENTIFY_PHOTO_MODEL  photo-model.tflite (default: data/models/, where
//                         training/identify-photo/describe.py puts it)
// The photo is in the repository: a CC0 picture, see its README.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = process.env.IDENTIFY_PHOTO_MODEL || DEFAULT_PHOTO_MODEL
const photoPath = path.join(
  root,
  'test/fixtures/identify-photo/crested-barbet.jpg',
)
const EXPECTED = {
  name: 'Crested Barbet',
  slug: 'trachyphonus-vaillantii',
  latin: 'Trachyphonus vaillantii',
}

const skip = (await access(modelPath).then(
  () => true,
  () => false,
))
  ? false
  : `no photo model at ${modelPath}`

let site

before(
  async () => {
    if (skip) return
    site = await startBundledSite()
    const bucket = await site.mf.getR2Bucket('IMAGES')
    for (const entry of [
      ...(await photoModelFiles(modelPath)),
      ...(await runtimeFiles()),
    ])
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
  // A phone held upright.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  const problems = []
  const elsewhere = []
  page.on('pageerror', (error) => problems.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error' && !RUNTIME_LOG.test(message.text()))
      problems.push(message.text())
  })
  // Reference photographs are on other sites. Keep the test offline, and
  // record anything that is not an image: the visitor's photo must not leave.
  await page.route(
    (url) => url.origin !== site.origin,
    (route) => {
      if (route.request().resourceType() === 'image')
        return route.fulfill({ contentType: 'image/svg+xml', body: PIXEL })
      elsewhere.push(route.request().url())
      return route.abort()
    },
  )
  return { context, page, problems, elsewhere }
}

const identifyPhoto = async (browser, { keepsCache }) => {
  const { context, page, problems, elsewhere } = await open(browser)
  try {
    await page.goto(`${site.origin}/identify/photo`, { waitUntil: 'load' })
    await page.locator('#identify').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#identify-nojs').isVisible(), false)

    // Nothing is downloaded until the visitor agrees.
    const requested = []
    const uploads = []
    page.on('request', (request) => {
      if (request.url().includes('/models/')) requested.push(request.url())
      if (request.method() !== 'GET') uploads.push(request.url())
    })
    const download = page.locator('#identify-download')
    await download.waitFor({ state: 'visible' })
    assert.match(
      await download.textContent(),
      new RegExp(`about ${photoDownloadMb} MB`),
    )
    assert.equal(await page.locator('#identify-capture').isVisible(), false)
    assert.deepEqual(requested, [])

    await download.click()
    await page
      .locator('#identify-capture')
      .waitFor({ state: 'visible', timeout: 120000 })
    assert.match(await page.locator('#identify-status').textContent(), /^Ready/)
    assert.equal(await page.locator('#identify-cropper').isVisible(), false)

    // Both inputs are offered; the gallery one takes the fixture.
    assert.equal(
      await page.locator('#identify-camera').getAttribute('capture'),
      'environment',
    )
    await page.locator('#identify-file').setInputFiles(photoPath)
    const crop = page.locator('#identify-crop')
    await crop.waitFor({ state: 'visible' })
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'identify-crop-heading',
    )
    assert.match(
      await page.locator('#identify-status').textContent(),
      /^Photo ready/,
    )
    assert.deepEqual(
      await crop.evaluate((canvas) => [canvas.width, canvas.height]),
      [500, 375],
    )
    // Nothing on the page is wider than the phone.
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      'the page scrolls sideways',
    )

    // The square moves and resizes from the keyboard, by dragging, and from
    // the buttons. Each changes what is drawn.
    const drawn = () => crop.evaluate((canvas) => canvas.toDataURL())
    let last = await drawn()
    const changed = async (what) => {
      const now = await drawn()
      assert.notEqual(now, last, what)
      last = now
    }
    await crop.focus()
    await page.keyboard.press('-')
    await changed('minus makes the square smaller')
    await page.keyboard.press('ArrowLeft')
    await changed('an arrow key moves the square')
    await crop.scrollIntoViewIfNeeded()
    const box = await crop.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2)
    await page.mouse.up()
    await changed('dragging moves the square')
    await page.locator('#identify-smaller').click()
    await changed('the Smaller button resizes the square')
    await page.locator('#identify-whole').click()
    await changed('the Whole photo button resets the square')

    await page.locator('#identify-run').click()
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
    assert.equal(await first.locator('.latin').textContent(), EXPECTED.latin)
    assert.equal(await first.locator('.afrikaans').count(), 1)
    assert.match(
      await first.locator('.identify-family').textContent(),
      /^Family: /,
    )
    assert.match(
      await first.locator('.identify-family a').getAttribute('href'),
      /^\/family\/[a-z]+$/,
    )
    assert.match(
      await first.locator('.identify-verdict').textContent(),
      /^Likely/,
    )
    // The guide's photograph beside the visitor's own.
    assert.equal(
      await first.locator('canvas').getAttribute('aria-label'),
      'Your photo',
    )
    assert.ok(await first.locator('img').getAttribute('alt'))
    assert.match(
      await page.locator('#identify-summary').textContent(),
      /No result is certain/,
    )
    assert.match(
      await page.locator('#identify-status').textContent(),
      /^Finished\. \d candidates? listed below\.$/,
    )

    // The photo stayed on the device: nothing was sent anywhere.
    assert.deepEqual(uploads, [])
    assert.deepEqual(elsewhere, [])
    assert.deepEqual(problems, [])
    // Playwright's WebKit empties Cache Storage on every navigation, so the
    // saved model can only be checked in Chromium.
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
  'chromium identifies a photo chosen from a file',
  { skip, timeout: 300000 },
  async () => {
    const browser = await chromium.launch()
    try {
      await identifyPhoto(browser, { keepsCache: true })
    } finally {
      await browser.close()
    }
  },
)

test(
  'webkit identifies a photo chosen from a file',
  { skip, timeout: 300000 },
  async () => {
    const browser = await webkit.launch()
    try {
      await identifyPhoto(browser, { keepsCache: false })
    } finally {
      await browser.close()
    }
  },
)
