import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cacheRequest, PAGE_CACHE } from '../src/cache.js'
import { parseUrl, searchQuery } from '../src/route.js'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const ORIGIN = 'https://birds.truter.world'

const site = async () => {
  const { records } = await loadStore()
  // A fresh KV object per suite so the search record memo does not leak.
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

test('search routes parse q in every format', () => {
  for (const [path, format] of [
    ['/search', 'html'],
    ['/search.md', 'md'],
    ['/search.json', 'json'],
  ]) {
    const route = parseUrl(
      new URL(`${ORIGIN}${path}?q=%20lilac%20%20roller%20`),
    )
    assert.equal(route.kind, 'search')
    assert.equal(route.format, format)
    assert.equal(route.pathname, '/search')
    assert.equal(route.query, 'lilac roller')
  }
  assert.equal(parseUrl(new URL(`${ORIGIN}/search`)).query, '')
  assert.equal(searchQuery('x'.repeat(500)).length, 200)
})

test('the search cache key keeps the normalised query only on search pages', () => {
  const a = cacheRequest(`${ORIGIN}/search?q=roller&utm=x`, 'v1', 'en')
  const b = cacheRequest(`${ORIGIN}/search?q=%20roller%20`, 'v1', 'en')
  const c = cacheRequest(`${ORIGIN}/search?q=hornbill`, 'v1', 'en')
  assert.equal(a.url, b.url)
  assert.notEqual(a.url, c.url)
  assert.match(a.url, /[?&]v=v1/)
  assert.match(a.url, /[?&]q=roller/)
  assert.doesNotMatch(a.url, /utm/)
  const json = cacheRequest(`${ORIGIN}/search.json?q=roller`, 'v1', 'en')
  assert.match(json.url, /search\.json\?.*q=roller/)
  const species = cacheRequest(`${ORIGIN}/species?q=roller`, 'v1', 'en')
  assert.doesNotMatch(species.url, /q=/)
})

test('the html search page lists results under a counted heading', async () => {
  const fetch = await site()
  const response = await fetch('/search?q=lilac-breasted')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8')
  assert.equal(response.headers.get('cache-control'), PAGE_CACHE)
  assert.match(
    response.headers.get('content-security-policy'),
    /form-action 'self'/,
  )
  assert.match(
    response.headers.get('link'),
    /<https:\/\/birds\.truter\.world\/search\?q=lilac-breasted>; rel="canonical"/,
  )
  assert.match(response.headers.get('link'), /\/search\.md\?q=lilac-breasted>/)
  const html = await response.text()
  assert.match(html, /<meta name="robots" content="noindex">/)
  assert.match(
    html,
    /<h2 id="search-count">\d+ results? for “lilac-breasted”<\/h2>/,
  )
  assert.match(
    html,
    /<ol class="search-results" aria-labelledby="search-count">/,
  )
  assert.match(
    html,
    /<a href="\/species\/coracias-caudatus">Lilac-breasted Roller<\/a>/,
  )
  assert.match(html, /<span class="latin">Coracias caudatus<\/span>/)
  assert.match(html, /<span class="afrikaans">[^<]+<\/span>/)
  assert.match(
    html,
    /<input id="site-search-q" type="search" name="q" value="lilac-breasted"/,
  )
  assert.match(html, /href="\/search\.json\?q=lilac-breasted"/)
})

test('search finds families and caps the shown results', async () => {
  const fetch = await site()
  const family = await (await fetch('/search.json?q=hornbills')).json()
  assert.ok(
    family.results.some(
      (result) =>
        result.kind === 'family' && result.scientificName === 'Bucerotidae',
    ),
  )
  const broad = await (await fetch('/search.json?q=grassland')).json()
  assert.ok(broad.total > broad.results.length)
  assert.equal(broad.results.length, broad.limit)
  const html = await (await fetch('/search?q=grassland')).text()
  assert.match(html, /Showing the first 50\./)
})

test('the search page has an empty state and a no-match state', async () => {
  const fetch = await site()
  const empty = await fetch('/search')
  assert.equal(empty.status, 200)
  const emptyHtml = await empty.text()
  assert.match(emptyHtml, /<h1>Search<\/h1>/)
  assert.match(emptyHtml, /Type an English, Afrikaans or Latin bird name/)
  assert.doesNotMatch(emptyHtml, /search-results/)
  assert.match(
    empty.headers.get('link'),
    /<https:\/\/birds\.truter\.world\/search>; rel="canonical"/,
  )

  const none = await fetch('/search?q=%3Cb%3Equetzal%3C%2Fb%3E')
  assert.equal(none.status, 200)
  const noneHtml = await none.text()
  assert.match(noneHtml, /0 results for “&lt;b&gt;quetzal&lt;\/b&gt;”/)
  assert.match(noneHtml, /No bird matched “&lt;b&gt;quetzal&lt;\/b&gt;”/)
  assert.doesNotMatch(noneHtml, /<b>quetzal/)

  const md = await (await fetch('/search.md?q=quetzal')).text()
  assert.match(md, /^# Search\n/)
  assert.match(md, /## 0 results for “quetzal”/)
  assert.match(md, /No bird matched “quetzal”\./)

  const json = await (await fetch('/search.json?q=quetzal')).json()
  assert.deepEqual(
    {
      kind: json.kind,
      query: json.query,
      total: json.total,
      results: json.results,
    },
    { kind: 'search', query: 'quetzal', total: 0, results: [] },
  )
  const emptyJson = await (await fetch('/search.json')).json()
  assert.equal(emptyJson.query, '')
  assert.equal(emptyJson.total, 0)
})

test('the markdown and json search pages carry names and links', async () => {
  const fetch = await site()
  const md = await fetch('/search.md?q=roller')
  assert.equal(md.headers.get('content-type'), 'text/markdown; charset=utf-8')
  const text = await md.text()
  assert.match(text, /## \d+ results for “roller”/)
  assert.match(
    text,
    /- Species: \[Lilac-breasted Roller\]\(\/species\/coracias-caudatus\.md\) — \*Coracias caudatus\* · \S/,
  )
  assert.match(
    text,
    /Also available as \[HTML\]\(\/search\?q=roller\) and \[JSON\]\(\/search\.json\?q=roller\)/,
  )

  const markup = await (await fetch('/search.md?q=a*b_[c]')).text()
  assert.match(markup, /“a\\\*b\\_\\\[c\\\]”/)

  const json = await fetch('/search.json?q=roller')
  assert.equal(
    json.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  const data = await json.json()
  assert.equal(data.kind, 'search')
  assert.equal(data.query, 'roller')
  const roller = data.results.find(
    (r) => r.scientificName === 'Coracias caudatus',
  )
  assert.ok(roller)
  assert.equal(roller.englishName, 'Lilac-breasted Roller')
  assert.ok(roller.afrikaansName)
  assert.equal(roller.pages.html, `${ORIGIN}/species/coracias-caudatus`)
})

test('every html page has the header search form before the site nav', async () => {
  const fetch = await site()
  for (const path of [
    '/',
    '/species',
    '/families',
    '/species/coracias-caudatus',
    '/family/bucerotidae',
    '/vocab/colours',
    '/credits',
    '/sitemap',
    '/search?q=roller',
    '/no-such-page',
  ]) {
    const html = await (await fetch(path)).text()
    const form = html.indexOf(
      '<form class="site-search" role="search" method="get" action="/search">',
    )
    assert.ok(form > 0, `${path} has no header search form`)
    assert.ok(form > html.indexOf('<div class="brand">'), path)
    assert.ok(form < html.indexOf('<nav aria-label="Site">'), path)
    assert.match(
      html,
      /<label class="visually-hidden" for="site-search-q">/,
      path,
    )
    assert.match(
      html,
      /<span class="site-search-hint" aria-hidden="true">Type <kbd>\/<\/kbd> to search<\/span>/,
      path,
    )
    assert.match(html, /<svg class="site-search-icon" aria-hidden="true"/, path)
  }
})
