import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test, before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { mebibytes, photoDownloadBytes } from '../src/identify.js'
import {
  DEFAULT_PHOTO_DETECTOR,
  DEFAULT_PHOTO_MODEL,
  photoDetectorFiles,
  photoModelFiles,
  runtimeFiles,
} from '../scripts/publish-models.mjs'
import { startBundledSite } from './bundle-site.js'

// This test runs the real photo model in real browsers. The model is not in
// the repository, so the test is skipped unless it is on disk:
//   IDENTIFY_PHOTO_MODEL  photo-model.tflite (default: data/models/, where
//                         training/identify-photo/describe.py puts it)
//   IDENTIFY_PHOTO_DETECTOR  efficientdet-lite0.tflite (default: data/models/;
//                         PHOTO_DETECTOR.source in src/identify.js says
//                         where to download it)
// The photo is in the repository: a CC0 picture, see its README.
// Live mode is given the same photo as its camera: getUserMedia is replaced
// with a canvas stream that shows the photo, shifting a few pixels from
// frame to frame, or a plain colour with no bird in it.
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

const detectorPath =
  process.env.IDENTIFY_PHOTO_DETECTOR || DEFAULT_PHOTO_DETECTOR
const onDisk = (file) =>
  access(file).then(
    () => true,
    () => false,
  )
const skip = !(await onDisk(modelPath))
  ? `no photo model at ${modelPath}`
  : !(await onDisk(detectorPath))
    ? `no detector at ${detectorPath}`
    : false

let site

