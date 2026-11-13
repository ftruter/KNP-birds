import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MODEL_CACHE } from '../src/cache.js'
import source from '../src/client/identify-photo.js'
import workerSource from '../src/client/identify-worker.js'
import {
  MODEL_ASSETS,
  PHOTO_DETECTOR,
  PHOTO_MODEL,
  TRAINING_MANIFEST_URL,
  deriveIdentifyPhoto,
  mebibytes,
  modelBase,
  photoDetectorBase,
  photoDownloadBytes,
  photoModelBase,
  runtimeBytes,
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
  "default-src 'none'; style-src 'self'; img-src 'self' https:; media-src 'self' https:; manifest-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self'"
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
    /\[Lilac-breasted Roller\]\(https:\/\/birds\.truter\.world\/species\/coracias-caudatus\.md\) \(\*Coracias caudatus\*\): \d+ training photos/,
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
    /<label class="identify-file identify-second" for="identify-file">Choose a photo <input type="file" id="identify-file" accept="image\/\*"><\/label>/,
  )
  // A note for when there is no connection, hidden until the script sees that.
  assert.match(
    body,
    /<p id="identify-offline" class="identify-note" hidden>There is no connection\. A photo that is kept in the cloud/,
  )
  assert.match(
    body,
    /id="identify-status"[^>]*role="status" aria-live="polite"/,
  )
  assert.match(
    body,
    new RegExp(
      `Download the recogniser \\(about ${mebibytes(photoDownloadBytes)} MiB\\)`,
    ),
  )
  // The crop square has a label, keyboard help and buttons that do the same.
  assert.match(
    body,
    /<canvas id="identify-crop"[^>]*tabindex="0"[^>]*aria-label="[^"]+"[^>]*aria-describedby="identify-crop-help"/,
  )
  assert.match(body, /arrow keys/)
  // The help names the gestures there are: move, edge, corner and pinch.
  const help = body.match(/<p id="identify-crop-help">[^<]*/)?.[0] ?? ''
  assert.match(help, /Drag inside the square to move it/)
  assert.match(help, /Drag an edge or a corner to resize it, or pinch/)
  // The crop view is a dialog, closed until a photo is opened.
  assert.match(body, /<dialog id="identify-cropper" class="identify-cropper" /)
  assert.doesNotMatch(body, /<dialog[^>]* open/)
  for (const id of ['run', 'cancel', 'smaller', 'larger', 'whole', 'recrop'])
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

