import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cacheRequest } from '../src/cache.js'
import { speciesSearchQuery } from '../src/route.js'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const ORIGIN = 'https://birds.truter.world'
const ROLLER = '/species/coracias-caudatus'

const site = async () => {
  const { records } = await loadStore()
  const kv = mockKv(records)
  return async (pathname) => {
    const ctx = requestContext()
    const response = await handleRequest(
      new Request(`${ORIGIN}${pathname}`),
      { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
      ctx,
    )
    await ctx.drain()
    return response
  }
}

const trail = (html) => {
  const nav = html.match(/<nav aria-label="Breadcrumb">[\s\S]*?<\/nav>/)
  assert.ok(nav, 'page has no breadcrumb')
  return nav[0]
}

test('speciesSearchQuery keeps a query only on a species HTML page', () => {
  assert.equal(speciesSearchQuery(ROLLER, '  lilac   roller '), 'lilac roller')
  assert.equal(speciesSearchQuery(ROLLER, ''), '')
  assert.equal(speciesSearchQuery(ROLLER, '   '), '')
  assert.equal(speciesSearchQuery(`${ROLLER}.md`, 'roller'), '')
  assert.equal(speciesSearchQuery(`${ROLLER}.json`, 'roller'), '')
  assert.equal(speciesSearchQuery('/species', 'roller'), '')
  assert.equal(speciesSearchQuery('/family/coraciidae', 'roller'), '')
  assert.equal(speciesSearchQuery('/search', 'roller'), '')
  assert.equal(speciesSearchQuery(ROLLER, 'x'.repeat(500)).length, 200)
})

test('a species page opened from search keeps that query in its cache key', () => {
  const spaced = cacheRequest(
    `${ORIGIN}${ROLLER}?q=%20roller%20&utm=x`,
    'v1',
    'en',
  )
  const plain = cacheRequest(`${ORIGIN}${ROLLER}?q=roller`, 'v1', 'en')
  const other = cacheRequest(`${ORIGIN}${ROLLER}?q=hornbill`, 'v1', 'en')
  const clean = cacheRequest(`${ORIGIN}${ROLLER}`, 'v1', 'en')
  assert.equal(spaced.url, plain.url)
  assert.notEqual(plain.url, other.url)
  assert.match(plain.url, /[?&]q=roller/)
  assert.doesNotMatch(plain.url, /utm/)
  assert.doesNotMatch(clean.url, /[?&]q=/)
  assert.doesNotMatch(
    cacheRequest(`${ORIGIN}${ROLLER}.md?q=roller`, 'v1', 'en').url,
    /[?&]q=/,
  )
  assert.doesNotMatch(
    cacheRequest(`${ORIGIN}${ROLLER}.json?q=roller`, 'v1', 'en').url,
    /[?&]q=/,
  )
  assert.doesNotMatch(
    cacheRequest(`${ORIGIN}/species?q=roller`, 'v1', 'en').url,
    /[?&]q=/,
  )
  assert.doesNotMatch(
    cacheRequest(`${ORIGIN}/family/coraciidae?q=roller`, 'v1', 'en').url,
    /[?&]q=/,
  )
})

test('search results link a species back to the same search, and a family as before', async () => {
  const fetch = await site()
  const html = await (await fetch('/search?q=lilac-breasted')).text()
  assert.match(
    html,
    /<a href="\/species\/coracias-caudatus\?q=lilac-breasted">Lilac-breasted Roller<\/a>/,
  )
  const families = await (await fetch('/search?q=hornbills')).text()
  assert.match(families, /<a href="\/family\/bucerotidae">/)
  assert.doesNotMatch(families, /\/family\/[^"]+\?q=/)
})

test('a species page opened from search links back to those results', async () => {
  const fetch = await site()
  const response = await fetch(`${ROLLER}?q=%20lilac%20%20roller%20`)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(
    trail(html),
    /<a href="\/species">Species<\/a><\/li><li><a href="\/search\?q=lilac\+roller" data-search-crumb>Search results<\/a><\/li><li aria-current="page">Lilac-breasted Roller<\/li>/,
  )
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/birds\.truter\.world\/species\/coracias-caudatus">/,
  )
  assert.doesNotMatch(html, /canonical"[^>]*\?q=/)
  assert.match(
    response.headers.get('link'),
    /<https:\/\/birds\.truter\.world\/species\/coracias-caudatus>; rel="canonical"/,
  )
  assert.match(
    html,
    /<input id="site-search-q" type="search" name="q" value=""/,
  )
  const block = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )
  const graph = JSON.parse(block[1])['@graph']
  const crumbs = graph.find((node) => node['@type'] === 'BreadcrumbList')
  assert.deepEqual(
    crumbs.itemListElement.map((item) => [item.position, item.name, item.item]),
    [
      [1, 'Home', `${ORIGIN}/`],
      [2, 'Species', `${ORIGIN}/species`],
      [3, 'Search results', `${ORIGIN}/search?q=lilac+roller`],
      [4, 'Lilac-breasted Roller', `${ORIGIN}${ROLLER}`],
    ],
  )
})

test('a species page opened any other way keeps its trail', async () => {
  const fetch = await site()
  for (const path of [ROLLER, `${ROLLER}?q=%20%20`, `${ROLLER}.md?q=roller`]) {
    const html = await (await fetch(path)).text()
    assert.doesNotMatch(html, /data-search-crumb/, path)
    assert.doesNotMatch(html, /Search results/, path)
  }
  const family = await (await fetch('/family/coraciidae?q=roller')).text()
  assert.doesNotMatch(family, /data-search-crumb/)
})

test('a hostile search query cannot break the trail back', async () => {
  const fetch = await site()
  const query = 'roller & <bird>"\''
  const html = await (
    await fetch(`${ROLLER}?q=${encodeURIComponent(query)}`)
  ).text()
  assert.match(trail(html), /data-search-crumb>Search results<\/a>/)
  assert.match(trail(html), /href="\/search\?q=roller\+%26\+%3Cbird%3E%22%27"/)
  assert.doesNotMatch(trail(html), /<bird>/)
  assert.doesNotMatch(trail(html), /<script/)
})
