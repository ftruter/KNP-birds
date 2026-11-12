import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { test, before, after } from 'node:test'
import { chromium, webkit } from 'playwright'
import { DEFAULT_MODEL, modelFiles } from '../scripts/publish-models.mjs'
import { startBundledSite } from './bundle-site.js'

// The model downloaded from the home page's panel is the one the identify
// page uses: with the network off, the page starts the real recogniser from
// the device and does not ask to download it. The model is not in the
// repository, so this is skipped unless it is on disk:
//   IDENTIFY_MODEL  audio-model-fp16.tflite (default: data/models)
const modelPath = process.env.IDENTIFY_MODEL || DEFAULT_MODEL
const skip = (await access(modelPath).then(
  () => true,
  () => false,
))
  ? false
  : `no model at ${modelPath}`

let site

before(
  async () => {
    if (skip) return
    site = await startBundledSite()
    const bucket = await site.mf.getR2Bucket('IMAGES')
    for (const entry of await modelFiles(modelPath))
      await bucket.put(entry.key, entry.bytes, {
        httpMetadata: { contentType: entry.contentType },
      })
    const kv = await site.mf.getKVNamespace('BIRDS_KV')
    await kv.put(
      'index/offline',
      JSON.stringify({
        kind: 'offline',
        pages: ['/', '/identify/sound'],
        iconic: [],
        images: [],
        clips: [],
      }),
    )
  },
  { timeout: 240000 },
)
after(
  async () => {
    await site?.dispose()
  },
  { timeout: 60000 },
)

// LiteRT writes its start-up log to the console's error stream.
const RUNTIME_LOG = /^(INFO|WARNING): |^Created TensorFlow Lite /

for (const [label, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
])
  test(
    `${label}: the identify page runs the downloaded model with the network off`,
    { skip, timeout: 240000 },
    async () => {
      const browser = await type.launch()
      try {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        })
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'standalone', { get: () => true })
          // Silence in place of the microphone: a tone would be heard as
          // some bird, whose photograph is not on the device in this test.
          window.MediaDevices.prototype.getUserMedia = async () => {
            const Context = window.AudioContext || window.webkitAudioContext
            const audio = new Context()
            const out = audio.createMediaStreamDestination()
            const quiet = audio.createGain()
            quiet.gain.value = 0
            const tone = audio.createOscillator()
            tone.connect(quiet)
            quiet.connect(out)
            tone.start()
            await audio.resume()
            return out.stream
          }
        })
        const page = await context.newPage()
        const problems = []
        page.on('pageerror', (error) => problems.push(String(error)))
        page.on('console', (message) => {
          if (message.type() === 'error' && !RUNTIME_LOG.test(message.text()))
            problems.push(message.text())
        })
        await page.goto(`${site.origin}/`)
        await page.locator('#offline-panel').waitFor({ state: 'visible' })
        await page.locator('#offline-sound-model').check()
        await page.waitForFunction(
          () =>
            document.querySelector('#offline-sound-model').closest('li').dataset
              .phase === 'done' &&
            /pages are saved/.test(
              document.querySelector('#offline-pages').textContent,
            ),
          null,
          { timeout: 120000 },
        )
        await page.evaluate(() => navigator.serviceWorker.ready)

        await context.setOffline(true)
        await page.goto(`${site.origin}/identify/sound`)
        await page.waitForFunction(
          () =>
            /^Ready\./.test(
              document.querySelector('#identify-status').textContent,
            ),
          null,
          { timeout: 120000 },
        )
        assert.equal(await page.locator('#identify-consent').isHidden(), true)
        assert.equal(await page.locator('#identify-capture').isVisible(), true)

        // Listening works with the network off too: a window of silence is
        // analysed on the device and nothing is heard in it.
        await page.locator('#identify-listen').click()
        await page
          .locator('#identify-listen-stop')
          .waitFor({ state: 'visible' })
        await page.waitForFunction(
          () =>
            document.querySelector('#identify-summary').textContent ===
            'Nothing recognised in the last 10 seconds.',
          null,
          { timeout: 30000 },
        )
        await page.locator('#identify-listen-stop').click()
        await page.waitForFunction(
          () =>
            document.querySelector('#identify-status').textContent ===
            'Stopped listening.',
        )
        assert.deepEqual(problems, [])
      } finally {
        await browser.close()
      }
    },
  )
