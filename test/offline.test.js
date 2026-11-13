import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  MODEL_ASSETS,
  PHOTO_DETECTOR,
  PHOTO_MODEL,
  downloadBytes,
  modelBase,
  photoDownloadBytes,
  photoModelBase,
} from '../src/identify.js'
import { deriveOffline, LARGE_DOWNLOAD_BYTES } from '../src/offline.js'
import { offlineManifest } from '../src/offline-app.js'
import { parseRange } from '../src/objects.js'
import { IDENTIFY_CSP, SERVICE_WORKER_CSP } from '../src/respond.js'
import { handleRequest } from '../src/worker.js'
import { mediaPlan, publishMedia } from '../scripts/publish-media.mjs'
import { readCatalog } from '../scripts/seed.mjs'
import {
  cacheHarness,
  loadStore,
  mockBucket,
  mockKv,
  requestContext,
} from './helpers.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(path.join(root, 'src/client/offline.js'), 'utf8')
// The script only starts work where there is a document, so its rules can be
// loaded here and tested as plain functions.
const client = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
)

const MIB = 1048576

const site = async ({ objects = {}, records: extra = {} } = {}) => {
  const { records } = await loadStore()
  const kv = mockKv({ ...records, ...extra })
  const images = mockBucket(objects)
  return async (pathname, headers = {}) => {
    const ctx = requestContext()
    const response = await handleRequest(
      new Request(`https://birds.truter.world${pathname}`, { headers }),
      { BIRDS_KV: kv.kv, IMAGES: images.bucket },
      ctx,
    )
    await ctx.drain()
    return response
  }
}

test('every page can be saved to a home screen', async () => {
  const fetch = await site()
  for (const pathname of ['/', '/species/coracias-caudatus', '/nothing']) {
    const body = await (await fetch(pathname)).text()
    assert.match(body, /<link rel="manifest" href="\/manifest\.webmanifest">/)
    assert.match(body, /<meta name="theme-color" content="#28602a">/)
    assert.match(body, /<meta name="mobile-web-app-capable" content="yes">/)
    assert.match(
      body,
      /<meta name="apple-mobile-web-app-capable" content="yes">/,
    )
    assert.match(
      body,
      /<meta name="apple-mobile-web-app-status-bar-style" content="default">/,
    )
    assert.match(body, /<link rel="apple-touch-icon" href="\/apple-touch-icon/)
    assert.match(
      body,
      /<script type="module" defer src="\/offline\.js\?v=[0-9a-f]+">/,
    )
  }

  const response = await fetch('/manifest.webmanifest')
  assert.equal(
    response.headers.get('content-type'),
    'application/manifest+json; charset=utf-8',
  )
  const manifest = await response.json()
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.name, 'Birds of Kruger National Park')
  assert.equal(manifest.short_name, 'Birds of KNP')
  assert.equal(manifest.theme_color, '#28602a')
  assert.equal(manifest.background_color, '#FDF6E3')
  assert.deepEqual(
    manifest.icons.map((icon) => [icon.sizes, icon.purpose]),
    [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ],
  )
  for (const icon of manifest.icons) {
    const file = await fetch(icon.src)
    assert.equal(file.status, 200, icon.src)
    assert.equal(file.headers.get('content-type'), 'image/png')
  }
})

test('the panel is in the home page only, and hidden until the script shows it', async () => {
  const fetch = await site()
  const home = await (await fetch('/')).text()
  assert.match(
    home,
    /<section id="offline-panel" class="offline-panel" aria-labelledby="offline-heading" data-manifest="\/offline\.json" hidden>/,
  )
  assert.match(
    home,
    /<p id="offline-status" class="visually-hidden" role="status" aria-live="polite">/,
  )
  const other = await (await fetch('/families')).text()
  assert.doesNotMatch(other, /offline-panel/)
})

