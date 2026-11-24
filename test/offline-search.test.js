import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(path.join(root, 'src/client/sw.js'), 'utf8')

const sandbox = {
  self: { addEventListener() {} },
  URL,
  URLSearchParams,
  Response,
  Headers,
  console,
}
vm.createContext(sandbox)
const api = vm.runInContext(
  `${source}\n;({ searchSavedNames, offlineSearchDocument, noSignalDocument, offlineNextSteps })`,
  sandbox,
)

const species = {
  'Coracias caudatus': {
    en: 'Lilac-breasted Roller',
    af: 'Gewone Troupant',
  },
  'Coracias garrulus': { en: 'European Roller', af: 'Europese Troupant' },
  'Merops apiaster': { en: 'European Bee-eater', af: 'Europese Byvreter' },
}
const families = {
  Coraciidae: { en: 'Rollers', af: 'Troupante' },
  Meropidae: { en: 'Bee-eaters', af: null },
}
const saved = new Set([
  '/',
  '/families',
  '/family/coraciidae',
  '/species/coracias-caudatus',
])

test('offline search matches English, Afrikaans and Latin names', () => {
  const english = api.searchSavedNames(
    species,
    families,
    'lilac-breasted',
    saved,
  )
  assert.equal(english.results[0].path, '/species/coracias-caudatus')
  assert.equal(english.results[0].en, 'Lilac-breasted Roller')
  assert.equal(english.unsaved, 0)

  const afrikaans = api.searchSavedNames(
    species,
    families,
    'Gewone Troupant',
    saved,
  )
  assert.equal(afrikaans.results[0].path, '/species/coracias-caudatus')
  assert.ok(afrikaans.results[0].score == null)

  const latin = api.searchSavedNames(
    species,
    families,
    'coracias caudatus',
    saved,
  )
  assert.equal(latin.results[0].scientificName, 'Coracias caudatus')

  const family = api.searchSavedNames(species, families, 'rollers', saved)
  assert.equal(family.results[0].kind, 'family')
  assert.equal(family.results[0].path, '/family/coraciidae')
  assert.ok(
    family.results.some((item) => item.path === '/species/coracias-caudatus'),
  )
  assert.equal(
    family.results.some((item) => item.path === '/species/coracias-garrulus'),
    false,
  )
  assert.ok(family.unsaved >= 1)
})

test('offline search links only to pages saved on the device', () => {
  const found = api.searchSavedNames(species, families, 'bee-eater', saved)
  assert.equal(found.total, 0)
  assert.equal(
    found.results.some((item) => item.path === '/species/merops-apiaster'),
    false,
  )
  assert.ok(found.unsaved >= 1)
  const html = api.offlineSearchDocument({
    query: 'bee-eater',
    found,
    assets: { style: '/style.css?v=abc' },
    paths: saved,
  })
  assert.equal(html.includes('/species/merops-apiaster'), false)
  assert.match(html, /not saved on this device/)
  assert.match(html, /href="\/style.css\?v=abc"/)
  assert.match(html, /class="site-header"/)
  assert.match(html, /data-offline="search"/)
})

test('offline search results stay text cards', () => {
  const found = api.searchSavedNames(species, families, 'lilac-breasted', saved)
  const html = api.offlineSearchDocument({
    query: 'lilac-breasted',
    found,
    assets: {},
    paths: saved,
  })
  assert.match(html, /class="search-results"/)
  assert.match(html, /Lilac-breasted Roller/)
  assert.doesNotMatch(html, /<img|<audio|search-photo|search-play/)
})

test('the offline search page escapes the query', () => {
  const found = api.searchSavedNames(species, families, '<script>', saved)
  const html = api.offlineSearchDocument({
    query: '<script>',
    found,
    assets: {},
    paths: saved,
  })
  assert.equal(html.includes('<script>'), false)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /value="&lt;script&gt;"/)
})

test('an empty offline search asks for a name and does not list birds', () => {
  const html = api.offlineSearchDocument({
    query: '',
    found: null,
    assets: {},
    paths: saved,
  })
  assert.match(html, /<h1>Search<\/h1>/)
  assert.match(html, /Type an English, Afrikaans or Latin bird name/)
  assert.doesNotMatch(html, /search-results/)
  assert.match(html, /needs a connection/)
})

test('the no-signal page uses the site header and offers saved search', () => {
  const steps = api.offlineNextSteps(
    new Set(['/', '/families', '/species.json']),
    true,
  )
  assert.deepEqual(
    [...steps].map((step) => step.label),
    ['Search saved birds', 'Home', 'Families'],
  )
  const html = api.noSignalDocument({
    assets: { style: '/style.css?v=1' },
    steps,
  })
  assert.match(html, /<h1>No signal<\/h1>/)
  assert.match(html, /not saved on this device/)
  assert.match(html, /Search saved birds/)
  assert.match(html, /class="site-header"/)
  assert.match(html, /class="browse-links"/)
  assert.match(html, /data-offline="no-signal"/)
  assert.match(html, /action="\/search"/)
  const none = [...api.offlineNextSteps(new Set(), false)].map((step) => ({
    href: step.href,
    label: step.label,
    note: step.note,
  }))
  assert.deepEqual(none, [{ href: '/', label: 'Home', note: '' }])
})
