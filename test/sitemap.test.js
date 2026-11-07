import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { handleRequest } from '../src/worker.js'
import { buildSitemap, sitemapPaths, sitemapXml } from '../src/sitemap.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const schema = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/sitemap.xsd',
)

const tree = buildSitemap(
  {
    Coraciidae: { en: 'Rollers', af: 'Troupante', population: 1 },
    Accipitridae: { en: 'Hawks, eagles and kites', af: null, population: 2 },
  },
  [
    {
      slug: 'coraciidae',
      scientificName: 'Coraciidae',
      commonNames: { en: 'Rollers' },
      species: [
        {
          slug: 'coracias-garrulus',
          scientificName: 'Coracias garrulus',
          names: { en: 'European Roller' },
        },
        {
          slug: 'coracias-caudatus',
          scientificName: 'Coracias caudatus',
          names: { en: 'Lilac-breasted Roller' },
        },
      ],
    },
    {
      slug: 'accipitridae',
      scientificName: 'Accipitridae',
      commonNames: { en: 'Hawks, eagles and kites' },
      species: [
        {
          slug: 'buteo-buteo',
          scientificName: 'Buteo buteo',
          names: { en: 'Common Buzzard' },
        },
      ],
    },
  ],
  {
    'Bucorvus leadbeateri': {
      en: 'Southern Ground-Hornbill',
      af: 'Bromvoël',
      population: null,
    },
  },
)

test('the sitemap tree is alphabetical by English name', () => {
  assert.deepEqual(
    tree.families.map((family) => family.name),
    ['Hawks, eagles and kites', 'Rollers'],
  )
  assert.deepEqual(
    tree.families[1].species.map((species) => species.name),
    ['European Roller', 'Lilac-breasted Roller'],
  )
  assert.deepEqual(
    tree.species.map((species) => species.name),
    [
      'Common Buzzard',
      'European Roller',
      'Lilac-breasted Roller',
      'Southern Ground-Hornbill',
    ],
  )
  assert.deepEqual(sitemapPaths(tree), [
    '/',
    '/sitemap',
    '/vocab/colours',
    '/families',
    '/family/accipitridae',
    '/species/buteo-buteo',
    '/family/coraciidae',
    '/species/coracias-garrulus',
    '/species/coracias-caudatus',
    '/species',
    '/species/bucorvus-leadbeateri',
    '/credits',
  ])
})

test('sitemap xml is schema-valid and has one loc per url', async () => {
  const xml = sitemapXml('https://birds.truter.world', tree)
  const blocks = xml.split('<url>').slice(1)
  assert.equal(blocks.length, sitemapPaths(tree).length)
  for (const block of blocks) {
    assert.equal((block.match(/<loc>/g) || []).length, 1)
    assert.equal(block.includes('</url>'), true)
  }
  assert.equal(xml.includes('<lastmod>'), false)
  assert.equal(new Set(xml.match(/<loc>[^<]+<\/loc>/g)).size, blocks.length)
  const dir = await mkdtemp(path.join(tmpdir(), 'sitemap-'))
  const file = path.join(dir, 'sitemap.xml')
  await writeFile(file, xml)
  const result = spawnSync('xmllint', ['--noout', '--schema', schema, file], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('the sitemap page is nested in html, markdown, and json', async () => {
  const { records } = await loadStore()
  const kv = mockKv(records)
  const fetch = async (pathname) => {
    const ctx = requestContext()
    const response = await handleRequest(
      new Request(`https://birds.truter.world${pathname}`),
      { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
      ctx,
    )
    await ctx.drain()
    return response
  }
  const html = await (await fetch('/sitemap')).text()
  assert.match(html, /<h1>Sitemap<\/h1>/)
  assert.match(html, /href="\/sitemap" aria-current="page"/)
  assert.match(
    html,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(html, /<script(?! type="module")/i)
  const nav = html.match(/<ul class="nav-list">[\s\S]*?<\/ul>/)[0]
  assert.equal(nav.includes('Sitemap'), false)
  assert.match(html, /<footer[\s\S]*href="\/sitemap"/)
  const hawks = html.indexOf('Hawks, eagles and kites')
  const rollers = html.indexOf('>Rollers<')
  assert.ok(hawks > 0 && hawks < rollers)
  const european = html.indexOf('European Roller')
  const lilac = html.indexOf('Lilac-breasted Roller')
  assert.ok(european > 0 && european < lilac)
  assert.match(html, /href="\/credits"/)
  const markdown = await (await fetch('/sitemap.md')).text()
  assert.match(
    markdown,
    /\[Hawks, eagles and kites\]\(\/family\/accipitridae\)/,
  )
  assert.ok(
    markdown.indexOf('Hawks, eagles and kites') < markdown.indexOf('Rollers'),
  )
  const json = await (await fetch('/sitemap.json')).json()
  assert.equal(json.kind, 'sitemap')
  assert.deepEqual(
    json.entries.map((entry) => entry.name),
    ['Home', 'Sitemap', 'Colours', 'Families', 'Species', 'Credits'],
  )
  const familyNames = json.entries[3].children.map((family) => family.name)
  assert.deepEqual(
    familyNames,
    familyNames.toSorted((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    ),
  )
  assert.equal(
    json.entries[3].children.find(
      (family) => family.href === '/family/accipitridae',
    ).latin,
    'Accipitridae',
  )
  const xml = await (await fetch('/sitemap.xml')).text()
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  )
  assert.deepEqual(locs.slice(0, 4), [
    'https://birds.truter.world/',
    'https://birds.truter.world/sitemap',
    'https://birds.truter.world/vocab/colours',
    'https://birds.truter.world/families',
  ])
  assert.equal(locs.at(-2), 'https://birds.truter.world/species')
  assert.equal(locs.at(-1), 'https://birds.truter.world/credits')
  assert.equal(new Set(locs).size, locs.length)
  const familyAt = locs.indexOf(
    'https://birds.truter.world/family/accipitridae',
  )
  const speciesAt = locs.indexOf('https://birds.truter.world/species')
  assert.ok(familyAt > 3 && familyAt < speciesAt)
  assert.ok(
    locs
      .slice(familyAt + 1, speciesAt)
      .some((loc) => loc.includes('/species/')),
  )
})
