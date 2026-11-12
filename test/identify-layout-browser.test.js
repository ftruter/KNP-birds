import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { test, before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { startBundledSite } from './bundle-site.js'

// How the identify pages use the screen, and how the crop square is dragged,
// in real browsers. The recogniser is replaced by a stand-in that answers at
// once, so no model file is needed. So is the detector that finds the bird. The test is skipped only where
// Playwright's browsers are not installed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 500 by 375 pixels, wider than tall.
const photoPath = path.join(
  root,
  'test/fixtures/identify-photo/crested-barbet.jpg',
)
const TABLET_WIDE = { width: 1133, height: 744 } // iPad mini, landscape
const TABLET_TALL = { width: 744, height: 1133 }
const PHONE = { width: 390, height: 844 }

const installed = async (type) =>
  access(type.executablePath()).then(
    () => true,
    () => false,
  )
const skip =
  (await installed(chromium)) && (await installed(webkit))
    ? false
    : 'Playwright browsers are not installed'

// Answers "ready" to a load and four candidates to a photo.
const STAND_IN = `self.addEventListener('message', ({ data }) => {
  if (data.type === 'load') self.postMessage({ type: 'ready' })
  else if (data.type === 'classify') {
    const scores = new Float32Array(600)
    scores.set([0.56, 0.14, 0.14, 0.14])
    self.postMessage({ type: 'result', scores, count: 1 })
  }
})`
// A recogniser with the detector that finds the bird. It always finds two:
// a large one on the left of the detector's square and a small one top
// right. `has` is whether the detector was on the device at the start.
const FINDER = (has) => `let has = ${has}
self.addEventListener('message', ({ data }) => {
  if (data.type === 'load') self.postMessage({ type: 'ready', detector: has })
  else if (data.type === 'load-detector') {
    has = true
    self.postMessage({ type: 'progress', received: 1, total: 2 })
    self.postMessage({ type: 'ready', detector: true })
  } else if (data.type === 'detect')
    self.postMessage({
      type: 'boxes',
      // Two anchors, used as they are: one 0.6 of the square wide centred
      // at (0.3, 0.5), one 0.3 wide centred at (0.85, 0.25).
      anchors: Int32Array.of(18252, 18999),
      scores: Float32Array.of(0.9, 0.6),
      shifts: new Float32Array(8),
      timing: { runs: [30], total: 30, build: 'relaxed-simd' },
    })
  else if (data.type === 'classify') {
    const scores = new Float32Array(600)
    scores.set([0.56, 0.14, 0.14, 0.14])
    self.postMessage({
      type: 'result',
      scores,
      count: 1,
      timing: { runs: [70], total: 70, build: 'relaxed-simd' },
    })
  }
})`
const PIXEL = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'

let site

before(
  async () => {
    if (!skip) site = await startBundledSite()
  },
  { timeout: 180000 },
)
after(
  async () => {
    await site?.dispose()
  },
  { timeout: 60000 },
)

const open = async (browser, viewport, pagePath, worker = STAND_IN) => {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (error) => problems.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  await page.route(/\/identify-worker\.js/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: worker }),
  )
  await page.route(
    (url) => url.origin !== site.origin,
    (route) =>
      route.request().resourceType() === 'image'
        ? route.fulfill({ contentType: 'image/svg+xml', body: PIXEL })
        : route.abort(),
  )
  await page.goto(site.origin + pagePath, { waitUntil: 'load' })
  await page.locator('#identify-download').click()
  await page.locator('#identify-capture').waitFor({ state: 'visible' })
  return { context, page, problems }
}

const box = (page, selector) => page.locator(selector).boundingBox()
const near = (actual, expected, what, slack = 2) =>
  assert.ok(
    Math.abs(actual - expected) <= slack,
    `${what}: ${actual}, expected about ${expected}`,
  )
const within = (inner, viewport, what) =>
  assert.ok(
    inner.x >= 0 &&
      inner.y >= 0 &&
      inner.x + inner.width <= viewport.width + 0.5 &&
      inner.y + inner.height <= viewport.height + 0.5,
    `${what} is not wholly on screen: ${JSON.stringify(inner)}`,
  )
