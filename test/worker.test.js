import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KV_CONSISTENCY_MS, NO_STORE, PAGE_CACHE } from '../src/cache.js'
import { handleRequest } from '../src/worker.js'
import {
  cacheHarness,
  jpegObject,
  loadStore,
  mockBucket,
  mockKv,
  requestContext,
} from './helpers.js'

const app = async (records, bucket, env = {}) => {
  const kv = mockKv(records)
  const images = mockBucket(bucket)
  return {
    kv,
    images,
    async fetch(
      pathname,
      { method = 'GET', origin = 'https://birds.truter.world' } = {},
    ) {
      const ctx = requestContext()
      const response = await handleRequest(
        new Request(`${origin}${pathname}`, { method }),
        {
          BIRDS_KV: kv.kv,
          IMAGES: images.bucket,
          ...env,
        },
        ctx,
      )
      await ctx.drain()
      return response
    },
  }
}

test('pages are served in html, markdown, and json', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  const html = await site.fetch('/species/coracias-caudatus')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8')
  assert.match(html.headers.get('cache-control'), /s-maxage=3600/)
  assert.match(html.headers.get('cache-control'), /stale-while-revalidate=/)
  assert.equal(html.headers.get('cache-control'), PAGE_CACHE)
  const body = await html.text()
  assert.match(body, /Lilac-breasted Roller/)
  assert.match(
    body,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(
    body,
    /<script(?! type="(module|application\/ld\+json)")/i,
  )

  const markdown = await site.fetch('/species/coracias-caudatus.md')
  assert.equal(
    markdown.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  )
  assert.match(await markdown.text(), /^# Lilac-breasted Roller/)

  const json = await site.fetch('/species/coracias-caudatus.json')
  assert.equal(
    json.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  const data = await json.json()
  assert.equal(data.scientificName, 'Coracias caudatus')
  assert.equal(data.population.estimate.low, 8192)
  assert.equal(data.population.estimate.high, 32768)
  assert.equal(data.population.unit, 'matureIndividuals')
  assert.match(data.population.notes, /Kemp et al\. 2001/)

  const colours = await site.fetch('/vocab/colours')
  assert.equal(colours.status, 200)
  assert.match(await colours.text(), /slate-grey/)

  const index = await (await site.fetch('/species.json')).json()
  assert.equal(Object.keys(index).length, 493)
  assert.deepEqual(index['Coracias caudatus'], {
    en: 'Lilac-breasted Roller',
    af: 'Gewone Troupant',
    population: 20480,
  })
  assert.deepEqual(index['Icthyophaga vocifer'], {
    en: 'African Fish Eagle',
    af: 'Visarend',
    population: 160,
  })
  assert.equal(index['Haliaeetus vocifer'], undefined)
  assert.equal(index['Bucorvus leadbeateri'].en, 'Southern Ground-Hornbill')
  assert.equal(index['Bucorvus leadbeateri'].population, null)
  let unknown = 0
  for (const value of Object.values(index)) {
    if (value.population == null) unknown += 1
    assert.equal(Object.hasOwn(value, 'family'), false)
  }
  assert.equal(unknown, 44)
  const familyPage = await (await site.fetch('/family/coraciidae')).text()
  assert.match(familyPage, /href="\/species\/coracias-caudatus"/)
  assert.match(familyPage, /Lilac-breasted Roller/)
  assert.match(familyPage, /Includes 5 of 5 species/)
  assert.match(familyPage, /18,960–75,840 mature individuals/)
  assert.match(familyPage, /First to look for/)
})

test('the home page points to the identify pages and the indexes, and embeds neither list', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  const origin = 'https://birds.truter.world'
  const home = await (await site.fetch('/.json')).json()
  assert.equal(home.kind, 'home')
  assert.equal(Object.hasOwn(home, 'species'), false)
  assert.equal(Object.hasOwn(home, 'families'), false)
  assert.deepEqual(home.counts, { species: 493, families: 86 })
  assert.deepEqual(home.identify, [
    {
      name: 'Identify by photo',
      description: 'Take or choose a picture.',
      pages: {
        html: `${origin}/identify/photo`,
        md: `${origin}/identify/photo.md`,
        json: `${origin}/identify/photo.json`,
      },
    },
    {
      name: 'Identify by sound',
      description: 'Record or open a call.',
      pages: {
        html: `${origin}/identify/sound`,
        md: `${origin}/identify/sound.md`,
        json: `${origin}/identify/sound.json`,
      },
    },
  ])
  assert.deepEqual(
    home.browse.map((item) => [item.name, item.pages.json]),
    [
      ['Families', `${origin}/families.json`],
      ['Species', `${origin}/species.json`],
      ['Search', `${origin}/search.json`],
    ],
  )
  assert.equal(home.askAi.pages.md, `${origin}/ask-ai.md`)
  // Every page the home documents name is served, in all three formats.
  for (const item of [...home.identify, ...home.browse, home.askAi])
    for (const url of Object.values(item.pages))
      assert.equal((await site.fetch(new URL(url).pathname)).status, 200, url)
  const html = await (await site.fetch('/')).text()
  assert.doesNotMatch(html, /<table/)
  assert.doesNotMatch(html, /<h2>(Species|Families)<\/h2>/)
  assert.match(html, /<a class="home-action" href="\/identify\/photo">/)
  assert.match(html, /<a class="home-action" href="\/identify\/sound">/)
  const markdown = await (await site.fetch('/.md')).text()
  assert.doesNotMatch(markdown, /## (Species|Families)/)
  assert.doesNotMatch(markdown, /^\|/m)
  assert.match(
    markdown,
    /\[Families\]\(https:\/\/birds\.truter\.world\/families\)/,
  )
  // The table itself is unchanged at /families.
  const families = await (await site.fetch('/families')).text()
  assert.match(families, /Summer species count/)
  assert.match(families, /Winter species count/)
  assert.equal(
    Object.keys(await (await site.fetch('/families.json')).json()).length,
    86,
  )
  const empty = await (await (await app({})).fetch('/.json')).json()
  assert.equal(empty.counts, null)
  assert.equal(empty.identify.length, 2)
})

test('the Thrush Nightingale renders as a published species in html, markdown, and json', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  const html = await site.fetch('/species/luscinia-luscinia')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8')
  const htmlBody = await html.text()
  assert.match(htmlBody, /Thrush Nightingale/)
  assert.match(htmlBody, /Lysternagtegaal/)
  assert.doesNotMatch(
    htmlBody,
    /The details for this species have not been published yet/,
  )
  assert.match(htmlBody, /Telling it apart/)
  assert.match(
    htmlBody,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(
    htmlBody,
    /<script(?! type="(module|application\/ld\+json)")/i,
  )
  const markdown = await site.fetch('/species/luscinia-luscinia.md')
  assert.equal(
    markdown.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  )
  assert.doesNotMatch(
    await markdown.text(),
    /The details for this species have not been published yet/,
  )
  const json = await (
    await site.fetch('/species/luscinia-luscinia.json')
  ).json()
  assert.equal(json.scientificName, 'Luscinia luscinia')
  assert.equal(json.family, 'muscicapidae')
  assert.equal(json.sampleData, false)
  assert.ok(json.variants.length > 0)
  assert.ok(json.calls.length > 0)
  assert.ok(json.images.length > 0)
  assert.equal(json.population.estimate.low, 128)
  assert.equal(json.population.estimate.high, 512)
  assert.equal(json.population.unit, 'matureIndividuals')
  assert.equal(json.commonNames.af, 'Lysternagtegaal')
})

test('a new family stub and the full families index render in every format', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  const html = await site.fetch('/family/alcedinidae')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8')
  const htmlBody = await html.text()
  assert.match(htmlBody, /Kingfishers/)
  assert.match(htmlBody, /Visvangers/)
  assert.match(htmlBody, /href="\/species\/corythornis-cristatus"/)
  assert.match(htmlBody, /Includes 9 of 9 species/)
  assert.doesNotMatch(htmlBody, /This total is incomplete/)
  assert.doesNotMatch(htmlBody, /No species from this family are listed/)
  assert.match(
    htmlBody,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(
    htmlBody,
    /<script(?! type="(module|application\/ld\+json)")/i,
  )

  const markdown = await site.fetch('/family/alcedinidae.md')
  assert.equal(
    markdown.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  )
  const markdownBody = await markdown.text()
  assert.match(markdownBody, /Visvangers/)
  assert.match(
    markdownBody,
    /\[Malachite Kingfisher\]\(https:\/\/birds\.truter\.world\/species\/corythornis-cristatus\)/,
  )

  const json = await site.fetch('/family/alcedinidae.json')
  assert.equal(
    json.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  const data = await json.json()
  assert.equal(data.scientificName, 'Alcedinidae')
  assert.equal(data.species.length, 9)
  assert.ok(data.species.some((item) => item.slug === 'corythornis-cristatus'))
  assert.equal(data.iconicSpecies.length, 3)
  assert.equal(data.population.speciesCounted, 9)
  assert.equal(data.population.speciesTotal, 9)
  assert.equal(data.population.complete, true)
  assert.equal(data.population.low, 30592)
  assert.equal(data.population.high, 122368)

  const unnamed = await (await site.fetch('/family/acrocephalidae')).text()
  assert.match(unnamed, /Reed warblers and allies/)
  assert.doesNotMatch(unnamed, /class="afrikaans"/)

  const indexHtml = await (await site.fetch('/families')).text()
  assert.equal((indexHtml.match(/href="\/family\/[^"#]+"/g) || []).length, 86)
  assert.match(indexHtml, /href="\/family\/phoenicopteridae#residency"/)
  assert.match(indexHtml, /Visvangers/)
  assert.doesNotMatch(indexHtml, /about 0 individuals/)
  const indexMd = await (await site.fetch('/families.md')).text()
  assert.equal(
    (
      indexMd.match(/\]\(https:\/\/birds\.truter\.world\/family\/[^)#]+\)/g) ||
      []
    ).length,
    86,
  )
  assert.match(
    indexMd,
    /\]\(https:\/\/birds\.truter\.world\/family\/phoenicopteridae#residency\)/,
  )
  const indexJson = await (await site.fetch('/families.json')).json()
  assert.equal(Object.keys(indexJson).length, 86)
  assert.equal(indexJson.Accipitridae.af, null)
  assert.equal(indexJson.Accipitridae.en, 'Hawks, eagles and kites')
  assert.equal(indexJson.Alcedinidae.af, 'Visvangers')
  assert.equal(indexJson.Accipitridae.population, 31885)
  assert.equal(indexJson.Bucorvidae.population, 0)
  assert.equal(indexJson.Remizidae.population, 0)
})

test('missing pages 404 in all three formats', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  for (const pathname of ['/missing', '/missing.md', '/missing.json']) {
    const response = await site.fetch(pathname)
    assert.equal(response.status, 404, pathname)
  }
  const json = await (await site.fetch('/missing.json')).json()
  assert.equal(json.error, 'not_found')
})

test('a repeat request is served from the Cache API and does not read KV again', async () => {
  const cache = cacheHarness()
  try {
    const { records } = await loadStore()
    const site = await app(records)
    const first = await site.fetch('/families')
    assert.equal(first.status, 200)
    await first.text()
    const reads = site.kv.gets.length
    assert.ok(reads > 0)
    const second = await site.fetch('/families?utm=1')
    assert.equal(second.status, 200)
    assert.match(await second.text(), /Families/)
    assert.equal(site.kv.gets.length, reads)
  } finally {
    cache.uninstall()
  }
})

test('images stream from R2 and missing keys 404', async () => {
  const { records } = await loadStore()
  const site = await app(records, { 'pic.jpg': jpegObject() })
  const image = await site.fetch('/images/pic.jpg')
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('content-type'), 'image/jpeg')
  assert.match(image.headers.get('cache-control'), /s-maxage=2592000/)
  const bytes = new Uint8Array(await image.arrayBuffer())
  assert.equal(bytes[0], 0xff)
  const missing = await site.fetch('/images/nope.jpg')
  assert.equal(missing.status, 404)
  const audio = await site.fetch('/audio/nope.mp3')
  assert.equal(audio.status, 404)
})

test('sitemap lists species, families, and the colour vocabulary', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  const response = await site.fetch('/sitemap.xml')
  const xml = await response.text()
  assert.equal(
    response.headers.get('content-type'),
    'application/xml; charset=utf-8',
  )
  assert.match(
    xml,
    /<loc>https:\/\/birds\.truter\.world\/species\/coracias-caudatus<\/loc>/,
  )
  assert.match(xml, /\/family\/bucorvidae</)
  assert.match(xml, /\/vocab\/colours</)
  assert.match(xml, /\/credits</)
  const robots = await (await site.fetch('/robots.txt')).text()
  assert.match(robots, /Sitemap: https:\/\/birds\.truter\.world\/sitemap\.xml/)
  const llms = await (await site.fetch('/llms.txt')).text()
  assert.match(llms, /vocab\/colours/)
  assert.match(llms, /No visible difference/)
  assert.match(llms, /\/credits/)
})

test('credits is served in html, markdown, and json from index/credits', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  const html = await site.fetch('/credits')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8')
  const body = await html.text()
  assert.match(body, /<h1>Credits<\/h1>/)
  assert.match(body, /keep their own licences/)
  assert.match(body, /Lilac-breasted Roller/)
  assert.doesNotMatch(body, /No photos or recordings have been added so far/)
  assert.match(
    body,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(
    body,
    /<script(?! type="(module|application\/ld\+json)")/i,
  )
  assert.match(html.headers.get('link') || '', /\/credits\.md/)
  const markdown = await site.fetch('/credits.md')
  assert.equal(
    markdown.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  )
  assert.match(await markdown.text(), /^# Credits/)
  const json = await (await site.fetch('/credits.json')).json()
  assert.equal(json.kind, 'credits')
  assert.equal(json.site.maintainer, 'ftruter')
  assert.equal(json.site.licence, 'Apache-2.0')
  assert.equal(json.mediaNote, null)
  assert.ok(json.species.some((item) => item.slug === 'coracias-caudatus'))
  assert.match(json.site.media, /not covered by the Apache-2.0/)
})

test('a new data version misses the Cache API', async () => {
  const cache = cacheHarness()
  try {
    const { records } = await loadStore()
    const settled = { DATA_PUBLISHED_AT: String(Date.now() - 120_000) }
    const first = await app(records, {}, { ...settled, DATA_VERSION: 'one' })
    await (await first.fetch('/species?utm=1')).text()
    const reads = first.kv.gets.length
    assert.ok(reads > 0)
    await (await first.fetch('/species')).text()
    assert.equal(first.kv.gets.length, reads)
    const next = await app(records, {}, { ...settled, DATA_VERSION: 'two' })
    const response = await next.fetch('/species')
    assert.equal(response.headers.get('cache-control'), PAGE_CACHE)
    assert.match(await response.text(), /Species/)
    assert.ok(next.kv.gets.length > 0)
    const redeployed = await app(
      records,
      {},
      {
        ...settled,
        DATA_VERSION: 'one',
        CF_VERSION_METADATA: { id: 'version-b' },
      },
    )
    await (await redeployed.fetch('/species')).text()
    assert.ok(redeployed.kv.gets.length > 0)
  } finally {
    cache.uninstall()
  }
})

test('KV reads stay uncached until the publish window has passed', async () => {
  const cache = cacheHarness()
  try {
    const { records } = await loadStore()
    const fresh = await app(
      records,
      {},
      {
        DATA_VERSION: 'one',
        DATA_PUBLISHED_AT: String(Date.now()),
        CF_VERSION_METADATA: { id: 'version-a' },
      },
    )
    const first = await fresh.fetch('/families')
    assert.equal(first.headers.get('cache-control'), NO_STORE)
    await first.text()
    const reads = fresh.kv.gets.length
    const second = await fresh.fetch('/families')
    assert.equal(second.headers.get('cache-control'), NO_STORE)
    await second.text()
    assert.ok(fresh.kv.gets.length > reads)
    const settled = await app(
      records,
      {},
      {
        DATA_VERSION: 'one',
        DATA_PUBLISHED_AT: String(Date.now() - KV_CONSISTENCY_MS),
        CF_VERSION_METADATA: { id: 'version-b' },
      },
    )
    const warm = await settled.fetch('/')
    assert.equal(warm.headers.get('cache-control'), PAGE_CACHE)
    await warm.text()
    const settledReads = settled.kv.gets.length
    await (await settled.fetch('/')).text()
    assert.equal(settled.kv.gets.length, settledReads)
  } finally {
    cache.uninstall()
  }
})

test('POST is rejected and HEAD has no body', async () => {
  const { records } = await loadStore()
  const site = await app(records)
  const post = await site.fetch('/species', { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
  const head = await site.fetch('/species/icthyophaga-vocifer', {
    method: 'HEAD',
  })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
})
