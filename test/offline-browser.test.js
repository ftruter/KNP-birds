import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test, before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { MODEL_ASSETS, PHOTO_MODEL } from '../src/identify.js'
import { deriveOffline } from '../src/offline.js'
import { readCatalog } from '../scripts/seed.mjs'
import { startBundledSite } from './bundle-site.js'

// The site saved to a home screen, in real browsers: the download panel,
// resuming, what is kept and deleted, and browsing with the network off.
// The models in the bucket are files of the right size filled with zeros;
// nothing here runs a recogniser. Skipped only where Playwright's browsers
// are not installed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIB = 1048576
const SOUND_CACHE = `identify-sound-${MODEL_ASSETS.version}`
const PHOTO_CACHE = `identify-photo-${PHOTO_MODEL.version}`
const SOUND_MODEL = `/models/${MODEL_ASSETS.version}/${MODEL_ASSETS.model.file}`
const PHOTO_FILE = `/models/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`

const installed = async (type) =>
  access(type.executablePath()).then(
    () => true,
    () => false,
  )
const skip =
  (await installed(chromium)) && (await installed(webkit))
    ? false
    : 'Playwright browsers are not installed'

let site
let roller
let photo

before(
  async () => {
    if (skip) return
    site = await startBundledSite()
    const bucket = await site.mf.getR2Bucket('IMAGES')
    const type = (file) =>
      file.endsWith('.wasm')
        ? 'application/wasm'
        : file.endsWith('.tflite')
          ? 'application/octet-stream'
          : 'text/javascript'
    for (const item of [MODEL_ASSETS.model, ...MODEL_ASSETS.runtime])
      await bucket.put(
        `models/${MODEL_ASSETS.version}/${item.file}`,
        new Uint8Array(item.bytes),
        { httpMetadata: { contentType: type(item.file) } },
      )
    await bucket.put(
      `models/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`,
      new Uint8Array(PHOTO_MODEL.bytes),
    )
    // One family's photographs and clips are copied into the bucket, as
    // scripts/publish-media.mjs would, and listed with their sizes.
    photo = await readFile(
      path.join(root, 'test/fixtures/identify-photo/crested-barbet.jpg'),
    )
    const clip = new Uint8Array(2000).fill(7)
    const { species, families } = await readCatalog()
    const family = families.find((doc) => doc.slug === 'coraciidae')
    const members = species.filter((doc) => doc.family === 'coraciidae')
    roller = members.find((doc) => doc.slug === 'coracias-caudatus')
    const mirror = { images: {}, audio: {} }
    for (const doc of members) {
      const image = doc.images[0]
      mirror.images[image.key] = {
        bytes: photo.length,
        source: image.fileUrl,
      }
      await bucket.put(`offline/${image.key}`, photo, {
        httpMetadata: { contentType: 'image/jpeg' },
      })
      const recording = doc.calls[0]?.recordings?.[0]
      if (!recording) continue
      mirror.audio[recording.key] = {
        bytes: clip.length,
        source: recording.fileUrl,
      }
      await bucket.put(`offline/${recording.key}`, clip, {
        httpMetadata: { contentType: 'audio/mpeg' },
      })
    }
    const doc = deriveOffline(members, [family], mirror)
    // A handful of pages, so each test does not save all 587.
    doc.pages = [
      '/',
      '/families',
      '/family/coraciidae',
      '/species/coracias-caudatus',
    ]
    const kv = await site.mf.getKVNamespace('BIRDS_KV')
    await kv.put('index/offline', JSON.stringify(doc))
  },
  { timeout: 240000 },
)
after(
  async () => {
    await site?.dispose()
  },
  { timeout: 60000 },
)