test('the service worker and the page script are served unchanged, each with its own policy', async () => {
  const fetch = await site()
  const worker = await fetch('/sw.js')
  assert.equal(
    worker.headers.get('content-type'),
    'text/javascript; charset=utf-8',
  )
  assert.equal(
    await worker.text(),
    await readFile(path.join(root, 'src/client/sw.js'), 'utf8'),
  )
  // The worker only ever fetches from this origin.
  assert.equal(
    worker.headers.get('content-security-policy'),
    "default-src 'self'",
  )
  assert.equal(SERVICE_WORKER_CSP, "default-src 'self'")

  const script = await fetch('/offline.js')
  assert.equal(await script.text(), source)
  const policy = script.headers.get('content-security-policy')
  assert.match(policy, /manifest-src 'self'/)
  assert.match(policy, /connect-src 'self'/)
  // Nothing on an ordinary page may fetch from another origin or run wasm.
  assert.doesNotMatch(policy, /connect-src[^;]*https:/)
  assert.doesNotMatch(policy, /wasm/)
  assert.match(IDENTIFY_CSP, /connect-src 'self'/)
})

test('the six options are listed in order with sizes added up from the files', async () => {
  const fetch = await site()
  const response = await fetch('/offline.json')
  assert.equal(
    response.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  const manifest = await response.json()
  assert.equal(manifest.largeBytes, 50 * MIB)
  assert.deepEqual(
    manifest.categories.map((category) => category.label),
    [
      'Photo recognition model',
      'Sound recognition model',
      'Images for bird families (one image for each of the three most common species)',
      'Images for bird species',
      'Sound clips for families (one clip for each of the three most common species)',
      'Sound clips for all species',
    ],
  )
  assert.equal(manifest.pages.length, 9 + 86 + 493)
  assert.ok(manifest.pages.includes('/species/coracias-caudatus'))
  assert.ok(manifest.pages.includes('/family/coraciidae'))
  for (const url of [...manifest.shell, '/'])
    assert.equal((await fetch(url)).status, 200, url)
  // An unknown page form is not invented.
  assert.equal((await fetch('/offline')).status, 404)
  assert.equal((await fetch('/offline.md')).status, 404)

  const loader = MODEL_ASSETS.runtime.find((item) => item.file === 'litert.mjs')
  for (const relaxed of [true, false]) {
    const [photo, sound, ...media] = client.resolveOptions(manifest, relaxed)
    // One wasm build, its loader script and LiteRT.js itself.
    assert.equal(
      sound.files.filter((file) => file.url.endsWith('.wasm')).length,
      1,
    )
    const wasm = sound.files.find((file) => file.url.endsWith('.wasm'))
    assert.equal(wasm.url.includes('compat'), !relaxed)
    assert.equal(sound.key, modelBase + MODEL_ASSETS.model.file)
    assert.equal(photo.key, photoModelBase + PHOTO_MODEL.file)
    // The identify pages quote the larger build, so they never understate.
    assert.ok(sound.bytes <= downloadBytes + loader.bytes)
    assert.ok(photo.bytes <= photoDownloadBytes + loader.bytes)
    if (relaxed) {
      assert.equal(sound.bytes, downloadBytes + loader.bytes)
      assert.equal(photo.bytes, photoDownloadBytes + loader.bytes)
    }
    // The detector that finds the bird comes with the photo model, checked
    // like it, in the cache the photo page reads.
    const detector = photo.files.find((file) =>
      file.url.endsWith(PHOTO_DETECTOR.file),
    )
    assert.equal(detector.bytes, PHOTO_DETECTOR.bytes)
    assert.equal(detector.sha256, PHOTO_DETECTOR.sha256)
    assert.equal(detector.cache, photo.files[0].cache)
    assert.ok(!sound.files.some((file) => file.url === detector.url))
    // The models go where the identify pages look for them.
    assert.equal(sound.files[0].cache, `identify-sound-${MODEL_ASSETS.version}`)
    assert.equal(photo.files[0].cache, `identify-photo-${PHOTO_MODEL.version}`)
    // A family option is part of its species option, so never larger.
    const [familyImages, speciesImages, familyClips, speciesClips] = media
    assert.ok(familyImages.bytes <= speciesImages.bytes)
    assert.ok(familyClips.bytes <= speciesClips.bytes)
  }
})

test('family options use iconicSpecies and are part of the species options', async () => {
  const { species, families } = await readCatalog()
  const roller = species.find((doc) => doc.slug === 'coracias-caudatus')
  const purple = species.find((doc) => doc.slug === 'coracias-naevius')
  const broad = species.find((doc) => doc.slug === 'eurystomus-glaucurus')
  const family = families.find((doc) => doc.slug === 'coraciidae')
  assert.ok(family.iconicSpecies.includes('coracias-caudatus'))
  assert.ok(!family.iconicSpecies.includes('eurystomus-glaucurus'))
  const image = (doc) => doc.images[0]
  const clip = (doc) => doc.calls[0].recordings[0]
  const mirror = {
    images: {
      [image(roller).key]: { bytes: 300000, source: image(roller).fileUrl },
      [image(broad).key]: { bytes: 200000, source: image(broad).fileUrl },
      // Copied from an address the species file no longer names.
      [image(purple).key]: { bytes: 100000, source: 'https://example.org/old' },
    },
    audio: {
      [clip(roller).key]: { bytes: 400000, source: clip(roller).fileUrl },
    },
  }
  const doc = deriveOffline([roller, purple, broad], [family], mirror)
  assert.deepEqual(
    doc.images.map((item) => [item.slug, item.bytes]),
    [
      ['coracias-caudatus', 300000],
      ['eurystomus-glaucurus', 200000],
    ],
  )
  assert.equal(doc.images[0].url, `/images/offline/${image(roller).key}`)
  assert.equal(doc.images[0].alias, image(roller).fileUrl)
  assert.equal(doc.clips[0].url, `/audio/offline/${clip(roller).key}`)

  const manifest = offlineManifest(doc)
  const [, , familyImages, speciesImages, familyClips, speciesClips] =
    client.resolveOptions(manifest, true)
  assert.equal(familyImages.bytes, 300000)
  assert.equal(speciesImages.bytes, 500000)
  assert.equal(familyClips.bytes, 400000)
  assert.equal(speciesClips.bytes, 400000)
  assert.equal(familyImages.includedIn, 'species-images')
  assert.equal(familyClips.includedIn, 'species-clips')
  // The shared file is one entry, so it is stored once.
  assert.equal(
    manifest.files.filter((file) => file.url === doc.images[0].url).length,
    1,
  )
  // A different set of files is a different signature.
  const smaller = offlineManifest(deriveOffline([roller], [family], mirror))
  assert.notEqual(
    smaller.categories[3].signature,
    manifest.categories[3].signature,
  )
  assert.equal(
    smaller.categories[2].signature,
    manifest.categories[2].signature,
  )
})

test('sizes and progress are in MiB to one decimal place', () => {
  assert.equal(client.sizeText(0, 29 * MIB, false), '(29.0 MiB)')
  assert.equal(
    client.sizeText(2.1 * MIB, 29 * MIB, true),
    '(⬇︎ 2.1 MiB ~7.2% of 29.0 MiB)',
  )
  assert.equal(
    client.sizeText(40 * MIB, 29 * MIB, true).includes('100.0%'),
    true,
  )
  assert.equal(client.mebibytes(PHOTO_MODEL.bytes), '9.3')
})

test('mobile data is asked about only when it is, or may be, in use', () => {
  const ask = (type, bytes, saveData = false) =>
    client.downloadQuestion({
      kind: client.connectionKind(type === undefined ? undefined : { type }),
      saveData,
      bytes,
      largeBytes: LARGE_DOWNLOAD_BYTES,
    })
  const large = 240 * MIB
  // Wi-Fi known: start at once, whatever the size.
  assert.equal(ask('wifi', large), null)
  assert.equal(ask('ethernet', large), null)
  // Cellular known: ask above 50 MiB.
  assert.equal(
    ask('cellular', large),
    "You're on mobile data. Download 240.0 MiB now?",
  )
  assert.equal(ask('cellular', 50 * MIB), null)
  assert.equal(ask('cellular', 50 * MIB + 1)?.includes('50.0 MiB'), true)
  // Unknown (every iPhone, Firefox): ask, without claiming to know.
  assert.equal(ask(undefined, large), 'This is a 240.0 MiB download. Continue?')
  assert.equal(ask('unknown', large), 'This is a 240.0 MiB download. Continue?')
  assert.equal(ask('none', large), 'This is a 240.0 MiB download. Continue?')
  assert.equal(ask(undefined, 20 * MIB), null)
  // Data Saver: always ask.
  assert.equal(
    ask('wifi', MIB, true),
    'Data Saver is on. Download 1.0 MiB now?',
  )
  assert.match(ask('cellular', MIB, true), /mobile data and Data Saver is on/)
  // Speed estimates are never read.
  assert.equal(
    client.connectionKind({ effectiveType: '2g', downlink: 0.1 }),
    'unknown',
  )
  assert.doesNotMatch(source, /connection\??\.(effectiveType|downlink)/)
})

test('a large file is fetched in parts that cover it exactly', () => {
  assert.deepEqual(client.chunkRanges(10, 4), [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
    { start: 8, end: 9 },
  ])
  const ranges = client.chunkRanges(MODEL_ASSETS.model.bytes)
  assert.equal(ranges[0].start, 0)
  assert.equal(ranges.at(-1).end, MODEL_ASSETS.model.bytes - 1)
  for (let index = 1; index < ranges.length; index += 1)
    assert.equal(ranges[index].start, ranges[index - 1].end + 1)
})

test('what is ticked follows what is on the device', () => {
  const file = (url) => ({ url, bytes: 10 })
  const option = {
    id: 'species-images',
    signature: 'b',
    files: [file('/a'), file('/b')],
  }
  const part = {
    id: 'family-images',
    includedIn: 'species-images',
    signature: 'p',
    files: [file('/a')],
  }
  const model = {
    id: 'sound-model',
    signature: 'm',
    key: '/model',
    files: [file('/model'), file('/wasm')],
  }
  const state = client.optionState
  const all = new Set(['/a', '/b'])
  // Complete, whoever fetched it.
  assert.equal(state(option, all, {}), 'done')
  // Asked for and unfinished, after a restart: carry on.
  assert.equal(
    state(option, new Set(['/a']), {
      'species-images': { wanted: true, done: null },
    }),
    'resume',
  )
  // It was complete and the device has thrown files away: not ticked.
  assert.equal(
    state(option, new Set(), { 'species-images': { wanted: true, done: 'b' } }),
    'off',
  )
  // It was complete and the set has changed: an update, never a silent download.
  assert.equal(
    state(option, new Set(['/a']), {
      'species-images': { wanted: true, done: 'a' },
    }),
    'update',
  )
  // Never asked for: a file shared with another option does not tick it.
  assert.equal(state(option, new Set(['/a']), {}), 'off')
  // The larger option covers the smaller one.
  assert.equal(
    state(part, new Set(), { 'species-images': { wanted: true, done: null } }),
    'included',
  )
  assert.equal(state(part, new Set(['/a']), {}), 'done')
  // A model the identify page fetched is adopted and its set finished.
  assert.equal(state(model, new Set(['/model']), {}), 'resume')
  assert.equal(state(model, new Set(['/wasm']), {}), 'off')
  assert.equal(state({ id: 'x', files: [] }, all, {}), 'unavailable')

  // Unticking deletes only what no other wanted option needs.
  const remove = client.removableFiles
  assert.deepEqual(
    remove(part, [option, part], { 'species-images': { wanted: true } }),
    [],
  )
  assert.deepEqual(
    remove(option, [option, part], { 'family-images': { wanted: true } }).map(
      (item) => item.url,
    ),
    ['/b'],
  )
  assert.deepEqual(
    remove(option, [option, part], {}).map((item) => item.url),
    ['/a', '/b'],
  )
})

const partsCase = (path, key) => async () => {
  const bytes = new Uint8Array(1000).map((_, index) => index % 251)
  const requests = []
  const bucket = {
    async get(name, options) {
      requests.push(options?.range ?? null)
      if (name !== key) return null
      const range = options?.range
      const offset = range?.offset ?? 0
      const length = range?.length ?? bytes.length - offset
      return {
        body: new Blob([bytes.slice(offset, offset + length)]).stream(),
        size: bytes.length,
        httpEtag: '"model"',
        ...(range ? { range: { offset, length } } : {}),
      }
    },
  }
  const { records } = await loadStore()
  const env = { BIRDS_KV: mockKv(records).kv, IMAGES: bucket }
  const harness = cacheHarness()
  try {
    const get = async (headers = {}) => {
      const ctx = requestContext()
      const response = await handleRequest(
        new Request(`https://birds.truter.world${path}`, { headers }),
        env,
        ctx,
      )
      await ctx.drain()
      return response
    }
    const whole = await get()
    assert.equal(whole.status, 200)
    assert.equal(whole.headers.get('accept-ranges'), 'bytes')
    assert.equal(whole.headers.get('content-length'), '1000')
    assert.equal((await whole.arrayBuffer()).byteLength, 1000)

    // The whole file is now in the Cache API; a part must not be answered from it.
    const part = await get({ range: 'bytes=100-299' })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), 'bytes 100-299/1000')
    assert.equal(part.headers.get('content-length'), '200')
    assert.deepEqual(
      new Uint8Array(await part.arrayBuffer()),
      bytes.slice(100, 300),
    )
    const rest = await get({ range: 'bytes=900-' })
    assert.equal(rest.status, 206)
    assert.equal(rest.headers.get('content-range'), 'bytes 900-999/1000')
    assert.deepEqual(requests.slice(1), [
      { offset: 100, length: 200 },
      { offset: 900 },
    ])
    // A form the panel never sends is answered with the whole file.
    assert.equal((await get({ range: 'bytes=-5' })).status, 200)
  } finally {
    harness.uninstall()
  }
  assert.deepEqual(parseRange('bytes=0-3'), { offset: 0, length: 4 })
  assert.deepEqual(parseRange('bytes=7-'), { offset: 7 })
  assert.equal(parseRange('bytes=5-2'), null)
  assert.equal(parseRange('bytes=0-1,4-5'), null)
  assert.equal(parseRange(null), null)
}

