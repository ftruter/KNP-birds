import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
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
// Listening is fed two recordings at once, as the microphone:
//   IDENTIFY_CLIP_2  a Fiery-necked Nightjar recording (default: xeno-canto
//                    XC662460, from the same script)
const secondClipPath =
  process.env.IDENTIFY_CLIP_2 ||
  path.join(root, 'data/audio/files/XC662460.mp3')
const SECOND = 'caprimulgus-pectoralis'
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
const skipListening =
  skip ||
  ((await exists(secondClipPath))
    ? false
    : `no second recording at ${secondClipPath}`)

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
    // The guide photograph zooms as the plates on a species page do, and the
    // name beside it is still the link.
    assert.equal(await first.locator('a img').count(), 0)
    await zoomAndRestore(page, first.locator('.plate'), /Credit: \S/)
    assert.match(
      await first.locator('audio').getAttribute('aria-label'),
      /^Reference call of /,
    )
    // One closed credit disclosure beside the photograph and one beside the call.
    for (const place of ['.plate-thumb', '.identify-call']) {
      const credit = first.locator(`${place} details.credit`)
      assert.equal(await credit.count(), 1, place)
      assert.equal(await credit.getAttribute('open'), null, place)
      assert.match(await credit.locator('summary').textContent(), /^Credit: \S/)
      assert.ok(await credit.getAttribute('data-file'), place)
      await credit.locator('summary').click()
      assert.match(await credit.textContent(), /Saved on this site: (yes|no)\./)
    }
    assert.match(
      await page.locator('#identify-summary').textContent(),
      /No result is certain/,
    )
    assert.match(
      await page.locator('#identify-status').textContent(),
      /^Finished\. \d candidates? listed below\.$/,
    )
    // A 10-second recording is more than one 3-second window.
    assert.match(
      await page.locator('#identify-timing').textContent(),
      /^Recognised in \d+(\.\d)? m?s on this device: \d+ windows of 3 seconds, typically \d+(\.\d)? m?s each\. Runtime: (relaxed SIMD|compatibility) build\.$/,
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

/**
 * Replaces the microphone with the two recordings, looped and played
 * together. `window.__mic.gain` mutes them; `window.__mic.stream` is what the
 * page was given.
 */
const fakeMicrophone = async (context, page) => {
  const clips = {
    first: await readFile(clipPath),
    second: await readFile(secondClipPath),
  }
  await page.route(`${site.origin}/test-clip/*`, (route) =>
    route.fulfill({
      contentType: 'audio/mpeg',
      body: clips[new URL(route.request().url()).pathname.split('/').pop()],
    }),
  )
  await context.addInitScript(() => {
    const mic = { gain: null, stream: null }
    window.__mic = mic
    // On the prototype: WebKit does not keep a property that is set on
    // navigator.mediaDevices itself.
    window.MediaDevices.prototype.getUserMedia = async () => {
      const Context = window.AudioContext || window.webkitAudioContext
      const audio = new Context()
      const out = audio.createMediaStreamDestination()
      mic.gain = audio.createGain()
      // Half each, so the two together do not clip.
      mic.gain.gain.value = 0.5
      mic.gain.connect(out)
      for (const name of ['first', 'second']) {
        const bytes = await (await fetch(`/test-clip/${name}`)).arrayBuffer()
        const source = audio.createBufferSource()
        source.buffer = await new Promise((resolve, reject) =>
          audio.decodeAudioData(bytes, resolve, reject),
        )
        source.loop = true
        source.connect(mic.gain)
        source.start()
      }
      await audio.resume()
      mic.stream = out.stream
      return out.stream
    }
  })
}

const listed = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#identify-list > li h3 a')].map((link) =>
      link.getAttribute('href').replace('/species/', ''),
    ),
  )