/** A page in a fresh browser profile. `standalone` opens it as from the home screen. */
const open = async (browser, { standalone = true, connection = null } = {}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  if (standalone)
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { get: () => true })
    })
  if (connection)
    await context.addInitScript((value) => {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ ...value, addEventListener() {} }),
      })
    }, connection)
  const page = await context.newPage()
  const errors = []
  // WebKit reports a fetch that was cut off by leaving the page as a page
  // error. The page script expects that and carries on at the next page.
  page.on('pageerror', (error) => {
    if (!/due to access control checks/.test(String(error)))
      errors.push(String(error))
  })
  return { context, page, errors }
}

const row = (page, id) => page.locator(`#offline-${id}`)
const sizeOf = (page, id) =>
  page
    .locator(`#offline-${id}`)
    .locator('xpath=..')
    .locator('.offline-size')
    .innerText()
const phase = (page, id) =>
  page
    .locator(`#offline-${id}`)
    .locator('xpath=../..')
    .getAttribute('data-phase')
const until = (page, id, wanted) =>
  page.waitForFunction(
    ([box, value]) =>
      document.querySelector(box)?.closest('li')?.dataset.phase === value,
    [`#offline-${id}`, wanted],
    { timeout: 60000 },
  )
/** Every address in Cache Storage, by cache name, leaving out saved pages. */
const stored = (page) =>
  page.evaluate(async () => {
    const found = {}
    for (const name of await caches.keys()) {
      if (name.startsWith('offline-pages-')) continue
      const keys = await (await caches.open(name)).keys()
      found[name] = keys.map((request) => {
        const url = new URL(request.url)
        return url.pathname + url.search
      })
    }
    return found
  })

const each = (name, body) => {
  for (const [label, type] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ])
    test(`${label}: ${name}`, { skip, timeout: 180000 }, async () => {
      const browser = await type.launch()
      try {
        await body(browser, label)
      } finally {
        await browser.close()
      }
    })
}

each('in a browser tab nothing changes', async (browser) => {
  const { page, errors } = await open(browser, { standalone: false })
  const requests = []
  page.on('request', (request) =>
    requests.push(new URL(request.url()).pathname),
  )
  await page.goto(`${site.origin}/`, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('#offline-panel').isHidden(), true)
  assert.equal(
    await page.evaluate(async () =>
      'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
    ),
    0,
  )
  assert.ok(!requests.includes('/offline.json'))
  assert.ok(!requests.includes('/sw.js'))
  assert.equal(await page.evaluate(async () => (await caches.keys()).length), 0)
  assert.deepEqual(errors, [])
})

each(
  'ticking downloads with progress, and unticking deletes',
  async (browser) => {
    const { page, errors } = await open(browser)
    await page.goto(`${site.origin}/`)
    await page.locator('#offline-panel').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#offline-rows input').count(), 6)
    const total = await sizeOf(page, 'photo-model')
    assert.match(total, /^\(\d+\.\d MiB\)$/)
    assert.equal(await row(page, 'photo-model').isChecked(), false)

    // The progress text is caught as it changes, in the form the issue gives.
    await page.evaluate(() => {
      window.seen = []
      const size = document
        .querySelector('#offline-photo-model')
        .closest('li')
        .querySelector('.offline-size')
      new MutationObserver(() => window.seen.push(size.textContent)).observe(
        size,
        { childList: true, characterData: true, subtree: true },
      )
    })
    await row(page, 'photo-model').check()
    await until(page, 'photo-model', 'done')
    const seen = await page.evaluate(() => window.seen)
    const progress = seen.filter((text) => text.includes('%'))
    assert.ok(progress.length > 0, 'no progress was shown')
    for (const text of progress)
      assert.match(
        text,
        /^\(⬇︎downloaded \d+\.\d MiB ~\d+\.\d% of \d+\.\d MiB\)$/,
        text,
      )
    // The total in the progress text is the total that was quoted.
    assert.ok(progress.every((text) => text.endsWith(` of ${total.slice(1)}`)))
    assert.equal(await sizeOf(page, 'photo-model'), total)
    assert.equal(await row(page, 'photo-model').isChecked(), true)
    assert.match(
      await page.locator('#offline-status').innerText(),
      /Photo recognition model is saved on this device/,
    )

    const caches = await stored(page)
    // The model is where the identify page looks, so it will not ask again.
    assert.deepEqual(caches[PHOTO_CACHE], [PHOTO_FILE])
    assert.equal(caches[SOUND_CACHE].length, 3)
    assert.ok(!caches[SOUND_CACHE].includes(SOUND_MODEL))
    assert.equal((caches['offline-partial'] ?? []).length, 0)
    const length = await page.evaluate(
      async ([name, url]) =>
        (await (await (await caches.open(name)).match(url)).arrayBuffer())
          .byteLength,
      [PHOTO_CACHE, PHOTO_FILE],
    )
    assert.equal(length, PHOTO_MODEL.bytes)

    // The other model shares the runtime: its row starts part of the way.
    // After a restart the box is still ticked, from what is on the device.
    await page.reload()
    await until(page, 'photo-model', 'done')
    assert.equal(await row(page, 'photo-model').isChecked(), true)
    assert.equal(await row(page, 'sound-model').isChecked(), false)

    await row(page, 'photo-model').uncheck()
    await until(page, 'photo-model', 'off')
    const after = await stored(page)
    assert.deepEqual(after[PHOTO_CACHE] ?? [], [])
    assert.deepEqual(after[SOUND_CACHE] ?? [], [])
    assert.deepEqual(errors, [])
  },
)