test('wasm and the camera are allowed on this page only, and no microphone', async () => {
  const fetch = await site()
  const page = await fetch('/identify/photo')
  assert.equal(page.headers.get('content-security-policy'), IDENTIFY_CSP)
  assert.equal(
    IDENTIFY_CSP,
    `${PAGE_CSP} 'wasm-unsafe-eval'; worker-src 'self'`,
  )
  // Live mode shows the camera in the page, so this page alone allows it.
  // Nothing else is widened: the picture is shown from a stream object and
  // photos are drawn on a canvas, so no blob: address is allowed.
  assert.equal(
    page.headers.get('permissions-policy'),
    'camera=(self), microphone=(), geolocation=()',
  )
  assert.doesNotMatch(IDENTIFY_CSP, /blob:/)
  // The sound page keeps the microphone and gains no camera.
  assert.equal(
    (await fetch('/identify/sound')).headers.get('permissions-policy'),
    'camera=(), microphone=(self), geolocation=()',
  )

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

test('a press takes hold of an edge, a corner or the whole square', () => {
  const { cropZone } = client
  const crop = { x: 1000, y: 1000, size: 1000 }
  const zone = (x, y) => cropZone(crop, { x, y }, 100)
  assert.equal(zone(1500, 1500), 'move')
  // Either side of an edge, within reach of it.
  assert.equal(zone(1500, 950), 'n')
  assert.equal(zone(1500, 1090), 'n')
  assert.equal(zone(1500, 1101), 'move')
  assert.equal(zone(1500, 2050), 's')
  assert.equal(zone(950, 1500), 'w')
  assert.equal(zone(2050, 1500), 'e')
  assert.equal(zone(1000, 1000), 'nw')
  assert.equal(zone(2080, 920), 'ne')
  assert.equal(zone(1950, 2050), 'se')
  assert.equal(zone(920, 1950), 'sw')
  assert.equal(zone(1500, 899), 'outside')
  assert.equal(zone(2101, 1500), 'outside')
  // The middle of a small square still moves it.
  const small = { x: 0, y: 0, size: 80 }
  assert.equal(cropZone(small, { x: 40, y: 40 }, 100), 'move')
  assert.equal(cropZone(small, { x: 40, y: 10 }, 100), 'n')
})

test('dragging an edge or a corner resizes the square about the opposite one', () => {
  const { resizeCrop, MIN_CROP } = client
  const crop = { x: 1000, y: 1000, size: 1000 }
  const drag = (handle, x, y, from = crop) =>
    resizeCrop(from, handle, { x, y }, 4000, 3000)

  // The top edge: the bottom edge stays, and so does the centre line.
  assert.deepEqual(drag('n', 1500, 500), { x: 750, y: 500, size: 1500 })
  assert.deepEqual(drag('n', 1500, 1400), { x: 1200, y: 1400, size: 600 })
  // Where the pointer is across the edge does not matter.
  assert.deepEqual(drag('n', 0, 500), drag('n', 3999, 500))
  assert.deepEqual(drag('s', 1500, 2400), { x: 800, y: 1000, size: 1400 })
  assert.deepEqual(drag('w', 600, 1500), { x: 600, y: 800, size: 1400 })
  assert.deepEqual(drag('e', 2200, 1500), { x: 1000, y: 900, size: 1200 })

  // A corner: the opposite corner stays, and the larger pull wins.
  assert.deepEqual(drag('se', 2500, 2200), { x: 1000, y: 1000, size: 1500 })
  assert.deepEqual(drag('nw', 800, 900), { x: 800, y: 800, size: 1200 })
  assert.deepEqual(drag('ne', 2300, 900), { x: 1000, y: 700, size: 1300 })
  assert.deepEqual(drag('sw', 700, 2100), { x: 700, y: 1000, size: 1300 })

  // It stops at the photo's border and at the smallest size.
  assert.deepEqual(drag('n', 1500, -900), { x: 500, y: 0, size: 2000 })
  assert.deepEqual(drag('se', 9000, 9000), { x: 1000, y: 1000, size: 2000 })
  assert.deepEqual(drag('nw', -500, -500), { x: 0, y: 0, size: 2000 })
  const least = 3000 * MIN_CROP
  assert.deepEqual(drag('n', 1500, 5000), {
    x: 1500 - least / 2,
    y: 2000 - least,
    size: least,
  })
  assert.deepEqual(drag('se', 0, 0), { x: 1000, y: 1000, size: least })
  // Beside the photo's border an edge drag slides the square along it.
  assert.deepEqual(drag('s', 500, 2000, { x: 0, y: 0, size: 1000 }), {
    x: 0,
    y: 0,
    size: 2000,
  })
  // Never taller or wider than the photo.
  assert.deepEqual(drag('e', 9000, 500, { x: 0, y: 1000, size: 1000 }), {
    x: 0,
    y: 0,
    size: 3000,
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
  assert.match(
    markdown,
    /\[Identify by photo\]\(https:\/\/birds\.truter\.world\/identify\/photo\.md\)/,
  )
  assert.ok(markdown.includes(TRAINING_MANIFEST_URL))
  const stored = await (await fetch('/credits.json')).json()
  assert.equal(stored.models.length, 3)
  assert.equal(stored.models[1].page.href, '/identify/photo')
  // The detector that finds the bird is someone else's model, credited too.
  assert.equal(stored.models[2].name, 'EfficientDet-Lite0')
  assert.equal(stored.models[2].licence, 'Apache-2.0')
  assert.equal(stored.models[2].page.href, '/identify/photo')
  assert.match(credits, /EfficientDet-Lite0/)

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

test('the detector is served from its own folder, and the page tells the script how to use it', async () => {
  assert.notEqual(PHOTO_DETECTOR.version, PHOTO_MODEL.version)
  assert.notEqual(PHOTO_DETECTOR.version, MODEL_ASSETS.version)
  const bytes = new Uint8Array([1, 2, 3])
  const fetch = await site({
    [`models/${PHOTO_DETECTOR.version}/${PHOTO_DETECTOR.file}`]: {
      body: new Blob([bytes]).stream(),
      size: bytes.byteLength,
      httpEtag: '"d"',
      httpMetadata: {},
    },
  })
  const file = await fetch(photoDetectorBase + PHOTO_DETECTOR.file)
  assert.equal(file.status, 200)
  assert.equal(file.headers.get('cache-control'), MODEL_CACHE)
  const body = await (await fetch('/identify/photo')).text()
  const given = JSON.parse(
    body
      .match(/data-detector="([^"]*)"/)[1]
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&'),
  )
  assert.deepEqual(given, {
    url: photoDetectorBase + PHOTO_DETECTOR.file,
    bytes: PHOTO_DETECTOR.bytes,
    sha256: PHOTO_DETECTOR.sha256,
    inputSize: PHOTO_DETECTOR.inputSize,
    birdClass: PHOTO_DETECTOR.birdClass,
    score: PHOTO_DETECTOR.score,
    overlap: PHOTO_DETECTOR.overlap,
    margin: PHOTO_DETECTOR.margin,
    another: PHOTO_DETECTOR.another,
  })
  // The quoted download is everything a first visit fetches.
  assert.equal(
    photoDownloadBytes,
    PHOTO_MODEL.bytes + PHOTO_DETECTOR.bytes + runtimeBytes,
  )
  assert.ok(
    body.includes(`${mebibytes(PHOTO_DETECTOR.bytes)} MiB model that finds it`),
  )
  // What the page says when it found the bird, when it did not, and to a
  // visitor whose saved recogniser has no detector yet: all there, all hidden.
  assert.match(body, /<p id="identify-found" hidden>This page found the bird/)
  assert.match(
    body,
    /<p id="identify-crop-note" class="identify-note" hidden>No bird was found automatically\./,
  )
  assert.match(body, /<div id="identify-upgrade" class="identify-note" hidden>/)
  assert.match(
    body,
    /<button type="button" id="identify-next-bird" class="identify-button identify-quiet" hidden>/,
  )
  const data = await (await fetch('/identify/photo.json')).json()
  assert.equal(data.assets.detector.url, given.url)
  assert.equal(data.detectorCredit.licence, 'Apache-2.0')
  const markdown = await (await fetch('/identify/photo.md')).text()
  assert.match(
    markdown,
    /EfficientDet-Lite0 \(Apache-2\.0, trained on COCO, weights unchanged/,
  )
})

test('the page picks the same bird boxes as the scoring script', async () => {
  const fixture = await readJson(
    'test/fixtures/identify-photo/detector-barbet.json',
  )
  const { width, height, size } = fixture
  const found = {
    anchors: Int32Array.from(fixture.anchors),
    scores: Float32Array.from(fixture.scores),
    shifts: Float32Array.from(fixture.shifts),
  }
  const unit = Math.max(width, height)
  const pick = (score) =>
    client.birdBoxes(found, {
      width,
      height,
      size,
      score,
      overlap: PHOTO_DETECTOR.overlap,
    })
  for (const score of [0.05, PHOTO_DETECTOR.score, 0.6]) {
    const birds = pick(score)
    // The script's boxes, cut off at the photo's edges like the page's.
    const expected = fixture.picked
      .filter(([value]) => value >= score)
      .map(([value, top, left, bottom, right]) => ({
        score: value,
        left: Math.max(0, left * unit),
        top: Math.max(0, top * unit),
        right: Math.min(width, right * unit),
        bottom: Math.min(height, bottom * unit),
      }))
      .filter((box) => box.right > box.left && box.bottom > box.top)
    assert.equal(birds.length, expected.length, `at ${score}`)
    assert.ok(birds.length > 0)
    for (const [index, wanted] of expected.entries())
      assert.ok(
        birds.some((box) =>
          ['left', 'top', 'right', 'bottom', 'score'].every(
            (edge) => Math.abs(box[edge] - wanted[edge]) < 0.05,
          ),
        ),
        `box ${index} at ${score}: ${JSON.stringify(wanted)}`,
      )
    // Largest first, which is the bird the page crops to.
    const areas = birds.map(
      (box) => (box.right - box.left) * (box.bottom - box.top),
    )
    assert.deepEqual(
      areas,
      [...areas].sort((a, b) => b - a),
    )
  }
  // The barbet is the largest box, a little left of the middle of the frame.
  const [barbet] = pick(PHOTO_DETECTOR.score)
  assert.ok(barbet.left > 150 && barbet.right < 370, JSON.stringify(barbet))
  assert.ok(barbet.top > 100 && barbet.bottom < 300, JSON.stringify(barbet))
  // Nothing found is an empty list.
  assert.deepEqual(
    client.birdBoxes(
      {
        anchors: new Int32Array(0),
        scores: new Float32Array(0),
        shifts: new Float32Array(0),
      },
      { width, height, size, score: 0.3, overlap: 0.5 },
    ),
    [],
  )
})

test('the anchors are five grids of nine boxes a cell', () => {
  // 320 pixels: 40, 20, 10, 5 and 3 cells a side.
  assert.equal(
    [40, 20, 10, 5, 3].reduce((sum, cells) => sum + cells * cells * 9, 0),
    19206,
  )
  const close = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 1e-4, `${actual}, ${expected}`)
  // Values read from the anchors stored in Google's file.
  const first = client.anchorBox(0, 320)
  close(first.y, 0.0125)
  close(first.x, 0.0125)
  close(first.height, 0.075)
  close(first.width, 0.075)
  const wide = client.anchorBox(10, 320)
  close(wide.x, 0.0375)
  close(wide.height, 0.053)
  close(wide.width, 0.1061)
  const coarse = client.anchorBox(14400, 320)
  close(coarse.y, 0.025)
  close(coarse.height, 0.15)
  const last = client.anchorBox(19205, 320)
  close(last.y, 0.8333)
  close(last.x, 0.8333)
  close(last.height, 2.2449)
  close(last.width, 1.1225)
  assert.equal(client.anchorBox(19206, 320), null)
})

test('a detected bird becomes a square with a margin, inside the photo', () => {
  const box = { left: 400, top: 200, right: 500, bottom: 260 }
  // 100 wide: with 0.35 all round, 170 square, centred on the box.
  assert.deepEqual(client.boxCrop(box, 0.35, 1000, 500), {
    x: 365,
    y: 145,
    size: 170,
  })
  // At a corner the square moves in and keeps its size.
  const corner = client.boxCrop(
    { left: 0, top: 0, right: 100, bottom: 60 },
    0.35,
    1000,
    500,
  )
  assert.deepEqual(corner, { x: 0, y: 0, size: 170 })
  // A bird that fills the photo gets the largest square there is.
  assert.deepEqual(
    client.boxCrop(
      { left: 0, top: 0, right: 1000, bottom: 500 },
      0.35,
      1000,
      500,
    ),
    { x: 250, y: 0, size: 500 },
  )
  // A speck still gets the smallest square the page allows.
  const speck = client.boxCrop(
    { left: 500, top: 250, right: 502, bottom: 252 },
    0.35,
    1000,
    500,
  )
  assert.equal(speck.size, 500 * client.MIN_CROP)
  assert.deepEqual(
    [...client.toBytes(new Uint8ClampedArray([255, 0, 10, 255, 1, 2, 3, 0]))],
    [255, 0, 10, 1, 2, 3],
  )
})

test('the photo page says how long recognition took', () => {
  assert.equal(
    client.timingText(
      { runs: [69], total: 69, build: 'relaxed-simd' },
      { runs: [31.4], total: 31.4, build: 'relaxed-simd' },
    ),
    'Found the bird in 31 ms and recognised it in 69 ms on this device. Runtime: relaxed SIMD build.',
  )
  assert.equal(client.timingText(undefined), '')
  assert.equal(client.timingText({ runs: [], total: 0, build: null }), '')
  assert.equal(
    client.timingText({ runs: [83.6], total: 83.6, build: 'relaxed-simd' }),
    'Recognised in 84 ms on this device. Runtime: relaxed SIMD build.',
  )
  assert.equal(
    client.timingText({ runs: [1234], total: 1234, build: 'baseline' }),
    'Recognised in 1.2 s on this device. Runtime: compatibility build.',
  )
  assert.equal(
    client.timingText({ runs: [40], total: 40, build: null }),
    'Recognised in 40 ms on this device.',
  )
})

test('the page offers Live mode with Hold and Stop, hidden until the script shows it', async () => {
  const fetch = await site()
  const body = await (await fetch('/identify/photo')).text()
  assert.match(
    body,
    /<div id="identify-live-offer" class="identify-live-offer" hidden>\n<button type="button" id="identify-live-start"/,
  )
  assert.match(body, /<div id="identify-live" class="identify-live" hidden>/)
  // Inline, silent video: iOS plays anything else full screen.
  assert.match(body, /<video id="identify-live-video"[^>]* playsinline muted /)
  assert.match(body, /<button type="button" id="identify-live-hold"[^>]*>Hold</)
  assert.match(body, /<button type="button" id="identify-live-stop"[^>]*>Stop</)
  // The changing name is not a live region: only the status line is.
  assert.match(
    body,
    /<p id="identify-live-name" class="identify-live-name"><\/p>/,
  )
  assert.equal(body.match(/aria-live=/g).length, 1)
  // The page says that zoom is poor, and keeps "Take a photo".
  assert.match(body, /cannot zoom as far as your phone’s camera app/)
  assert.match(body, /id="identify-camera" accept="image\/\*" capture=/)
  const markdown = await (await fetch('/identify/photo.md')).text()
  assert.match(markdown, /Live mode asks for the camera/)
})

test('live mode names a bird once it has led, and keeps the name', () => {
  const { createLive, liveNext, LIVE_RUN, LIVE_MISSES, LIVE_FRAMES } = client
  const bird = (slug, en, label, family) => ({ slug, en, label, family })
  const species = [
    bird('a-barbet', 'A Barbet', 0, 'lybiidae'),
    bird('b-barbet', 'B Barbet', 1, 'lybiidae'),
    bird('c-roller', 'C Roller', 2, 'coraciidae'),
  ]
  const guide = { species, families: { lybiidae: { en: 'Barbets' } }, month: 1 }
  const frame = (...scores) => Float32Array.of(...scores)
  const barbet = frame(0.9, 0.05, 0.05)
  const roller = frame(0.02, 0.02, 0.96)

  // Nothing is named until one bird has led for LIVE_RUN frames running.
  let state = createLive()
  for (let count = 1; count < LIVE_RUN; count += 1) {
    state = liveNext(state, barbet, guide)
    assert.equal(state.shown, null, `named after ${count} frames`)
  }
  state = liveNext(state, barbet, guide)
  assert.deepEqual(state.shown, {
    href: '/species/a-barbet',
    name: 'A Barbet',
    family: false,
    confidence: 'likely',
    outOfSeason: false,
  })

  // One odd frame does not change the name: the average still says barbet.
  state = liveNext(state, roller, guide)
  assert.equal(state.shown.href, '/species/a-barbet')
  // The roller takes over only once it has led for a run of frames.
  let frames = 1
  while (state.shown.href === '/species/a-barbet') {
    state = liveNext(state, roller, guide)
    frames += 1
    assert.ok(frames <= LIVE_FRAMES + LIVE_RUN, 'the name never changed')
  }
  assert.equal(state.shown.href, '/species/c-roller')
  assert.ok(frames >= LIVE_RUN, `changed after ${frames} frames`)

  // The bird leaves: the name stays, and after LIVE_MISSES empty frames
  // the average starts again, so the next bird is not mixed with this one.
  for (let count = 0; count < LIVE_MISSES; count += 1)
    state = liveNext(state, null, guide)
  assert.equal(state.shown.href, '/species/c-roller')
  assert.deepEqual(state.recent, [])
  assert.equal(state.streak, 0)
  for (let count = 0; count < LIVE_RUN; count += 1)
    state = liveNext(state, barbet, guide)
  assert.equal(state.shown.href, '/species/a-barbet')

  // A single missed frame does not start the run again.
  let fresh = liveNext(liveNext(createLive(), barbet, guide), null, guide)
  for (let count = 1; count < LIVE_RUN; count += 1)
    fresh = liveNext(fresh, barbet, guide)
  assert.equal(fresh.shown.href, '/species/a-barbet')

  // No species stands out but a family does: the family is named.
  let family = createLive()
  for (let count = 0; count < LIVE_RUN; count += 1)
    family = liveNext(family, frame(0.45, 0.45, 0.1), guide)
  assert.deepEqual(family.shown, {
    href: '/family/lybiidae',
    name: 'Barbets',
    family: true,
    confidence: 'likely',
    outOfSeason: false,
  })

  // Nothing stands out: nothing is named.
  let none = createLive()
  for (let count = 0; count < LIVE_RUN + 2; count += 1)
    none = liveNext(none, frame(0.1, 0.1, 0.1), {
      ...guide,
      species: species.map((item, index) => ({
        ...item,
        family: `family-${index}`,
      })),
    })
  assert.equal(none.shown, null)
})

test('live mode paces itself, stops when idle or too slow, and reports its rate', () => {
  const {
    liveWait,
    liveStop,
    liveTimingText,
    LIVE_EVERY_MS,
    LIVE_REST_MS,
    LIVE_IDLE_SECONDS,
    LIVE_SLOW_MS,
  } = client
  // Never more than ten frames a second, and always a rest for the video.
  assert.equal(LIVE_EVERY_MS, 100)
  assert.equal(liveWait(20), 80)
  assert.equal(liveWait(95), LIVE_REST_MS)
  assert.equal(liveWait(400), LIVE_REST_MS)

  const idle = LIVE_IDLE_SECONDS * 1000
  assert.equal(liveStop({ now: idle - 1, seen: 0, recent: [] }), null)
  assert.equal(liveStop({ now: idle, seen: 0, recent: [] }), 'idle')
  assert.equal(liveStop({ now: idle + 500, seen: 600, recent: [] }), null)
  const slow = LIVE_SLOW_MS + 1
  assert.equal(liveStop({ now: 5000, seen: 0, recent: [slow, slow] }), null)
  assert.equal(
    liveStop({ now: 5000, seen: 0, recent: [slow, 200, slow, slow] }),
    null,
  )
  assert.equal(
    liveStop({ now: 5000, seen: 0, recent: [50, slow, slow, slow] }),
    'slow',
  )

  assert.equal(
    liveTimingText({
      frames: 62,
      ms: 10000,
      find: [40, 44, 90],
      name: [70, 72],
      build: 'relaxed-simd',
    }),
    'Live analysed 6.2 frames a second on this device: finding the bird typically took 44 ms, naming it 71 ms. Runtime: relaxed SIMD build.',
  )
  assert.equal(
    liveTimingText({
      frames: 100,
      ms: 10000,
      find: [20],
      name: [],
      build: null,
    }),
    'Live analysed 10 frames a second on this device: finding the bird typically took 20 ms.',
  )
  assert.equal(
    liveTimingText({ frames: 0, ms: 900, find: [], name: [], build: null }),
    '',
  )
})