const listensLive = async (browser) => {
  const { context, page, problems } = await open(browser)
  try {
    await fakeMicrophone(context, page)
    await ready(page)
    await page.locator('#identify-download').click()
    await page
      .locator('#identify-capture')
      .waitFor({ state: 'visible', timeout: 120000 })
    // Everything the status line says from here on.
    await page.evaluate(() => {
      window.__said = []
      const status = document.querySelector('#identify-status')
      new MutationObserver(() =>
        window.__said.push(status.textContent),
      ).observe(status, { childList: true, characterData: true, subtree: true })
    })

    const listen = page.locator('#identify-listen')
    const stop = page.locator('#identify-listen-stop')
    await listen.click()
    await stop.waitFor({ state: 'visible' })
    assert.equal(await listen.isVisible(), false)
    assert.equal(await page.locator('#identify-record').isVisible(), false)
    assert.equal(await page.locator('#identify-file').isDisabled(), true)
    assert.equal(await page.locator('#identify-level').isVisible(), true)
    assert.equal(
      await page.locator('#identify-results-heading').textContent(),
      'Heard in the last 10 seconds',
    )

    // Both birds are calling at once, and both are listed at once.
    await page.waitForFunction(
      (slugs) =>
        slugs.every((slug) =>
          document.querySelector(
            `#identify-list > li h3 a[href="/species/${slug}"]`,
          ),
        ),
      [EXPECTED.slug, SECOND],
      { timeout: 60000 },
    )
    const order = await listed(page)
    const row = page.locator('#identify-list > li', {
      has: page.locator(`a[href="/species/${EXPECTED.slug}"]`),
    })
    assert.match(
      await row.locator('.identify-verdict').textContent(),
      /^(Likely|Possible)/,
    )
    assert.match(
      await row.locator('audio').getAttribute('aria-label'),
      /^Reference call of /,
    )
    assert.match(
      await page.locator('#identify-summary').textContent(),
      /^\d+ species heard in the last 10 seconds\. No result is certain/,
    )
    // The list is not a live region: it changes every second.
    assert.equal(
      await page
        .locator('#identify-list')
        .evaluate((list) => list.closest('[aria-live], [role="status"]')),
      null,
    )

    // While they keep calling, rows that are listed keep their order.
    await page.waitForTimeout(4000)
    const later = await listed(page)
    assert.deepEqual(
      later.filter((slug) => order.includes(slug)),
      order.filter((slug) => later.includes(slug)),
    )

    // A reference call that plays pauses listening, so the page does not
    // hear itself, and the list is as it was when listening carries on.
    await page.evaluate(() => {
      window.__mark = window.__said.length
      document
        .querySelector('#identify-list audio')
        .dispatchEvent(new Event('play'))
    })
    await page.waitForFunction(() =>
      window.__said
        .slice(window.__mark)
        .some((text) => /^Listening is paused while /.test(text)),
    )
    await page.waitForFunction(() =>
      window.__said.slice(window.__mark).includes('Listening.'),
    )
    assert.deepEqual(await listed(page), later)

    // Silence: a species stays for 10 seconds after it was last heard, then
    // goes. The last window with sound in it ends up to 3 seconds from now.
    await page.evaluate(() => {
      window.__mic.gain.gain.value = 0
    })
    await page.waitForTimeout(6000)
    assert.ok((await listed(page)).includes(EXPECTED.slug), 'dropped early')
    await page.waitForFunction(
      () => document.querySelector('#identify-list').children.length === 0,
      null,
      { timeout: 20000 },
    )
    assert.equal(await page.locator('#identify-list').isVisible(), false)
    assert.equal(
      await page.locator('#identify-summary').textContent(),
      'Nothing recognised in the last 10 seconds.',
    )

    // It calls again and is listed again, but is announced only once.
    await page.evaluate(() => {
      window.__mic.gain.gain.value = 0.5
    })
    await page
      .locator(`#identify-list a[href="/species/${EXPECTED.slug}"]`)
      .waitFor({ timeout: 30000 })
    const said = await page.evaluate(() => window.__said)
    assert.equal(
      said.filter(
        (text) => /^Heard: /.test(text) && text.includes(EXPECTED.name),
      ).length,
      1,
      JSON.stringify(said),
    )
    assert.ok(
      said.every((text) =>
        /^(Listening( is paused while .*)?\.|Heard: )/.test(text),
      ),
      JSON.stringify(said),
    )

    // Stop: the microphone is released and nothing more is analysed.
    await stop.click()
    await listen.waitFor({ state: 'visible' })
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-status').textContent ===
        'Stopped listening.',
    )
    assert.equal(await stop.isVisible(), false)
    assert.equal(await page.locator('#identify-record').isEnabled(), true)
    assert.equal(await page.locator('#identify-file').isEnabled(), true)
    assert.equal(
      await page.evaluate(() =>
        window.__mic.stream
          .getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
      true,
    )
    assert.equal(
      await page.locator('#identify-results-heading').textContent(),
      'Heard before listening stopped',
    )
    const timing = await page.locator('#identify-timing').textContent()
    assert.match(
      timing,
      /^Recognised in \d+(\.\d)? m?s on this device: \d+ windows of 3 seconds, typically \d+(\.\d)? m?s each\. Runtime: (relaxed SIMD|compatibility) build\.$/,
    )
    const kept = await listed(page)
    await page.waitForTimeout(2500)
    assert.deepEqual(await listed(page), kept)
    assert.equal(await page.locator('#identify-timing').textContent(), timing)

    // Listening again starts from an empty list, and stops when the page
    // is hidden.
    await listen.click()
    await stop.waitFor({ state: 'visible' })
    assert.deepEqual(await listed(page), [])
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForFunction(
      () =>
        document.querySelector('#identify-status').textContent ===
        'Listening stopped because this page was hidden.',
    )
    assert.equal(await listen.isVisible(), true)
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
    `${label} listens and lists two birds calling at once`,
    { skip: skipListening, timeout: 300000 },
    async () => {
      const browser = await type.launch()
      try {
        await listensLive(browser)
      } finally {
        await browser.close()
      }
    },
  )