each(
  'an interrupted model download carries on from the parts it has',
  async (browser) => {
    const { page, errors } = await open(browser)
    // The first visit registers the service worker, as a first launch does.
    // (Playwright's WebKit drops Cache Storage written before that.)
    await page.goto(`${site.origin}/families`)
    await page.evaluate(() => navigator.serviceWorker.ready)
    // Set up from a document the page script does not run in.
    await page.goto(`${site.origin}/offline.json`)
    // As a download stopped part of the way: the option was asked for, and the
    // first part is on the device. The part is marked so it can be told apart
    // from what the server would send.
    await page.evaluate(async (url) => {
      const part = new Uint8Array(4 * 1048576).fill(7)
      const parts = await caches.open('offline-partial')
      await parts.put(`${url}?part=0-${part.length - 1}`, new Response(part))
      localStorage.setItem(
        'offline-rows',
        JSON.stringify({ 'sound-model': { wanted: true, done: null } }),
      )
    }, SOUND_MODEL)
    // WebKit can lose a cache write that is followed at once by leaving the
    // page, so the part is read back before moving on.
    for (let tries = 0; ; tries += 1) {
      const kept = await page.evaluate(
        async (url) =>
          Boolean(
            await (
              await caches.open('offline-partial')
            ).match(`${url}?part=0-${4 * 1048576 - 1}`),
          ),
        SOUND_MODEL,
      )
      if (kept) break
      assert.ok(tries < 50, 'the part was not stored')
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(300)
    // Any page carries on, not only the one with the panel.
    await page.goto(`${site.origin}/families`)
    const saved = () =>
      page.evaluate(
        async ([name, url]) =>
          Boolean(await (await caches.open(name)).match(url)),
        [SOUND_CACHE, SOUND_MODEL],
      )
    for (let tries = 0; !(await saved()); tries += 1) {
      assert.ok(tries < 300, 'the download did not finish')
      await page.waitForTimeout(200)
    }
    const bytes = await page.evaluate(
      async ([name, url]) => {
        const data = new Uint8Array(
          await (await (await caches.open(name)).match(url)).arrayBuffer(),
        )
        return [data.length, data[0], data[4 * 1048576 - 1], data[4 * 1048576]]
      },
      [SOUND_CACHE, SOUND_MODEL],
    )
    // The kept part was used as it was; the rest came from the server.
    assert.deepEqual(bytes, [MODEL_ASSETS.model.bytes, 7, 7, 0])

    await page.goto(`${site.origin}/`)
    await until(page, 'sound-model', 'done')
    assert.equal(await row(page, 'sound-model').isChecked(), true)
    assert.equal(((await stored(page))['offline-partial'] ?? []).length, 0)
    assert.deepEqual(errors, [])
  },
)

each('with Data Saver on, a download is asked about first', async (browser) => {
  const { page, errors } = await open(browser, {
    connection: { type: 'cellular', saveData: true },
  })
  await page.goto(`${site.origin}/`)
  await page.locator('#offline-panel').waitFor({ state: 'visible' })
  await row(page, 'family-images').check()
  const message = page.locator('#offline-family-images-message')
  await message.waitFor({ state: 'visible' })
  assert.match(
    await message.innerText(),
    /^You're on mobile data and Data Saver is on\. Download \d+\.\d MiB now\?/,
  )
  // Declining leaves the box unticked and downloads nothing.
  await message.getByRole('button', { name: 'Not now' }).click()
  assert.equal(await row(page, 'family-images').isChecked(), false)
  assert.equal(await message.isHidden(), true)
  assert.deepEqual((await stored(page))['offline-media'] ?? [], [])

  await row(page, 'family-images').check()
  await message.getByRole('button', { name: 'Download' }).click()
  await until(page, 'family-images', 'done')
  assert.equal((await stored(page))['offline-media'].length, 3)
  assert.deepEqual(errors, [])
})

each(
  'the larger option covers the smaller, and files are stored once',
  async (browser) => {
    const { page, errors } = await open(browser)
    await page.goto(`${site.origin}/`)
    await page.locator('#offline-panel').waitFor({ state: 'visible' })
    await row(page, 'family-images').check()
    await until(page, 'family-images', 'done')
    await row(page, 'species-images').check()
    await until(page, 'species-images', 'done')
    assert.equal((await stored(page))['offline-media'].length, 5)
    assert.equal(await phase(page, 'family-images'), 'included')
    assert.equal(await row(page, 'family-images').isChecked(), true)
    assert.equal(await row(page, 'family-images').isDisabled(), true)
    assert.match(
      await page.locator('#offline-family-images-message').innerText(),
      /Included in “Images for bird species”/,
    )
    // Unticking the larger one keeps what the smaller one was ticked for.
    await row(page, 'species-images').uncheck()
    await until(page, 'species-images', 'off')
    await until(page, 'family-images', 'done')
    assert.equal((await stored(page))['offline-media'].length, 3)
    assert.equal(await row(page, 'family-images').isDisabled(), false)
    assert.deepEqual(errors, [])
  },
)

each(
  'saved pages, photographs and clips work with the network off',
  async (browser) => {
    const { context, page, errors } = await open(browser)
    await page.goto(`${site.origin}/`)
    await page.locator('#offline-panel').waitFor({ state: 'visible' })
    await page.waitForFunction(
      () =>
        /4 pages are saved on this device/.test(
          document.querySelector('#offline-pages').textContent,
        ),
      null,
      { timeout: 60000 },
    )
    await row(page, 'species-images').check()
    await row(page, 'species-clips').check()
    await until(page, 'species-images', 'done')
    await until(page, 'species-clips', 'done')
    await page.evaluate(() => navigator.serviceWorker.ready)

    await context.setOffline(true)
    await page.goto(`${site.origin}/species/coracias-caudatus`)
    assert.match(await page.locator('h1').innerText(), /Lilac-breasted Roller/)
    // The photograph is shown from the copy on the device, not its source.
    const image = roller.images[0]
    const shown = page.locator(`img[src="/images/offline/${image.key}"]`)
    await shown.first().waitFor({ state: 'attached' })
    await page.waitForFunction(
      (src) => document.querySelector(`img[src="${src}"]`)?.naturalWidth > 0,
      `/images/offline/${image.key}`,
    )
    assert.equal(await page.locator(`img[src="${image.fileUrl}"]`).count(), 0)
    // A clip is played in parts: Safari needs a 206 for that.
    const clip = roller.calls[0].recordings[0]
    assert.ok(
      (await page.locator(`audio[src="/audio/offline/${clip.key}"]`).count()) >
        0,
    )
    const part = await page.evaluate(async (url) => {
      const response = await fetch(url, { headers: { range: 'bytes=10-19' } })
      return [
        response.status,
        response.headers.get('content-range'),
        (await response.arrayBuffer()).byteLength,
      ]
    }, `/audio/offline/${clip.key}`)
    assert.deepEqual(part, [206, 'bytes 10-19/2000', 10])

    // Styles and the family page are saved too; an unsaved page says so.
    await page.goto(`${site.origin}/family/coraciidae`)
    assert.match(await page.locator('h1').innerText(), /Rollers/)
    assert.notEqual(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('.site-header'))
            .backgroundColor,
      ),
      'rgba(0, 0, 0, 0)',
    )
    await page.goto(`${site.origin}/species/merops-apiaster`)
    assert.match(await page.locator('h1').innerText(), /No signal/)

    // Back on the home page, with no network, the boxes are still ticked.
    await page.goto(`${site.origin}/`)
    await until(page, 'species-images', 'done')
    await until(page, 'species-clips', 'done')
    assert.equal(await row(page, 'photo-model').isChecked(), false)
    assert.deepEqual(errors, [])
  },
)