const noSidewaysScroll = async (page) =>
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    'the page scrolls sideways',
  )

/** The square, in the photo's own pixels. */
const square = async (page) => {
  const [x, y, size] = (
    await page.locator('#identify-crop').getAttribute('data-crop')
  )
    .split(' ')
    .map(Number)
  return { x, y, size }
}
const zone = (page) => page.locator('#identify-stage').getAttribute('data-zone')

/** A photo taller than wide, made in the page: 300 by 400 pixels. */
const tallPhoto = async (page) => {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 400
    const context = canvas.getContext('2d')
    context.fillStyle = '#285'
    context.fillRect(0, 0, 300, 400)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  return {
    name: 'tall.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  }
}

/** Turns the device, and waits for the page to have laid itself out again. */
const turn = async (page, viewport) => {
  await page.setViewportSize(viewport)
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  )
}

const cropIsOnScreen = async (page, viewport) => {
  const photo = await box(page, '#identify-crop')
  within(photo, viewport, 'the photo')
  within(await box(page, '#identify-run'), viewport, 'Identify')
  within(await box(page, '#identify-cancel'), viewport, 'Cancel')
  return photo
}

const photoOnTablet = async (browser) => {
  const { context, page, problems } = await open(
    browser,
    TABLET_WIDE,
    '/identify/photo',
  )
  try {
    // Two columns: take on the left with the tip under it, choose on the
    // right. The panel is as wide as the page's text column allows.
    const take = await box(page, 'label[for="identify-camera"]')
    const choose = await box(page, 'label[for="identify-file"]')
    const tip = await box(page, '.identify-choices > p')
    const panel = await box(page, '#identify')
    const column = await box(page, 'main .wrap')
    near(panel.width, column.width, 'the panel width')
    near(take.y, choose.y, 'take and choose are level')
    assert.ok(take.x + take.width <= choose.x, 'choose is right of take')
    assert.ok(
      choose.x >= panel.x + panel.width / 2,
      'choose is in the right half',
    )
    near(tip.x, take.x, 'the tip is under take')
    assert.ok(tip.y >= take.y + take.height, 'the tip is below take')
    assert.ok(tip.x + tip.width <= choose.x, 'the tip stays in the left column')
    await noSidewaysScroll(page)

    // A photo wider than tall: wholly visible, as large as the screen
    // allows, with the controls on screen.
    await page.locator('#identify-file').setInputFiles(photoPath)
    await page.locator('#identify-cropper').waitFor({ state: 'visible' })
    let photo = await cropIsOnScreen(page, TABLET_WIDE)
    near(
      photo.width / photo.height,
      500 / 375,
      'the photo keeps its shape',
      0.01,
    )
    const stage = await box(page, '#identify-stage')
    assert.ok(
      photo.width >= stage.width - 26 || photo.height >= stage.height - 26,
      'the photo fills the space it has',
    )
    assert.ok(photo.width > 700, `the photo is only ${photo.width} wide`)

    // The pointer shows what a drag would do.
    await page.locator('#identify-smaller').click()
    const start = await square(page)
    assert.deepEqual(start, { x: 109, y: 47, size: 281 })
    const scale = photo.width / 500
    const at = (x, y) => [photo.x + x * scale, photo.y + y * scale]
    const middle = start.x + start.size / 2
    await page.mouse.move(...at(middle, start.y + start.size / 2))
    assert.equal(await zone(page), 'move')
    await page.mouse.move(...at(start.x + start.size, start.y + start.size))
    assert.equal(await zone(page), 'se')
    await page.mouse.move(...at(start.x - 60, start.y - 60))
    assert.equal(await zone(page), null)

    // Dragging the top edge down by 60 photo pixels: the bottom edge and
    // the centre line stay, and it is still a square. The press is 10
    // screen pixels off the edge, inside the 44-pixel target.
    const [edgeX, edgeY] = at(middle, start.y)
    await page.mouse.move(edgeX, edgeY + 10)
    assert.equal(await zone(page), 'n')
    await page.mouse.down()
    await page.mouse.move(edgeX + 40, edgeY + 10 + 60 * scale, { steps: 4 })
    await page.mouse.up()
    const pulled = await square(page)
    near(pulled.size, start.size - 60, 'the size after an edge drag')
    near(pulled.y + pulled.size, start.y + start.size, 'the bottom edge')
    near(pulled.x + pulled.size / 2, middle, 'the centre line')

    // Dragging the bottom right corner out: the top left corner stays.
    const [cornerX, cornerY] = at(
      pulled.x + pulled.size,
      pulled.y + pulled.size,
    )
    await page.mouse.move(cornerX, cornerY)
    await page.mouse.down()
    await page.mouse.move(cornerX + 30 * scale, cornerY + 10, { steps: 4 })
    await page.mouse.up()
    const grown = await square(page)
    near(grown.x, pulled.x, 'the left edge after a corner drag')
    near(grown.y, pulled.y, 'the top edge after a corner drag')
    near(grown.size, pulled.size + 30, 'the size after a corner drag')

    // Dragging inside still moves it.
    const [insideX, insideY] = at(
      grown.x + grown.size / 2,
      grown.y + grown.size / 2,
    )
    await page.mouse.move(insideX, insideY)
    await page.mouse.down()
    await page.mouse.move(insideX + 20 * scale, insideY, { steps: 2 })
    await page.mouse.up()
    const moved = await square(page)
    near(moved.x, grown.x + 20, 'the left edge after a move')
    assert.equal(moved.size, grown.size)

    // Turning the tablet re-fits the photo and keeps the square.
    await turn(page, TABLET_TALL)
    photo = await cropIsOnScreen(page, TABLET_TALL)
    assert.ok(photo.width >= TABLET_TALL.width - 26, 'the photo uses the width')
    assert.equal(
      await page.locator('#identify-cropper').getAttribute('data-controls'),
      'below',
    )
    assert.deepEqual(await square(page), moved)
    await turn(page, TABLET_WIDE)

    // Cancel goes back to the page.
    await page.locator('#identify-cancel').click()
    await page.locator('#identify-cropper').waitFor({ state: 'hidden' })
    assert.match(await page.locator('#identify-status').textContent(), /^Ready/)
    assert.equal(await page.locator('#identify-results').isVisible(), false)

    // A photo taller than wide uses the full height, controls beside it.
    await page.locator('#identify-file').setInputFiles(await tallPhoto(page))
    await page.locator('#identify-cropper').waitFor({ state: 'visible' })
    photo = await cropIsOnScreen(page, TABLET_WIDE)
    assert.ok(
      photo.height >= TABLET_WIDE.height - 26,
      'the photo uses the height',
    )
    assert.equal(
      await page.locator('#identify-cropper').getAttribute('data-controls'),
      'side',
    )
    const run = await box(page, '#identify-run')
    assert.ok(
      run.x >= photo.x + photo.width,
      'the controls are beside the photo',
    )

    // Results: two columns, in the same order.
    await page.locator('#identify-run').click()
    await page.locator('#identify-results').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#identify-cropper').isVisible(), false)
    const items = page.locator('#identify-list > li')
    assert.ok((await items.count()) >= 3)
    const [first, second, third] = await Promise.all(
      [0, 1, 2].map((index) => items.nth(index).boundingBox()),
    )
    near(first.y, second.y, 'the first two results are level')
    assert.ok(second.x >= first.x + first.width, 'the second is to the right')
    near(third.x, first.x, 'the third starts a new row')
    assert.ok(third.y >= first.y + first.height)
    await noSidewaysScroll(page)

    // The crop can be changed afterwards. Escape leaves it as it was.
    await page.locator('#identify-recrop').click()
    await page.locator('#identify-cropper').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.locator('#identify-cropper').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('#identify-results').isVisible(), true)
    assert.deepEqual(problems, [])
  } finally {
    await context.close()
  }
}

