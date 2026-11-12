import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MODEL_CACHE } from '../src/cache.js'
import source from '../src/client/identify.js'
import workerSource from '../src/client/identify-worker.js'
import { MODEL_ASSETS, modelBase } from '../src/identify.js'
import { IDENTIFY_CSP, IDENTIFY_PERMISSIONS } from '../src/respond.js'
import { handleRequest } from '../src/worker.js'
import { deriveAll, readCatalog, readLabelMap } from '../scripts/seed.mjs'
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
  const html = await fetch('/identify/sound')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8')
  const body = await html.text()
  assert.match(body, /<h1>Identify a bird by its call<\/h1>/)
  assert.match(body, /<a href="\/identify\/sound" aria-current="page">Identify/)
  assert.match(
    body,
    /<script type="module" defer src="\/identify\.js\?v=[0-9a-f]+">/,
  )

  const markdown = await fetch('/identify/sound.md')
  assert.equal(
    markdown.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  )
  const text = await markdown.text()
  assert.match(text, /^# Identify a bird by its call/)
  assert.match(text, /### Not in the model \(123\)/)
  assert.match(
    text,
    /\[Magpie Shrike\]\(\/species\/urolestes-melanoleucus\.md\)/,
  )

  const json = await fetch('/identify/sound.json')
  assert.equal(
    json.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  const data = await json.json()
  assert.equal(data.kind, 'identify-sound')
  assert.deepEqual(data.counts, {
    species: 493,
    covered: 362,
    broaderLabelOnly: 8,
    notInModel: 123,
  })
  assert.equal(data.assets.base, modelBase)
  assert.equal(data.credit.licence, 'CC BY-NC-SA 4.0')
})

test('without javascript the page explains itself and links onward', async () => {
  const fetch = await site()
  const body = await (await fetch('/identify/sound')).text()
  const note = body.match(/<p id="identify-nojs"[\s\S]*?<\/p>/)?.[0] ?? ''
  assert.match(note, /Recognition needs JavaScript/)
  assert.match(note, /href="\/species"/)
  assert.match(note, /href="\/search"/)
  // The controls are in the page but hidden until the script shows them.
  assert.match(body, /<section id="identify" class="identify" hidden /)
  assert.match(body, /not uploaded and it is not kept/)
  assert.match(body, /<button type="button" id="identify-record"/)
  assert.match(
    body,
    /<input type="file" id="identify-file" accept="audio\/\*">/,
  )
  assert.match(
    body,
    /id="identify-status"[^>]*role="status" aria-live="polite"/,
  )
  assert.match(body, /Download the recogniser \(about 35.6 MiB\)/)
  // Coverage is stated on the page itself.
  assert.match(body, /It can never return the other 131/)
  assert.match(body, /123 species that are not in the model/)
  assert.match(body, /href="\/species\/urolestes-melanoleucus">Magpie Shrike/)
})

test('the microphone and wasm are allowed on this page only', async () => {
  const fetch = await site()
  const page = await fetch('/identify/sound')
  assert.equal(page.headers.get('content-security-policy'), IDENTIFY_CSP)
  assert.equal(page.headers.get('permissions-policy'), IDENTIFY_PERMISSIONS)
  assert.equal(
    IDENTIFY_CSP,
    `${PAGE_CSP} 'wasm-unsafe-eval'; worker-src 'self'`,
  )
  assert.equal(
    IDENTIFY_PERMISSIONS,
    'camera=(), microphone=(self), geolocation=()',
  )

  // A worker is governed by the policy on its own script.
  const worker = await fetch('/identify-worker.js')
  assert.equal(worker.headers.get('content-security-policy'), IDENTIFY_CSP)
  assert.equal(
    worker.headers.get('content-type'),
    'text/javascript; charset=utf-8',
  )
  assert.equal(await worker.text(), workerSource)

  for (const pathname of [
    '/',
    '/species',
    '/species/coracias-caudatus',
    '/family/coraciidae',
    '/credits',
    '/search?q=roller',
    '/identify/sound.md',
    '/identify/sound.json',
    '/app.js',
    '/identify.js',
    '/identify-capture.js',
    '/style.css',
    '/nothing-here',
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

test('model files are served from the bucket with fixed types', async () => {
  const object = (bytes) => ({
    body: new Blob([bytes]).stream(),
    size: bytes.byteLength,
    httpEtag: '"m"',
    httpMetadata: { contentType: 'text/html' },
  })
  const base = `models/${MODEL_ASSETS.version}/`
  const fetch = await site({
    [`${base}litert_wasm_internal.wasm`]: object(new Uint8Array([0, 97, 115])),
    [`${base}audio-model-fp16.tflite`]: object(new Uint8Array([1, 2])),
    [`${base}litert.mjs`]: object(new TextEncoder().encode('export {}')),
    [`${base}notes.html`]: object(new TextEncoder().encode('<p>')),
  })
  const wasm = await fetch(`${modelBase}litert_wasm_internal.wasm`)
  assert.equal(wasm.status, 200)
  assert.equal(wasm.headers.get('content-type'), 'application/wasm')
  assert.equal(wasm.headers.get('cache-control'), MODEL_CACHE)
  assert.match(MODEL_CACHE, /immutable/)
  assert.equal(wasm.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(wasm.headers.get('content-length'), '3')

  const model = await fetch(`${modelBase}audio-model-fp16.tflite`)
  assert.equal(model.headers.get('content-type'), 'application/octet-stream')
  const runtime = await fetch(`${modelBase}litert.mjs`)
  assert.equal(
    runtime.headers.get('content-type'),
    'text/javascript; charset=utf-8',
  )
  // Only the recogniser's own file types, whatever the bucket holds.
  assert.equal((await fetch(`${modelBase}notes.html`)).status, 404)
  assert.equal((await fetch(`${modelBase}missing.wasm`)).status, 404)
  assert.equal((await fetch('/models/../species.wasm')).status, 404)
})

test('every species is mapped to model labels or explicitly excluded', async () => {
  const [{ species, families }, labelMap, table, stored] = await Promise.all([
    readCatalog(),
    readLabelMap(),
    readJson('data/identify/birdnet-synonyms.json'),
    readJson('data/index/identify-sound.json'),
  ])
  const slugs = new Set(species.map((bird) => bird.slug))
  const covered = Object.keys(labelMap.covered)
  const broader = Object.keys(labelMap.ambiguous)
  const groups = [...covered, ...broader, ...labelMap.notCovered]
  assert.equal(groups.length, slugs.size)
  assert.deepEqual(new Set(groups), slugs)

  const seen = new Map()
  for (const [slug, entry] of Object.entries(labelMap.covered)) {
    assert.ok(entry.indices.length > 0, slug)
    assert.equal(entry.indices.length, entry.labels.length, slug)
    for (const index of entry.indices) {
      assert.ok(
        Number.isInteger(index) && index >= 0 && index < labelMap.labelCount,
        `${slug} has label ${index}`,
      )
      assert.equal(seen.get(index), undefined, `label ${index} is used twice`)
      seen.set(index, slug)
    }
    const bird = species.find((item) => item.slug === slug)
    // Matched on the scientific name, or through the hand-checked table.
    if (entry.via === 'exact')
      assert.ok(entry.labels[0].startsWith(`${bird.scientificName}_`), slug)
    else
      assert.ok(
        entry.labels[0].startsWith(`${table.synonyms[slug].label}_`),
        slug,
      )
  }
  // A broader label is never used: those species are listed as not covered.
  for (const slug of broader) assert.equal(labelMap.covered[slug], undefined)

  const derived = deriveAll(species, families, labelMap).identifySound
  assert.deepEqual(stored, derived)
  assert.deepEqual(
    stored.covered.map((item) => item.slug).sort(),
    covered.sort(),
  )
  assert.equal(stored.notInModel.length + stored.broaderLabelOnly.length, 131)
  for (const item of stored.covered) {
    assert.ok(stored.families[item.family], item.slug)
    assert.ok(item.en && item.scientificName, item.slug)
  }
})

test('a species that is added without a mapping stops the build', async () => {
  const [{ species, families }, labelMap] = await Promise.all([
    readCatalog(),
    readLabelMap(),
  ])
  const extra = {
    ...species[0],
    slug: 'novus-avis',
    scientificName: 'Novus avis',
  }
  assert.throws(
    () => deriveAll([...species, extra], families, labelMap),
    /must list every species once.*novus-avis/,
  )
})

test('windows are three seconds, half overlapping, with a padded tail', () => {
  const { windowStarts, SAMPLE_RATE: rate, WINDOW, HOP } = client
  assert.equal(WINDOW, 144000)
  assert.equal(HOP, 72000)
  assert.deepEqual(windowStarts(rate * 2), [0])
  assert.deepEqual(windowStarts(rate * 3), [0])
  // Less than a second left over is dropped.
  assert.deepEqual(windowStarts(rate * 3.5), [0])
  assert.deepEqual(windowStarts(rate * 4), [0, HOP])
  assert.deepEqual(windowStarts(rate * 6), [0, HOP, 2 * HOP])
  assert.equal(windowStarts(rate * 10).length, 6)
})

test('a species takes its best label, then the mean of its three best windows', () => {
  const species = [{ labels: [7] }, { labels: [9, 2] }, { labels: [5] }]
  const columns = [2, 5, 7, 9]
  const windows = [
    [0.1, 0, 0.9, 0.2],
    [0.6, 0, 0.6, 0.3],
    [0.0, 0, 0.3, 0.9],
    [0.0, 0, 0.0, 0.0],
  ]
  const scores = client.speciesScores(windows, columns, species)
  assert.ok(Math.abs(scores[0] - 0.6) < 1e-9)
  assert.ok(Math.abs(scores[1] - (0.9 + 0.6 + 0.2) / 3) < 1e-9)
  assert.equal(scores[2], 0)
  assert.deepEqual(
    client.speciesScores([[0, 0, 0.5, 0]], columns, species),
    [0.5, 0, 0],
  )
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

  const species = [
    { slug: 'migrant', en: 'Migrant', family: 'a', monthsPresent: [11, 12, 1] },
    { slug: 'resident', en: 'Resident', family: 'b', monthsPresent: null },
  ]
  const july = rankResults({ species, scores: [0.8, 0.6], month: 7 })
  assert.equal(july.kind, 'species')
  assert.deepEqual(
    july.candidates.map((item) => [
      item.bird.slug,
      item.confidence,
      item.outOfSeason,
    ]),
    [
      ['resident', 'likely', false],
      ['migrant', 'possible', true],
    ],
  )
  const december = rankResults({ species, scores: [0.8, 0.6], month: 12 })
  assert.equal(december.candidates[0].bird.slug, 'migrant')
  assert.equal(december.candidates[0].outOfSeason, false)
})

test('results fall back to a family, then to no confident match', () => {
  const { rankResults, confidence, familyScores } = client
  assert.equal(confidence(0.5), 'likely')
  assert.equal(confidence(0.25), 'possible')
  assert.equal(confidence(0.24), 'unlikely')

  const bird = (slug, family) => ({
    slug,
    en: slug,
    family,
    monthsPresent: null,
  })
  const species = [
    bird('a1', 'a'),
    bird('a2', 'a'),
    bird('a3', 'a'),
    bird('b1', 'b'),
    bird('c1', 'c'),
    bird('c2', 'c'),
    bird('c3', 'c'),
  ]
  // One species stands out: at most five, none below the display floor.
  const clear = rankResults({
    species,
    scores: [0.7, 0.3, 0.12, 0.11, 0.1, 0.1, 0.05],
    month: 1,
  })
  assert.equal(clear.kind, 'species')
  assert.equal(clear.candidates.length, 5)
  assert.deepEqual(
    clear.candidates.map((item) => item.confidence),
    ['likely', 'possible', 'unlikely', 'unlikely', 'unlikely'],
  )

  // No species reaches "possible", but three weak birds share a family.
  const scores = [0.15, 0.12, 0.1, 0.2, 0.01, 0, 0]
  const family = rankResults({ species, scores, month: 1 })
  assert.equal(family.kind, 'family')
  assert.equal(family.family, 'a')
  assert.equal(family.confidence, 'possible')
  assert.deepEqual(
    family.candidates.map((item) => item.bird.slug),
    ['a1', 'a2', 'a3'],
  )
  assert.ok(family.candidates.every((item) => item.confidence === 'unlikely'))
  const [top] = familyScores(
    species.map((item, index) => ({ bird: item, score: scores[index] })),
  )
  assert.ok(Math.abs(top.score - (1 - 0.85 * 0.88 * 0.9)) < 1e-9)

  const nothing = rankResults({
    species,
    scores: [0.05, 0.02, 0, 0.1, 0, 0, 0],
    month: 1,
  })
  assert.deepEqual(nothing, { kind: 'none', candidates: [] })
  assert.deepEqual(rankResults({ species: [], scores: [], month: 1 }), {
    kind: 'none',
    candidates: [],
  })
})

test('channels are mixed down and chunks are joined', () => {
  const mono = client.mixToMono([
    new Float32Array([1, 0, -1]),
    new Float32Array([0, 0, 1]),
  ])
  assert.deepEqual([...mono], [0.5, 0, 0])
  assert.deepEqual(
    [
      ...client.joinChunks([
        new Float32Array([1, 2]),
        new Float32Array([]),
        new Float32Array([3]),
      ]),
    ],
    [1, 2, 3],
  )
})

test('the model credit is on the credits page and the page is in the sitemap', async () => {
  const fetch = await site()
  const credits = await (await fetch('/credits')).text()
  assert.match(credits, /<h2>Recognition models<\/h2>/)
  assert.match(credits, /BirdNET GLOBAL 6K V2\.4/)
  assert.match(credits, /CC BY-NC-SA 4\.0/)
  assert.match(
    credits,
    /Kahl, S\., Wood, C\. M\., Eibl, M\., &amp; Klinck, H\./,
  )
  const markdown = await (await fetch('/credits.md')).text()
  assert.match(markdown, /## Recognition models/)
  const stored = await (await fetch('/credits.json')).json()
  assert.equal(stored.models[0].url, 'https://zenodo.org/records/15050749')

  const xml = await (await fetch('/sitemap.xml')).text()
  assert.match(
    xml,
    /<loc>https:\/\/birds\.truter\.world\/identify\/sound<\/loc>/,
  )
  const home = await (await fetch('/')).text()
  assert.match(
    home,
    /<a class="home-action" href="\/identify\/sound">.*Identify by sound/,
  )
  const llms = await (await fetch('/llms.txt')).text()
  assert.match(llms, /\/identify\/sound\.json/)
})