each(
  'the runtime build is chosen as LiteRT.js would choose it',
  async (browser) => {
    const { page } = await open(browser)
    await page.goto(`${site.origin}/`)
    await page.locator('#offline-panel').waitFor({ state: 'visible' })
    await row(page, 'photo-model').check()
    await until(page, 'photo-model', 'done')
    const wasm = (await stored(page))[SOUND_CACHE].find((url) =>
      url.endsWith('.wasm'),
    )
    // The identify page may run WebAssembly, so it can ask the way LiteRT.js does.
    await page.goto(`${site.origin}/identify/photo`)
    const relaxed = await page.evaluate(() =>
      WebAssembly.instantiate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
          15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11,
        ]),
      ).then(
        () => true,
        () => false,
      ),
    )
    assert.equal(wasm.includes('compat'), !relaxed)
  },
)

each('an update is offered, never downloaded unasked', async (browser) => {
  const { page, errors } = await open(browser)
  await page.goto(`${site.origin}/offline.json`)
  // As if the option was complete under an earlier set of files.
  await page.evaluate(() =>
    localStorage.setItem(
      'offline-rows',
      JSON.stringify({ 'family-images': { wanted: true, done: 'earlier' } }),
    ),
  )
  await page.goto(`${site.origin}/`)
  await until(page, 'family-images', 'update')
  assert.equal(await row(page, 'family-images').isChecked(), true)
  const message = page.locator('#offline-family-images-message')
  assert.match(
    await message.innerText(),
    /^An update is available: \d+\.\d MiB\./,
  )
  await page.waitForTimeout(500)
  assert.deepEqual((await stored(page))['offline-media'] ?? [], [])
  await message.getByRole('button', { name: 'Update' }).click()
  await until(page, 'family-images', 'done')
  assert.equal((await stored(page))['offline-media'].length, 3)
  assert.equal(await message.isHidden(), true)
  assert.deepEqual(errors, [])
})

each(
  'a failed download says so and carries on when the signal is back',
  async (browser) => {
    const { context, page } = await open(browser)
    await page.goto(`${site.origin}/`)
    await page.locator('#offline-panel').waitFor({ state: 'visible' })
    await context.setOffline(true)
    await row(page, 'species-clips').check()
    await until(page, 'species-clips', 'failed')
    const message = page.locator('#offline-species-clips-message')
    assert.match(await message.innerText(), /the download stopped/)
    assert.equal(
      await message.getByRole('button', { name: 'Retry' }).count(),
      1,
    )
    assert.match(
      await page.locator('#offline-status').innerText(),
      /the download stopped/,
    )
    // Still ticked: it is wanted, and it carries on by itself.
    assert.equal(await row(page, 'species-clips').isChecked(), true)
    await context.setOffline(false)
    await until(page, 'species-clips', 'done')
    assert.equal(await message.isHidden(), true)
  },
)