test(
  'a model can be fetched in parts, and a part is never taken from the cache of whole files',
  partsCase(
    `/models/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`,
    `models/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`,
  ),
)

test(
  'a mirrored clip can be fetched in parts too',
  partsCase('/audio/offline/xeno-canto/XC1', 'offline/xeno-canto/XC1'),
)

test(
  'a mirrored photograph can be fetched in parts too',
  partsCase('/images/offline/a/side.jpg', 'offline/a/side.jpg'),
)

test('the mirror plan is one photograph and one clip for each species at most', async () => {
  const { species } = await readCatalog()
  const plan = mediaPlan(species)
  const count = (group) => plan.filter((item) => item.group === group).length
  assert.ok(count('images') > 400 && count('images') <= species.length)
  assert.ok(count('audio') > 300 && count('audio') <= species.length)
  assert.equal(
    new Set(plan.map((item) => `${item.group} ${item.key}`)).size,
    plan.length,
  )
  for (const item of plan) assert.match(item.source, /^https:\/\//)
})

test('copying records real sizes, skips what is done and deletes what is unused', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'knp-mirror-'))
  const mirrorFile = path.join(dir, 'mirror.json')
  const { species } = await readCatalog()
  const plan = mediaPlan(species).slice(0, 6)
  const ran = []
  const fetched = []
  const fetcher = async (url) => {
    fetched.push(url)
    const item = plan.find((entry) => entry.source === url)
    return new Response(new Uint8Array(100 + plan.indexOf(item)), {
      headers: {
        'content-type': item.group === 'images' ? 'image/jpeg' : 'audio/mpeg',
      },
    })
  }
  const quiet = { log: () => {}, run: async (args) => ran.push(args) }
  try {
    const dry = await publishMedia({ ...quiet, dryRun: true, mirrorFile })
    assert.equal(dry.copied.length, 0)
    assert.equal(ran.length, 0)

    const first = await publishMedia({
      ...quiet,
      fetcher,
      mirrorFile,
      limit: 6,
    })
    assert.equal(first.copied.length, 6)
    assert.equal(ran.length, 6)
    assert.deepEqual(ran[0].slice(0, 3), ['r2', 'object', 'put'])
    assert.match(ran[0][3], /^knp-birds-images\/offline\//)
    assert.equal(ran[0].at(-1), '--remote')
    const written = JSON.parse(await readFile(mirrorFile, 'utf8'))
    for (const item of plan) {
      const entry = written[item.group][item.key]
      assert.equal(entry.bytes, 100 + plan.indexOf(item))
      assert.equal(entry.source, item.source)
      assert.match(entry.sha256, /^[a-f0-9]{64}$/)
    }
    assert.equal(fetched.length, 6)

    // A second run copies nothing, and removes a copy nothing uses any more.
    written.images['gone/old.jpg'] = { bytes: 1, source: 'https://example.org' }
    await writeFile(mirrorFile, JSON.stringify(written))
    const second = await publishMedia({
      ...quiet,
      fetcher,
      mirrorFile,
      limit: 0,
    })
    assert.equal(second.copied.length, 0)
    assert.equal(fetched.length, 6)
    assert.deepEqual(ran.at(-1).slice(0, 4), [
      'r2',
      'object',
      'delete',
      'knp-birds-images/offline/gone/old.jpg',
    ])
    const after = JSON.parse(await readFile(mirrorFile, 'utf8'))
    assert.equal(after.images['gone/old.jpg'], undefined)
    assert.equal(
      Object.keys(after.images).length + Object.keys(after.audio).length,
      6,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a file of the wrong kind is refused', async () => {
  const { download } = await import('../scripts/publish-media.mjs')
  await assert.rejects(
    download(
      { group: 'audio', key: 'x', source: 'https://example.org/x' },
      async () =>
        new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    ),
    /expected audio/,
  )
})

test('audio the source labels as something else is known by its first bytes', async () => {
  const { download, sniff } = await import('../scripts/publish-media.mjs')
  const wav = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WAVEfmt '),
  ])
  const item = { group: 'audio', key: 'x', source: 'https://example.org/x.wav' }
  const served = (bytes, type) => async () =>
    new Response(bytes, { headers: { 'content-type': type } })
  assert.deepEqual(
    await download(item, served(wav, 'application/octet-stream')),
    { bytes: wav, contentType: 'audio/wav' },
  )
  const mp3 = Buffer.from('ID3\u0004\u0000\u0000 rest of the file', 'latin1')
  assert.equal(
    (await download(item, served(mp3, 'video/mpeg'))).contentType,
    'audio/mpeg',
  )
  // Bytes that are not sound are still refused, and so is a picture.
  await assert.rejects(
    download(
      item,
      served(Buffer.from('not sound'), 'application/octet-stream'),
    ),
    /expected audio/,
  )
  await assert.rejects(
    download(
      item,
      served(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'application/octet-stream'),
    ),
    /expected audio/,
  )
  assert.equal(sniff(Buffer.from([0xff, 0xfb, 0x90, 0x00])), 'audio/mpeg')
  assert.equal(sniff(Buffer.from('<html>')), null)
})
