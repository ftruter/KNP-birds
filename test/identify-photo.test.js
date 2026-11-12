import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MODEL_CACHE } from '../src/cache.js'
import source from '../src/client/identify-photo.js'
import workerSource from '../src/client/identify-worker.js'
import {
  MODEL_ASSETS,
  PHOTO_MODEL,
  TRAINING_MANIFEST_URL,
  deriveIdentifyPhoto,
  modelBase,
  photoModelBase,
} from '../src/identify.js'
import { weakFamilies } from '../src/identify-photo-page.js'
import { IDENTIFY_CSP } from '../src/respond.js'
import { handleRequest } from '../src/worker.js'
import { photoModelFiles } from '../scripts/publish-models.mjs'
import { deriveAll, readCatalog, readPhotoModel } from '../scripts/seed.mjs'
import {
  loadStore,
  mockBucket,
  mockKv,
  readJson,
  requestContext,
} from './helpers.js'

// What every other page sends today. Written out, not imported, so a change
// to the shared policy fails here.
const PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self' https:; media-src 'self' https:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self'"
const PAGE_PERMISSIONS = 'camera=(), microphone=(), geolocation=()'

const client = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
)

const site = async (objects = {}) => {
  const { records } = await loadStore()
  const kv = mockKv(records)
  const images = mockBucket(objects)
  return async (pathname) => {
    const ctx = requestContext()
    const response = await handleRequest(
      new Request(`https://birds.truter.world${pathname}`),
      { BIRDS_KV: kv.kv, IMAGES: images.bucket },
      ctx,
    )
    await ctx.drain()
    return response
  }
}