const photoOnPhone = async (browser) => {
  const { context, page, problems } = await open(
    browser,
    PHONE,
    '/identify/photo',
  )
  try {
    // One column, in the old order: take, choose, tip.
    const take = await box(page, 'label[for="identify-camera"]')
    const choose = await box(page, 'label[for="identify-file"]')
    const tip = await box(page, '.identify-choices > p')
    near(take.x, choose.x, 'take and choose line up')
    assert.ok(choose.y >= take.y + take.height, 'choose is below take')
    assert.ok(tip.y >= choose.y + choose.height, 'the tip is below choose')
    await noSidewaysScroll(page)

    // A photo wider than tall uses the full width, controls below it.
    await page.locator('#identify-file').setInputFiles(photoPath)
    await page.locator('#identify-cropper').waitFor({ state: 'visible' })
    const photo = await cropIsOnScreen(page, PHONE)
    assert.ok(photo.width >= PHONE.width - 26, 'the photo uses the width')
    const run = await box(page, '#identify-run')
    assert.ok(
      run.y >= photo.y + photo.height,
      'the controls are below the photo',
    )

    // A finger on the left edge resizes the square.
    await page.locator('#identify-smaller').click()
    const start = await square(page)
    const scale = photo.width / 500
    const edge = [
      photo.x + start.x * scale,
      photo.y + (start.y + start.size / 2) * scale,
    ]
    await page.mouse.move(...edge)
    await page.mouse.down()
    await page.mouse.move(edge[0] + 40 * scale, edge[1], { steps: 4 })
    await page.mouse.up()
    const pulled = await square(page)
    near(pulled.size, start.size - 40, 'the size after an edge drag')
    near(pulled.x + pulled.size, start.x + start.size, 'the right edge')

    // Results in one column.
    await page.locator('#identify-run').click()
    await page.locator('#identify-results').waitFor({ state: 'visible' })
    const items = page.locator('#identify-list > li')
    const first = await items.nth(0).boundingBox()
    const second = await items.nth(1).boundingBox()
    near(first.x, second.x, 'the results line up')
    assert.ok(second.y >= first.y + first.height)
    await noSidewaysScroll(page)
    assert.deepEqual(problems, [])
  } finally {
    await context.close()
  }
}