before(
  async () => {
    if (skip) return
    site = await startBundledSite()
    const bucket = await site.mf.getR2Bucket('IMAGES')
    for (const entry of [
      ...(await photoModelFiles(modelPath)),
      ...(await photoDetectorFiles(detectorPath)),
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
        description: text.querySelector('.plate-credit').textContent,
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
  // What the picture shows is added on zoom. The credit disclosure beside a
  // guide photograph is there all along, so it cannot tell the two apart.
  assert.ok(before.description, 'the plate has no description')
  assert.ok(
    !before.caption.includes(before.description),
    'the description shows before the photograph is zoomed',
  )

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
    assert.ok(open.caption.includes(open.description))

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
    assert.ok(
      (await download.textContent()).includes(
        `about ${mebibytes(photoDownloadBytes)} MiB`,
      ),
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
    // A photo with one clear bird: the page finds it, crops to it and names
    // it, with no cropping step.
    await page.locator('#identify-file').setInputFiles(photoPath)
    await page
      .locator('#identify-results')
      .waitFor({ state: 'visible', timeout: 120000 })
    assert.equal(await page.locator('#identify-cropper').isVisible(), false)
    assert.equal(
      await page.locator('#identify-list > li h3 a').first().textContent(),
      EXPECTED.name,
    )
    assert.equal(await page.locator('#identify-found').isVisible(), true)
    assert.equal(await page.locator('#identify-upgrade').isVisible(), false)
    assert.match(
      await page.locator('#identify-timing').textContent(),
      /^Found the bird in \d+(\.\d)? m?s and recognised it in \d+(\.\d)? m?s on this device\. Runtime: (relaxed SIMD|compatibility) build\.$/,
    )
    const crop = page.locator('#identify-crop')
    // The square is on the bird: smaller than the photo, and around the
    // barbet, which sits a little left of the middle of the 500 by 375 frame.
    const found = (await crop.getAttribute('data-crop')).split(' ').map(Number)
    assert.ok(found[2] < 375, `the square is ${found[2]} wide`)
    assert.ok(found[2] > 120, `the square is only ${found[2]} wide`)
    const middle = [found[0] + found[2] / 2, found[1] + found[2] / 2]
    assert.ok(
      middle[0] > 150 && middle[0] < 350 && middle[1] > 100 && middle[1] < 275,
      `the square is centred on ${middle}`,
    )
    // The crop that was used is shown, and says who chose it.
    const yours = page.locator('#identify-list > li').first().locator('.plate')
    assert.match(
      await yours.first().locator('.plate-credit').textContent(),
      /cropped to the bird this page found/,
    )

    // "Change the crop" opens the crop view on the square the page chose.
    await page.locator('#identify-recrop').click()
    await crop.waitFor({ state: 'visible' })
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'identify-crop-heading',
    )
    assert.equal(await page.locator('#identify-crop-note').isVisible(), false)
    assert.deepEqual(
      (await crop.getAttribute('data-crop')).split(' ').map(Number),
      found,
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
    assert.match(
      await page.locator('#identify-timing').textContent(),
      /^Recognised in \d+(\.\d)? m?s on this device\. Runtime: (relaxed SIMD|compatibility) build\.$/,
    )

    // The visitor chose this square, and the page says so.
    assert.equal(await page.locator('#identify-found').isVisible(), false)
    assert.match(
      await first.locator('.plate-credit').first().textContent(),
      /cropped to the square you chose/,
    )

    // A photo with no bird in it: the crop view opens, as it always did,
    // with a line saying that no bird was found.
    const plain = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      const context = canvas.getContext('2d')
      context.fillStyle = '#7a9'
      context.fillRect(0, 0, 400, 300)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    await page.locator('#identify-file').setInputFiles({
      name: 'plain.png',
      mimeType: 'image/png',
      buffer: Buffer.from(plain, 'base64'),
    })
    await crop.waitFor({ state: 'visible' })
    assert.equal(await page.locator('#identify-crop-note').isVisible(), true)
    assert.match(
      await page.locator('#identify-status').textContent(),
      /^No bird was found automatically/,
    )
    assert.equal(await crop.getAttribute('data-crop'), '50 0 300')
    await page.locator('#identify-cancel').click()

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

/**
 * Replaces the camera with a stream of the test photo. `window.__camera`:
 * `blank` shows a plain colour instead, `stream` is what the page was given
 * and `asked` is what it asked for.
 */
const fakeCamera = async (context, page) => {
  const photo = await readFile(photoPath)
  await page.route(`${site.origin}/test-frame`, (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: photo }),
  )
  await context.addInitScript(() => {
    const camera = { blank: false, stream: null, asked: null }
    window.__camera = camera
    // On the prototype: WebKit does not keep a property that is set on
    // navigator.mediaDevices itself.
    window.MediaDevices.prototype.getUserMedia = async (constraints) => {
      camera.asked = constraints
      const image = new Image()
      image.src = '/test-frame'
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 500
      canvas.height = 375
      const context = canvas.getContext('2d')
      let shift = 0
      const paint = () => {
        shift = (shift + 1) % 8
        context.fillStyle = '#7a9'
        context.fillRect(0, 0, 500, 375)
        if (!camera.blank) context.drawImage(image, shift - 4, 0)
      }
      paint()
      setInterval(paint, 50)
      camera.stream = canvas.captureStream(20)
      return camera.stream
    }
  })
}

const livesFromCamera = async (browser) => {
  const { context, page, problems, elsewhere } = await open(browser)
  try {
    await fakeCamera(context, page)
    const uploads = []
    page.on('request', (request) => {
      if (request.method() !== 'GET') uploads.push(request.url())
    })
    await page.goto(`${site.origin}/identify/photo`, { waitUntil: 'load' })
    // Every line the status region is given, for the announcements.
    await page.evaluate(() => {
      window.__said = []
      const status = document.querySelector('#identify-status')
      new MutationObserver(() =>
        window.__said.push(status.textContent),
      ).observe(status, { childList: true, characterData: true, subtree: true })
    })
    // Live is not offered before the recogniser is on the device.
    const start = page.locator('#identify-live-start')
    assert.equal(await start.isVisible(), false)
    await page.locator('#identify-download').click()
    await start.waitFor({ state: 'visible', timeout: 120000 })
    assert.equal(await page.locator('#identify-live').isVisible(), false)
    assert.equal(await page.evaluate(() => window.__camera.asked), null)

    const status = page.locator('#identify-status')
    const name = page.locator('#identify-live-name')
    const where = page.locator('#identify-live-view')
    const frames = () =>
      page.evaluate(() =>
        Number(document.querySelector('#identify').dataset.liveFrames ?? -1),
      )
    const more = async (count) => {
      const from = await frames()
      await page.waitForFunction(
        (target) =>
          Number(document.querySelector('#identify').dataset.liveFrames) >=
          target,
        from + count,
        { timeout: 120000 },
      )
    }
    /** Whether anything is drawn over the video. */
    const outlined = () =>
      page.locator('#identify-live-overlay').evaluate((canvas) => {
        const { data } = canvas
          .getContext('2d')
          .getImageData(0, 0, canvas.width, canvas.height)
        return data.some((value, index) => index % 4 === 3 && value > 0)
      })
    const cameraOff = () =>
      page.evaluate(
        () =>
          window.__camera.stream
            .getTracks()
            .every((track) => track.readyState === 'ended') &&
          document.querySelector('#identify-live-video').srcObject === null,
      )

    // Start: the camera is asked for, the back one, with no sound.
    await start.click()
    await page.locator('#identify-live').waitFor({ state: 'visible' })
    const asked = await page.evaluate(() => window.__camera.asked)
    assert.equal(asked.audio, false)
    assert.deepEqual(asked.video.facingMode, { ideal: 'environment' })
    assert.equal(await page.locator('#identify-choices').isVisible(), false)
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'identify-live-hold',
    )
    // The stand-in camera has no zoom, and the page says so.
    assert.equal(
      await page.locator('#identify-live-zoom-none').isVisible(),
      true,
    )
    assert.equal(
      await page.locator('#identify-live-zoom-control').isVisible(),
      false,
    )

    // The bird in view is named, with its link, and outlined on the video.
    const link = name.locator('a')
    await link.waitFor({ state: 'visible', timeout: 120000 })
    assert.equal(await link.textContent(), EXPECTED.name)
    assert.equal(await link.getAttribute('href'), `/species/${EXPECTED.slug}`)
    assert.match(await name.textContent(), /\((likely|possible)\)$/)
    assert.equal(await where.textContent(), 'A bird is in view.')
    assert.equal(await outlined(), true)
    assert.deepEqual(
      await page
        .locator('#identify-live-video')
        .evaluate((video) => [video.videoWidth, video.videoHeight]),
      [500, 375],
    )
    // The outline's canvas lies exactly over the video, which fits the phone.
    const picture = await page.locator('#identify-live-video').boundingBox()
    const over = await page.locator('#identify-live-overlay').boundingBox()
    for (const side of ['x', 'y', 'width', 'height'])
      assert.ok(
        Math.abs(picture[side] - over[side]) <= 1,
        `the outline is off the video: ${JSON.stringify([picture, over])}`,
      )
    assert.ok(picture.x >= 0 && picture.x + picture.width <= 390)
    // The name is not a live region. The change of species is announced
    // once, however many frames follow, and the link is not rebuilt.
    assert.equal(await name.getAttribute('aria-live'), null)
    await link.evaluate((node) => {
      node.dataset.kept = 'yes'
    })
    await more(8)
    assert.equal(await link.getAttribute('data-kept'), 'yes')
    const heard = () =>
      page.evaluate(
        (text) => window.__said.filter((line) => line === text).length,
        `Seen: ${EXPECTED.name}.`,
      )
    assert.equal(await heard(), 1)

    // The bird leaves: the outline goes, the page says so, the name stays.
    await page.evaluate(() => {
      window.__camera.blank = true
    })
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-live-view').textContent ===
        'No bird in view.',
      null,
      { timeout: 120000 },
    )
    assert.equal(await outlined(), false)
    assert.equal(await link.textContent(), EXPECTED.name)
    // It comes back, and is not announced a second time.
    await page.evaluate(() => {
      window.__camera.blank = false
    })
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-live-view').textContent ===
        'A bird is in view.',
      null,
      { timeout: 120000 },
    )
    await more(6)
    assert.equal(await heard(), 1)

    // Hold: the frame is kept and identified as a photo is, and the camera
    // is let go.
    await page.locator('#identify-live-hold').click()
    await page
      .locator('#identify-results')
      .waitFor({ state: 'visible', timeout: 120000 })
    assert.equal(await page.locator('#identify-live').isVisible(), false)
    assert.equal(await cameraOff(), true)
    assert.equal(
      await page.locator('#identify-list > li h3 a').first().textContent(),
      EXPECTED.name,
    )
    assert.equal(await page.locator('#identify-found').isVisible(), true)
    assert.equal(await page.locator('#identify-recrop').isVisible(), true)
    const pace = await page.locator('#identify-live-timing').textContent()
    assert.match(
      pace,
      /^Live analysed \d+(\.\d)? frames a second on this device: finding the bird typically took \d+(\.\d)? m?s, naming it \d+(\.\d)? m?s\. Runtime: (relaxed SIMD|compatibility) build\.$/,
    )
    console.log(`${browser.browserType().name()}: ${pace}`)
    // The held frame can be cropped again, like any photo.
    await page.locator('#identify-recrop').click()
    await page.locator('#identify-crop').waitFor({ state: 'visible' })
    assert.deepEqual(
      await page
        .locator('#identify-crop')
        .evaluate((canvas) => [canvas.width, canvas.height]),
      [500, 375],
    )
    await page.locator('#identify-cancel').click()

    // Live again, then the page is hidden: it stops, and analyses no more.
    await start.click()
    await link.waitFor({ state: 'visible', timeout: 120000 })
    assert.equal(await page.locator('#identify-results').isVisible(), false)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        get: () => true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-status').textContent ===
        'Live stopped because this page was hidden.',
    )
    assert.equal(await cameraOff(), true)
    assert.equal(await page.locator('#identify-live').isVisible(), false)
    assert.equal(await frames(), -1)
    await page.evaluate(() => {
      delete document.hidden
    })

    // Start and Stop.
    await start.click()
    await page.locator('#identify-live').waitFor({ state: 'visible' })
    await more(2)
    await page.locator('#identify-live-stop').click()
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-status').textContent ===
        'Live stopped.',
    )
    assert.equal(await status.textContent(), 'Live stopped.')
    assert.equal(await cameraOff(), true)
    assert.equal(await start.isVisible(), true)
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'identify-live-start',
    )
    // A photo still works afterwards.
    await page.locator('#identify-file').setInputFiles(photoPath)
    await page
      .locator('#identify-results')
      .waitFor({ state: 'visible', timeout: 120000 })

    // No frame left the device.
    assert.deepEqual(uploads, [])
    assert.deepEqual(elsewhere, [])
    assert.deepEqual(problems, [])
  } finally {
    await context.close()
  }
}

for (const [label, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
])
  test(
    `${label} names the bird in the camera's view, live`,
    { skip, timeout: 300000 },
    async () => {
      const browser = await type.launch()
      try {
        await livesFromCamera(browser)
      } finally {
        await browser.close()
      }
    },
  )