test('the page is served as html, markdown and json', async () => {
  const fetch = await site()
  const html = await fetch('/identify/photo')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8')
  const body = await html.text()
  assert.match(body, /<h1>Identify a bird from a photo<\/h1>/)
  assert.match(
    body,
    /<a href="\/identify\/photo" aria-current="page">Identify by photo/,
  )
  assert.match(
    body,
    /<script type="module" defer src="\/identify-photo\.js\?v=[0-9a-f]+">/,
  )
  // The sound page's script is not loaded here.
  assert.doesNotMatch(body, /src="\/identify\.js/)

  const markdown = await fetch('/identify/photo.md')
  assert.equal(
    markdown.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  )
  const text = await markdown.text()
  assert.match(text, /^# Identify a bird from a photo/)
  assert.match(text, /An agent cannot run it/)
  assert.match(text, /### Can be recognised \(493\)/)
  assert.match(text, /### Weak groups/)
  assert.match(
    text,
    /\[Lilac-breasted Roller\]\(\/species\/coracias-caudatus\.md\) \(\*Coracias caudatus\*\): \d+ training photos/,
  )

  const json = await fetch('/identify/photo.json')
  assert.equal(
    json.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  const data = await json.json()
  assert.equal(data.kind, 'identify-photo')
  assert.deepEqual(data.counts, { species: 493, covered: 493, notInModel: 0 })
  assert.equal(data.assets.base, photoModelBase)
  assert.equal(data.assets.runtime, modelBase)
  assert.equal(data.assets.inputSize, PHOTO_MODEL.inputSize)
  assert.equal(data.credit.manifest.url, TRAINING_MANIFEST_URL)
  assert.ok(data.evaluation.photos > 5000)
  assert.equal(data.covered.length, 493)
})

test('without javascript the page explains itself and links onward', async () => {
  const fetch = await site()
  const body = await (await fetch('/identify/photo')).text()
  const note = body.match(/<p id="identify-nojs"[\s\S]*?<\/p>/)?.[0] ?? ''
  assert.match(note, /Recognition needs JavaScript/)
  assert.match(note, /href="\/families"/)
  assert.match(note, /href="\/species"/)
  assert.match(note, /href="\/search"/)
  // The controls are in the page but hidden until the script shows them.
  assert.match(body, /<section id="identify" class="identify" hidden /)
  assert.match(body, /not uploaded and it is not kept/)
  assert.match(
    body,
    /<label class="identify-file" for="identify-camera">Take a photo <input type="file" id="identify-camera" accept="image\/\*" capture="environment"><\/label>/,
  )
  assert.match(
    body,
    /<label class="identify-file" for="identify-file">Choose a photo <input type="file" id="identify-file" accept="image\/\*"><\/label>/,
  )
  assert.match(
    body,
    /id="identify-status"[^>]*role="status" aria-live="polite"/,
  )
  assert.match(body, /Download the recogniser \(about 20\.2 MiB\)/)
  // The crop square has a label, keyboard help and buttons that do the same.
  assert.match(
    body,
    /<canvas id="identify-crop"[^>]*tabindex="0"[^>]*aria-label="[^"]+"[^>]*aria-describedby="identify-crop-help"/,
  )
  assert.match(body, /arrow keys/)
  for (const id of ['run', 'smaller', 'larger', 'whole'])
    assert.match(body, new RegExp(`<button type="button" id="identify-${id}"`))
  // What it cannot do is stated on the page itself.
  assert.match(body, /cannot tell that a photo is not a bird/)
  assert.match(body, /Phone photos have not been measured yet/)
  assert.match(body, /<h3>Weak groups<\/h3>/)
  assert.match(
    body,
    /href="\/species\/coracias-caudatus">Lilac-breasted Roller/,
  )
})

test('wasm is allowed on this page only, and no camera or microphone', async () => {
  const fetch = await site()
  const page = await fetch('/identify/photo')
  assert.equal(page.headers.get('content-security-policy'), IDENTIFY_CSP)
  assert.equal(
    IDENTIFY_CSP,
    `${PAGE_CSP} 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'`,
  )
  // A file input opens the phone's own camera app, and the photo is drawn on
  // a canvas, so neither the camera nor blob: images are allowed.
  assert.equal(page.headers.get('permissions-policy'), PAGE_PERMISSIONS)
  assert.doesNotMatch(IDENTIFY_CSP, /blob:/)

  // The worker both pages share is governed by the policy on its own script.
  const worker = await fetch('/identify-worker.js')
  assert.equal(worker.headers.get('content-security-policy'), IDENTIFY_CSP)
  assert.equal(await worker.text(), workerSource)
  assert.match(workerSource, /data\.type === 'classify'/)

  const script = await fetch('/identify-photo.js')
  assert.equal(
    script.headers.get('content-type'),
    'text/javascript; charset=utf-8',
  )
  assert.equal(await script.text(), source)

  for (const pathname of [
    '/',
    '/species',
    '/species/coracias-caudatus',
    '/family/coraciidae',
    '/credits',
    '/search?q=roller',
    '/identify/photo.md',
    '/identify/photo.json',
    '/identify-photo.js',
    '/app.js',
    '/style.css',
    '/identify/video',
  ]) {
    const response = await fetch(pathname)
    assert.equal(
      response.headers.get('content-security-policy'),
      PAGE_CSP,
      pathname,
    )
    assert.equal(
      response.headers.get('permissions-policy'),
      PAGE_PERMISSIONS,
      pathname,
    )
  }
})

test('the photo model is served from its own versioned folder', async () => {
  assert.notEqual(PHOTO_MODEL.version, MODEL_ASSETS.version)
  const bytes = new Uint8Array([1, 2, 3, 4])
  const fetch = await site({
    [`models/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`]: {
      body: new Blob([bytes]).stream(),
      size: bytes.byteLength,
      httpEtag: '"p"',
      httpMetadata: { contentType: 'text/html' },
    },
  })
  const model = await fetch(photoModelBase + PHOTO_MODEL.file)
  assert.equal(model.status, 200)
  assert.equal(model.headers.get('content-type'), 'application/octet-stream')
  assert.equal(model.headers.get('cache-control'), MODEL_CACHE)
  assert.equal(model.headers.get('content-length'), '4')
  assert.equal((await fetch(`${photoModelBase}missing.tflite`)).status, 404)
})

test('every model class is a species in the guide, and the stored index is derived from it', async () => {
  const [{ species, families }, model, stored] = await Promise.all([
    readCatalog(),
    readPhotoModel(),
    readJson('data/index/identify-photo.json'),
  ])
  const slugs = new Set(species.map((bird) => bird.slug))
  assert.equal(new Set(model.classes).size, model.classes.length)
  for (const slug of model.classes) assert.ok(slugs.has(slug), slug)
  assert.equal(model.trainingPhotos.length, model.classes.length)
  assert.equal(model.evaluationPhotos.length, model.classes.length)
  // No class was trained on nothing.
  for (const [index, count] of model.trainingPhotos.entries())
    assert.ok(count > 0, model.classes[index])
  assert.equal(
    model.trainingPhotos.reduce((sum, count) => sum + count, 0),
    model.training.photos,
  )

  // src/identify.js names the same file the training pipeline described.
  assert.equal(model.version, PHOTO_MODEL.version)
  assert.equal(model.inputSize, PHOTO_MODEL.inputSize)
  assert.equal(model.file.bytes, PHOTO_MODEL.bytes)
  assert.equal(model.file.sha256, PHOTO_MODEL.sha256)

  const derived = deriveAll(species, families, null, model).identifyPhoto
  assert.deepEqual(stored, derived)
  assert.deepEqual(
    stored.covered.map((item) => item.label).sort((a, b) => a - b),
    model.classes.map((_, index) => index),
  )
  for (const item of stored.covered) {
    assert.equal(model.classes[item.label], item.slug)
    assert.ok(stored.families[item.family], item.slug)
    assert.ok(item.en && item.scientificName, item.slug)
  }
  // Every species is in exactly one list.
  assert.equal(stored.covered.length + stored.notInModel.length, slugs.size)
  // Families that tested badly are named on the page.
  const weak = weakFamilies(stored)
  assert.ok(weak.length > 0)
  for (const family of weak) assert.ok(family.evaluation.top3 < 0.8)
})

test('a species the model was not trained on is listed as not covered, never guessed', async () => {
  const [{ species, families }, model] = await Promise.all([
    readCatalog(),
    readPhotoModel(),
  ])
  const extra = {
    ...species[0],
    slug: 'novus-avis',
    scientificName: 'Novus avis',
    commonNames: { en: 'New Bird', af: null },
  }
  const doc = deriveIdentifyPhoto([...species, extra], families, model)
  assert.deepEqual(doc.counts, { species: 494, covered: 493, notInModel: 1 })
  assert.deepEqual(doc.notInModel, [
    {
      slug: 'novus-avis',
      scientificName: 'Novus avis',
      en: 'New Bird',
      af: null,
    },
  ])
  assert.ok(doc.covered.every((item) => item.slug !== 'novus-avis'))

  // A class that is no longer a species stops the build.
  assert.throws(
    () => deriveIdentifyPhoto(species.slice(1), families, model),
    new RegExp(`unknown species: ${species[0].slug}`),
  )
  assert.throws(
    () =>
      deriveIdentifyPhoto(species, families, {
        ...model,
        classes: [...model.classes.slice(0, -1), model.classes[0]],
      }),
    /twice/,
  )
})

test('the publish step refuses a model file that is not the described one', async () => {
  await assert.rejects(
    () => photoModelFiles(new URL(import.meta.url).pathname),
    /bytes, expected/,
  )
  await assert.rejects(
    () => photoModelFiles('/nowhere/photo-model.tflite'),
    /No photo model at/,
  )
})

const bird = (slug, family, label, monthsPresent = null) => ({
  slug,
  en: slug,
  family,
  label,
  monthsPresent,
})

test('the month prior lowers a bird that is away and never hides it', () => {
  const { monthPrior, OUT_OF_SEASON, rankResults } = client
  assert.deepEqual(monthPrior(0.8, [10, 11, 12, 1, 2, 3], 7), {
    score: 0.8 * OUT_OF_SEASON,
    outOfSeason: true,
  })
  assert.deepEqual(monthPrior(0.8, [10, 11, 12, 1, 2, 3], 11), {
    score: 0.8,
    outOfSeason: false,
  })
  // Unknown months are not guessed.
  assert.deepEqual(monthPrior(0.8, null, 7), { score: 0.8, outOfSeason: false })
  assert.deepEqual(monthPrior(0.8, [], 7), { score: 0.8, outOfSeason: false })

  // Scores are read by class number, whatever order the species are in.
  const species = [
    bird('resident', 'b', 1),
    bird('migrant', 'a', 0, [11, 12, 1]),
  ]
  const scores = new Float32Array([0.55, 0.4])
  const july = rankResults({ species, scores, month: 7 })
  assert.equal(july.kind, 'unsure')
  assert.deepEqual(
    july.candidates.map((item) => [
      item.bird.slug,
      item.confidence,
      item.outOfSeason,
    ]),
    [
      ['resident', 'possible', false],
      ['migrant', 'possible', true],
    ],
  )
  const december = rankResults({ species, scores, month: 12 })
  assert.equal(december.kind, 'species')
  assert.equal(december.candidates[0].bird.slug, 'migrant')
  assert.equal(december.candidates[0].confidence, 'likely')
  assert.equal(december.candidates[0].outOfSeason, false)
})

test('family scores are the sum of their species', () => {
  const { familyScores } = client
  const ranked = [
    { bird: bird('a1', 'a', 0), score: 0.3 },
    { bird: bird('b1', 'b', 1), score: 0.35 },
    { bird: bird('a2', 'a', 2), score: 0.25 },
    { bird: bird('c1', 'c', 3), score: 0.1 },
  ]
  const families = familyScores(ranked)
  assert.deepEqual(
    families.map((item) => item.family),
    ['a', 'b', 'c'],
  )
  assert.ok(Math.abs(families[0].score - 0.55) < 1e-9)
  assert.ok(Math.abs(families[1].score - 0.35) < 1e-9)
  assert.deepEqual(familyScores([]), [])
})

test('results lead with a species, then a family, then say there is no confident match', () => {
  const { rankResults, confidence, closePair } = client
  assert.equal(confidence(0.5), 'likely')
  assert.equal(confidence(0.25), 'possible')
  assert.equal(confidence(0.24), 'unlikely')

  const species = [
    bird('a1', 'a', 0),
    bird('a2', 'a', 1),
    bird('a3', 'a', 2),
    bird('b1', 'b', 3),
    bird('c1', 'c', 4),
    bird('c2', 'c', 5),
    bird('c3', 'c', 6),
  ]
  const rank = (scores) =>
    rankResults({ species, scores: new Float32Array(scores), month: 1 })

  // One species is likely: at most five, none below the display floor.
  const clear = rank([0.6, 0.1, 0.06, 0.08, 0.07, 0.06, 0.03])
  assert.equal(clear.kind, 'species')
  assert.deepEqual(
    clear.candidates.map((item) => item.bird.slug),
    ['a1', 'a2', 'b1', 'c1', 'a3'],
  )
  assert.deepEqual(
    clear.candidates.map((item) => item.confidence),
    ['likely', 'unlikely', 'unlikely', 'unlikely', 'unlikely'],
  )
  assert.equal(closePair(clear.candidates), null)
  assert.equal(rank([0.9, 0.04, 0, 0.06, 0, 0, 0]).candidates.length, 2)

  // No species is likely, but three of one family add up: lead with the
  // family and list only its birds.
  const family = rank([0.3, 0.2, 0.1, 0.35, 0.03, 0.01, 0.01])
  assert.equal(family.kind, 'family')
  assert.equal(family.family, 'a')
  assert.equal(family.confidence, 'likely')
  assert.deepEqual(
    family.candidates.map((item) => item.bird.slug),
    ['a1', 'a2', 'a3'],
  )
  assert.equal(family.candidates[0].confidence, 'possible')

  // Nothing is likely, but one species is possible: say so, and still list
  // the closest.
  const unsure = rank([0.3, 0.05, 0, 0.28, 0.2, 0.1, 0.07])
  assert.equal(unsure.kind, 'unsure')
  assert.deepEqual(
    unsure.candidates.map((item) => item.bird.slug),
    ['a1', 'b1', 'c1', 'c2', 'c3'],
  )
  assert.ok(unsure.candidates.every((item) => item.confidence !== 'likely'))
  const pair = closePair(unsure.candidates)
  assert.deepEqual(
    pair.map((item) => item.bird.slug),
    ['a1', 'b1'],
  )

  assert.deepEqual(rank([0.2, 0.1, 0.1, 0.2, 0.15, 0.15, 0.1]), {
    kind: 'none',
    candidates: [],
  })
  assert.deepEqual(rankResults({ species: [], scores: [], month: 1 }), {
    kind: 'none',
    candidates: [],
  })
})

test('the crop square stays square, inside the photo and above its smallest size', () => {
  const { clampCrop, wholeCrop, moveCrop, scaleCrop, fitWithin, MIN_CROP } =
    client
  assert.deepEqual(wholeCrop(4000, 3000), { x: 500, y: 0, size: 3000 })
  assert.deepEqual(wholeCrop(3000, 4000), { x: 0, y: 500, size: 3000 })

  assert.deepEqual(clampCrop({ x: -50, y: 2900, size: 400 }, 4000, 3000), {
    x: 0,
    y: 2600,
    size: 400,
  })
  // Never larger than the shorter side, never smaller than the minimum.
  assert.equal(clampCrop({ x: 0, y: 0, size: 9000 }, 4000, 3000).size, 3000)
  assert.equal(
    clampCrop({ x: 10, y: 10, size: 1 }, 4000, 3000).size,
    3000 * MIN_CROP,
  )

  assert.deepEqual(
    moveCrop({ x: 100, y: 100, size: 500 }, 5000, -500, 4000, 3000),
    { x: 3500, y: 0, size: 500 },
  )
  // Resizing keeps the centre where it can.
  assert.deepEqual(
    scaleCrop({ x: 1000, y: 1000, size: 1000 }, 0.5, 4000, 3000),
    { x: 1250, y: 1250, size: 500 },
  )
  assert.deepEqual(scaleCrop({ x: 0, y: 0, size: 1000 }, 2, 4000, 3000), {
    x: 0,
    y: 0,
    size: 2000,
  })
  assert.equal(
    scaleCrop({ x: 0, y: 0, size: 1000 }, 100, 4000, 3000).size,
    3000,
  )

  assert.deepEqual(fitWithin(8000, 6000, 2000), { width: 2000, height: 1500 })
  assert.deepEqual(fitWithin(3000, 4000, 2000), { width: 1500, height: 2000 })
  // A small photo is not enlarged.
  assert.deepEqual(fitWithin(640, 480, 2000), { width: 640, height: 480 })
})

test('canvas pixels become the model input: rgb, 0 to 255, alpha dropped', () => {
  const pixels = client.toPixels(
    new Uint8ClampedArray([255, 0, 10, 255, 1, 2, 3, 0]),
  )
  assert.ok(pixels instanceof Float32Array)
  assert.deepEqual([...pixels], [255, 0, 10, 1, 2, 3])
})

test('the photo model is credited, and the page is in the sitemap, the home page and llms.txt', async () => {
  const fetch = await site()
  const credits = await (await fetch('/credits')).text()
  assert.match(credits, /KNP Birds photo model/)
  assert.match(credits, /MobileNetV4/)
  assert.match(credits, /iNaturalist/)
  assert.match(credits, /<a href="\/identify\/photo">Identify by photo<\/a>/)
  assert.ok(credits.includes(`href="${TRAINING_MANIFEST_URL}"`))
  // The sound model keeps its own line.
  assert.match(credits, /<a href="\/identify\/sound">Identify by sound<\/a>/)
  const markdown = await (await fetch('/credits.md')).text()
  assert.match(markdown, /\[Identify by photo\]\(\/identify\/photo\.md\)/)
  assert.ok(markdown.includes(TRAINING_MANIFEST_URL))
  const stored = await (await fetch('/credits.json')).json()
  assert.equal(stored.models.length, 2)
  assert.equal(stored.models[1].page.href, '/identify/photo')

  const xml = await (await fetch('/sitemap.xml')).text()
  assert.match(
    xml,
    /<loc>https:\/\/birds\.truter\.world\/identify\/photo<\/loc>/,
  )
  const home = await (await fetch('/')).text()
  assert.match(
    home,
    /<a class="home-action" href="\/identify\/photo">.*Identify by photo/,
  )
  assert.match(home, /<a href="\/identify\/photo">Identify by photo<\/a>/)
  const llms = await (await fetch('/llms.txt')).text()
  assert.match(llms, /\/identify\/photo\.json/)
})