const results = async (page) => {
  await page.locator('#identify-results').waitFor({ state: 'visible' })
  return (await page.locator('#identify-crop').getAttribute('data-crop')) ?? ''
}

// The page finds the bird: no crop step, the crop it used is shown, and the
// other bird in the photo is one press away.
const photoFindsTheBird = async (browser) => {
  const { context, page, problems } = await open(
    browser,
    PHONE,
    '/identify/photo',
    FINDER(true),
  )
  try {
    assert.equal(await page.locator('#identify-upgrade').isVisible(), false)
    await page.locator('#identify-file').setInputFiles(photoPath)
    // The larger bird, widened to a square: the whole height of the photo.
    assert.equal(await results(page), '0 0 375')
    assert.equal(await page.locator('#identify-cropper').isVisible(), false)
    assert.equal(await page.locator('#identify-found').isVisible(), true)
    assert.match(
      await page.locator('#identify-list .plate-credit').first().textContent(),
      /cropped to the bird this page found/,
    )
    assert.equal(
      await page.locator('#identify-timing').textContent(),
      'Found the bird in 30 ms and recognised it in 70 ms on this device. Runtime: relaxed SIMD build.',
    )
    const next = page.locator('#identify-next-bird')
    assert.equal(await next.isVisible(), true)
    within(
      await box(page, '#identify-next-bird'),
      { ...PHONE, height: 1e6 },
      'Another bird',
    )
    await noSidewaysScroll(page)

    // The other bird, then round to the first again.
    await next.click()
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-crop').dataset.crop === '245 0 255' &&
        !document.querySelector('#identify-results').hidden,
    )
    assert.equal(await page.locator('#identify-found').isVisible(), true)
    await next.click()
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-crop').dataset.crop === '0 0 375' &&
        !document.querySelector('#identify-results').hidden,
    )

    // "Change the crop" starts from the square the page chose. A square the
    // visitor confirms is theirs, and the page stops saying it chose it.
    await page.locator('#identify-recrop').click()
    await page.locator('#identify-cropper').waitFor({ state: 'visible' })
    assert.deepEqual(await square(page), { x: 0, y: 0, size: 375 })
    assert.equal(await page.locator('#identify-crop-note').isVisible(), false)
    await cropIsOnScreen(page, PHONE)
    await page.locator('#identify-smaller').click()
    await page.locator('#identify-run').click()
    assert.notEqual(await results(page), '0 0 375')
    assert.equal(await page.locator('#identify-found').isVisible(), false)
    assert.match(
      await page.locator('#identify-list .plate-credit').first().textContent(),
      /cropped to the square you chose/,
    )
    assert.match(
      await page.locator('#identify-timing').textContent(),
      /^Recognised in 70 ms/,
    )
    assert.deepEqual(problems, [])
  } finally {
    await context.close()
  }
}

