import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  renderHomeHtml,
  renderNotFoundHtml,
  renderSpeciesHtml,
} from '../src/html.js'
import { jsonLdScript } from '../src/structured.js'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const origin = 'https://birds.truter.world'

const graphOf = (html) => {
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ]
  assert.equal(blocks.length, 1)
  assert.ok(html.indexOf(blocks[0][0]) < html.indexOf('</head>'))
  const data = JSON.parse(blocks[0][1])
  assert.equal(data['@context'], 'https://schema.org')
  return data['@graph']
}

const ofType = (graph, type) => graph.find((node) => node['@type'] === type)

const page = async (pathname) => {
  const { records } = await loadStore()
  const ctx = requestContext()
  const response = await handleRequest(
    new Request(`${origin}${pathname}`),
    { BIRDS_KV: mockKv(records).kv, IMAGES: mockBucket({}).bucket },
    ctx,
  )
  await ctx.drain()
  return response.text()
}

test('a species page names its trail, its taxon and its photographs', async () => {
  const graph = graphOf(await page('/species/coracias-caudatus'))
  assert.deepEqual(
    ofType(graph, 'BreadcrumbList').itemListElement.map((item) => [
      item.position,
      item.name,
      item.item,
    ]),
    [
      [1, 'Home', `${origin}/`],
      [2, 'Species', `${origin}/species`],
      [3, 'Lilac-breasted Roller', `${origin}/species/coracias-caudatus`],
    ],
  )
  const taxon = ofType(graph, 'Taxon')
  assert.equal(taxon.name, 'Coracias caudatus')
  assert.deepEqual(taxon.alternateName, [
    'Lilac-breasted Roller',
    'Gewone Troupant',
  ])
  assert.equal(taxon.taxonRank, 'species')
  assert.equal(taxon.url, `${origin}/species/coracias-caudatus`)
  assert.equal(taxon.parentTaxon.url, `${origin}/family/coraciidae`)
  const [first] = taxon.image
  assert.equal(first['@type'], 'ImageObject')
  assert.match(first.contentUrl, /^https:\/\//)
  assert.equal(first.license, 'https://creativecommons.org/licenses/by-sa/4.0/')
  assert.match(first.acquireLicensePage, /^https:\/\/commons\.wikimedia\.org\//)
  assert.equal(first.creditText, 'Diego Delso')
  assert.deepEqual(first.creator, { '@type': 'Person', name: 'Diego Delso' })
})

test('every photograph in the structured data is one the page shows', async () => {
  const html = await page('/species/coracias-caudatus')
  const shown = new Set(
    [...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((match) =>
      match[1].replaceAll('&amp;', '&'),
    ),
  )
  const images = ofType(graphOf(html), 'Taxon').image
  assert.ok(images.length > 0)
  for (const image of images) assert.ok(shown.has(image.contentUrl))
})

test('a family page names its trail and its taxon', async () => {
  const graph = graphOf(await page('/family/coraciidae'))
  assert.equal(ofType(graph, 'BreadcrumbList').itemListElement.length, 3)
  const taxon = ofType(graph, 'Taxon')
  assert.equal(taxon.name, 'Coraciidae')
  assert.equal(taxon.taxonRank, 'family')
  assert.equal(taxon.parentTaxon, undefined)
})

test('the home page names the site and has no trail', () => {
  const graph = graphOf(renderHomeHtml({ origin }))
  assert.deepEqual(graph, [
    {
      '@type': 'WebSite',
      name: 'Birds of Kruger National Park',
      alternateName: 'KNP Birds',
      url: `${origin}/`,
    },
  ])
})

test('pages kept out of the index carry no structured data', async () => {
  const search = await page('/search?q=roller')
  assert.match(search, /<meta name="robots" content="noindex">/)
  assert.doesNotMatch(search, /ld\+json/)
  assert.doesNotMatch(
    renderNotFoundHtml({ origin, path: '/species/nope' }),
    /ld\+json/,
  )
})

test('an AI-generated image and a withheld photograph are left out', () => {
  const html = renderSpeciesHtml({
    origin,
    colourMap: new Map(),
    imagesAvailable: { 'x/on-site.jpg': true },
    doc: {
      kind: 'species',
      slug: 'x',
      scientificName: 'Avis exempli',
      commonNames: { en: 'Example Bird' },
      summary: 'An example.',
      images: [
        { key: 'x/on-site.jpg', author: 'A. Person', license: 'CC BY 4.0' },
        {
          key: 'x/ai.jpg',
          fileUrl: 'https://example.org/ai.jpg',
          aiGenerated: true,
        },
        {
          key: 'x/nd.jpg',
          fileUrl: 'https://example.org/nd.jpg',
          license: 'CC BY-ND 4.0',
        },
      ],
    },
  })
  const images = ofType(graphOf(html), 'Taxon').image
  assert.deepEqual(
    images.map((image) => image.contentUrl),
    [`${origin}/images/x/on-site.jpg`],
  )
})

test('text from the store cannot close the script element', () => {
  const script = jsonLdScript([{ name: '</script><script>alert(1)</script>' }])
  assert.equal(script.match(/<\/script>/g).length, 1)
  assert.equal(
    JSON.parse(script.slice(script.indexOf('{'), script.lastIndexOf('}') + 1))[
      '@graph'
    ][0].name,
    '</script><script>alert(1)</script>',
  )
  assert.equal(jsonLdScript([null]), '')
})
