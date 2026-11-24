import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test, before, after } from 'node:test'
import { chromium, webkit } from 'playwright'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

let origin = ''
let closeServer = async () => {}

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#1d4e2a"/></svg>'

const silentWav = () => {
  const samples = 8000
  const data = samples * 2
  const buffer = Buffer.alloc(44 + data)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + data, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(data, 40)
  return buffer
}

const wav = silentWav()

const launchChromium = async () => {
  try {
    return await chromium.launch({
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
  } catch {
    return chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
  }
}

before(async () => {
  const { records } = await loadStore()
  const kv = mockKv(records)
  const bucket = mockBucket().bucket
  const server = createServer(async (req, res) => {
    try {
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
      })
      const ctx = requestContext()
      const response = await handleRequest(
        request,
        { BIRDS_KV: kv.kv, IMAGES: bucket },
        ctx,
      )
      await ctx.drain()
      const headers = {}
      response.headers.forEach((value, key) => {
        if (key !== 'transfer-encoding') headers[key] = value
      })
      res.writeHead(response.status, headers)
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end(error instanceof Error ? error.message : 'error')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  closeServer = () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
})

after(async () => {
  await closeServer()
})

const prepare = async (page, { stripAudio = false } = {}) => {
  let images = 0
  const media = []
  page.on('request', (request) => {
    if (request.resourceType() === 'media') media.push(request.url())
  })
  let failNext = true
  await page.route('**/*', (route) => {
    const type = route.request().resourceType()
    // This environment's WebKit crashes when a document contains <audio>,
    // the same limit the other browser tests avoid. Layout is still checked.
    if (stripAudio && type === 'document')
      return route.fetch().then(async (response) => {
        const body = (await response.text()).replace(
          /<audio\b[\s\S]*?<\/audio>/g,
          '',
        )
        return route.fulfill({ response, body })
      })
    if (type === 'media')
      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: wav,
      })
    if (type !== 'image') return route.continue()
    const remote = !route.request().url().startsWith(origin)
    if (!remote) return route.continue()
    images += 1
    if (failNext) {
      failNext = false
      return route.abort()
    }
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: svg,
    })
  })
  return {
    media,
    imageCount: () => images,
  }
}

const columns = (page) =>
  page.locator('.search-results').evaluate((list) => {
    const value = getComputedStyle(list).gridTemplateColumns
    return value.split(' ').filter(Boolean).length
  })

const exercise = async (browser, { stripAudio = false } = {}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  try {
    const { media, imageCount } = await prepare(page, { stripAudio })
    await page.goto(`${origin}/search?q=roller`)
    await page.locator('#search-count').waitFor()
    const plays = page.locator('.search-play')
    assert.equal(await columns(page), 1)
    if (!stripAudio) {
      await plays.first().waitFor()
      const button = await plays.first().boundingBox()
      assert.ok(
        button && button.height >= 60,
        'the play control is a large target',
      )
      const card = await page.locator('.search-result').first().boundingBox()
      assert.ok(card && button.width > card.width * 0.7)
    }

    // Clips wait until someone plays them. Photographs are marked lazy; a
    // long result list must not fetch every one up front.
    const photos = await page.locator('.search-photo img').count()
    assert.equal(
      await page.locator('.search-photo img[loading="lazy"]').count(),
      photos,
    )
    assert.equal(media.length, 0)
    if (photos > 4)
      assert.ok(photos > imageCount(), 'not every photograph was fetched')

    const broken = page.locator('.search-photo.is-missing', {
      hasText: 'Photograph unavailable',
    })
    // A failed photograph adds the fallback. WebKit in this environment does
    // not always request a lazy image, so the error is fired directly then.
    if ((await broken.count()) === 0)
      await page
        .locator('.search-photo img')
        .first()
        .evaluate((img) => {
          img.dispatchEvent(new Event('error'))
        })
    await broken.waitFor()
    assert.equal(await broken.count(), 1)

    await page.setViewportSize({ width: 1280, height: 900 })
    assert.equal(await columns(page), 3)
    await page.setViewportSize({ width: 800, height: 900 })
    assert.equal(await columns(page), 2)
    await page.setViewportSize({ width: 390, height: 844 })
    if (stripAudio) {
      assert.equal(await page.locator('.search-play:visible').count(), 0)
      assert.deepEqual(errors, [])
      return
    }

    await plays.nth(0).click()
    await page.waitForFunction(
      () =>
        document
          .querySelectorAll('.search-play')[0]
          ?.getAttribute('aria-pressed') === 'true',
    )
    assert.equal(media.length, 1)
    assert.match(await plays.nth(0).innerText(), /Stop/)
    await plays.nth(1).click()
    await page.waitForFunction(() => {
      const buttons = document.querySelectorAll('.search-play')
      return (
        buttons[0]?.getAttribute('aria-pressed') === 'false' &&
        buttons[1]?.getAttribute('aria-pressed') === 'true'
      )
    })
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('audio')].filter(
            (audio) => !audio.paused,
          ).length,
      ),
      1,
    )
    await plays.nth(1).click()
    await page.waitForFunction(
      () =>
        document
          .querySelectorAll('.search-play')[1]
          ?.getAttribute('aria-pressed') === 'false',
    )

    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
}

const withoutScript = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  try {
    await page.route('**/app.js*', (route) => route.abort())
    await page.route('**/offline.js*', (route) => route.abort())
    await page.goto(`${origin}/search?q=lilac-breasted`)
    await page.locator('#search-count').waitFor()
    assert.equal(await page.locator('.search-play:visible').count(), 0)
    const audio = page.locator('.search-call audio')
    assert.ok((await audio.count()) > 0)
    assert.equal(await audio.first().getAttribute('controls'), '')
    assert.equal(await audio.first().getAttribute('preload'), 'none')
  } finally {
    await context.close()
  }
}

const lazyList = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  try {
    let images = 0
    await page.route('**/*', (route) => {
      if (route.request().resourceType() !== 'image') return route.continue()
      if (route.request().url().startsWith(origin)) return route.continue()
      images += 1
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: svg,
      })
    })
    await page.goto(`${origin}/search?q=grassland`)
    await page.locator('#search-count').waitFor()
    const photos = await page.locator('.search-photo img').count()
    assert.ok(photos >= 40)
    assert.ok(
      images < photos,
      `fetched ${images} photographs for ${photos} results`,
    )
  } finally {
    await context.close()
  }
}

test(
  'search cards stack on a phone, play one call, and fall back when a photograph fails',
  { timeout: 120000 },
  async () => {
    const browser = await launchChromium()
    try {
      await exercise(browser)
      await withoutScript(browser)
      await lazyList(browser)
    } finally {
      await browser.close()
    }
  },
)

test(
  'webkit search cards stack on a phone and fall back when a photograph fails',
  { timeout: 120000 },
  async () => {
    const browser = await webkit.launch()
    try {
      // WebKit here crashes if the document contains audio elements.
      await exercise(browser, { stripAudio: true })
    } finally {
      await browser.close()
    }
  },
)