// A visitor who has the recogniser from before the page could find the
// bird: it works as it did, and offers the detector without fetching it.
const photoOffersTheDetector = async (browser) => {
  const { context, page, problems } = await open(
    browser,
    PHONE,
    '/identify/photo',
    FINDER(false),
  )
  try {
    const offer = page.locator('#identify-upgrade')
    assert.equal(await offer.isVisible(), true)
    assert.match(await offer.textContent(), /one more download of 4\.4 MiB/)
    within(
      await box(page, '#identify-add-finder'),
      { ...PHONE, height: 1e6 },
      'the offer',
    )
    await noSidewaysScroll(page)
    await page.locator('#identify-file').setInputFiles(photoPath)
    await page.locator('#identify-cropper').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#identify-crop-note').isVisible(), false)
    assert.match(
      await page.locator('#identify-status').textContent(),
      /^Photo ready/,
    )
    await page.locator('#identify-cancel').click()

    await page.locator('#identify-add-finder').click()
    await offer.waitFor({ state: 'hidden' })
    assert.match(await page.locator('#identify-status').textContent(), /^Ready/)
    await page.locator('#identify-file').setInputFiles(photoPath)
    assert.equal(await results(page), '0 0 375')
    assert.equal(await page.locator('#identify-cropper').isVisible(), false)
    assert.deepEqual(problems, [])
  } finally {
    await context.close()
  }
}

const sound = async (browser) => {
  for (const viewport of [TABLET_WIDE, PHONE]) {
    const { context, page, problems } = await open(
      browser,
      viewport,
      '/identify/sound',
    )
    try {
      // Listen is the first button in the row that Record is also in.
      const record = await box(page, '#identify-listen')
      const choose = await box(page, 'label[for="identify-file"]')
      const tip = await box(page, '.identify-choices > p:not([id]) >> nth=0')
      if (viewport === TABLET_WIDE) {
        // Record on the left with the tip under it, choose on the right.
        near(record.y, choose.y, 'record and choose are level')
        assert.ok(record.x + record.width <= choose.x)
        near(tip.x, record.x, 'the tip is under record')
        assert.ok(tip.y >= record.y + record.height)
        assert.ok(tip.x + tip.width <= choose.x)
      } else {
        near(record.x, choose.x, 'record and choose line up')
        assert.ok(choose.y >= record.y + record.height)
        assert.ok(tip.y >= choose.y + choose.height)
      }
      await noSidewaysScroll(page)
      assert.deepEqual(problems, [])
    } finally {
      await context.close()
    }
  }
}

for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const run = (scenario) => async () => {
    const browser = await type.launch()
    try {
      await scenario(browser)
    } finally {
      await browser.close()
    }
  }
  const options = { skip, timeout: 120000 }
  test(
    `${name}: identify by photo uses a landscape tablet's width, and the crop square's edges drag`,
    options,
    run(photoOnTablet),
  )
  test(
    `${name}: identify by photo stacks on a phone and crops full width`,
    options,
    run(photoOnPhone),
  )
  test(
    `${name}: identify by photo crops to the bird it finds, and offers the other one`,
    options,
    run(photoFindsTheBird),
  )
  test(
    `${name}: identify by photo offers the detector to a visitor who has the recogniser without it`,
    options,
    run(photoOffersTheDetector),
  )
  test(
    `${name}: identify by sound has the same two columns`,
    options,
    run(sound),
  )
}
