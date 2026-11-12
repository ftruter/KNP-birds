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

/**
 * Clicks a photograph in the results, checks that it fills the screen with
 * its caption, then restores it: once by clicking again, once with Esc.
 */
const zoomAndRestore = async (page, plate, caption) => {
  const button = plate.locator('.zoom')
  const state = () =>
    plate.evaluate((figure) => {
      const rect = figure.getBoundingClientRect()
      const picture = figure
        .querySelector('.zoom img, .zoom canvas')
        .getBoundingClientRect()
      const text = figure.querySelector('figcaption')
      return {
        zoomed: figure.classList.contains('is-zoomed'),
        settled: getComputedStyle(figure).transform === 'none',
        pressed: figure.querySelector('.zoom').getAttribute('aria-pressed'),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        pictureWidth: picture.width,
        pictureBottom: picture.bottom,
        caption: text.innerText,
        captionBottom: text.getBoundingClientRect().bottom,
        focused: document.activeElement === figure.querySelector('.zoom'),
        open: document.querySelectorAll('.plate.is-zoomed').length,
        viewport: window.innerWidth,
        height: window.innerHeight,
      }
    })
  const settled = async (zoomed) =>
    page.waitForFunction(
      ([figure, want]) =>
        figure.classList.contains('is-zoomed') === want &&
        getComputedStyle(figure).transform === 'none',
      [await plate.elementHandle(), zoomed],
    )
  await button.scrollIntoViewIfNeeded()
  const before = await state()
  assert.equal(before.zoomed, false)
  assert.equal(before.pressed, 'false')
  assert.ok(before.width < before.viewport / 2, 'the photograph starts small')
  assert.doesNotMatch(before.caption, caption)

  for (const restore of ['click', 'Escape']) {
    await button.click()
    await settled(true)
    const open = await state()
    assert.equal(open.pressed, 'true')
    assert.equal(open.open, 1)
    assert.ok(Math.abs(open.left) <= 1 && Math.abs(open.top) <= 1)
    assert.ok(open.width >= open.viewport - 1, `plate is ${open.width} wide`)
    assert.ok(
      open.pictureWidth >= open.viewport - 4,
      `picture is ${open.pictureWidth} wide`,
    )
    assert.ok(open.pictureBottom <= open.height + 1, 'the picture overflows')
    assert.ok(open.captionBottom <= open.height + 1, 'the caption is cut off')
    assert.match(open.caption, caption)

    if (restore === 'click') await button.click()
    else await page.keyboard.press('Escape')
    await settled(false)
    const closed = await state()
    assert.equal(closed.pressed, 'false')
    assert.equal(closed.open, 0)
    assert.ok(Math.abs(closed.width - before.width) <= 1, 'size not restored')
    if (restore === 'Escape') assert.equal(closed.focused, true)
  }
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
    assert.match(await download.textContent(), /about 20\.2 MiB/)
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
    // Both photographs zoom as the plates on a species page do, and the name
    // beside them is still the link. The visitor's own is redrawn from the
    // larger copy in memory, so it is sharper than the thumbnail.
    assert.equal(await first.locator('a img, a canvas').count(), 0)
    const plates = first.locator('.plate')
    assert.equal(await plates.count(), 2)
    const side = () => first.locator('canvas').evaluate((copy) => copy.width)
    assert.equal(await side(), 192)
    await zoomAndRestore(page, plates.nth(0), /has not left this device/)
    assert.equal(await side(), 375)
    await zoomAndRestore(page, plates.nth(1), /Credit: \S/)
    // The guide photograph carries a closed credit disclosure, zoomed or not.
    const credit = plates.nth(1).locator('details.credit')
    assert.equal(await credit.count(), 1)
    assert.equal(await credit.getAttribute('open'), null)
    assert.match(await credit.locator('summary').textContent(), /^Credit: \S/)
    await credit.locator('summary').click()
    assert.match(await credit.textContent(), /Saved on this site: (yes|no)\./)
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
