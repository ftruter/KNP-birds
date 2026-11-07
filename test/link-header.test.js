import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DISCOVERY_LINK, linkHeader } from '../src/head.js'
import { PAGE_CACHE } from '../src/cache.js'
import worker, { handleRequest } from '../src/worker.js'
import {
  cacheHarness,
  jpegObject,
  loadStore,
  mockBucket,
  mockKv,
  requestContext,
} from './helpers.js'

const origin = 'https://birds.truter.world'

const site = async (records, bucket = {}, env = {}) => {
  const kv = mockKv(records)
  const images = mockBucket(bucket)
  return {
    kv,
    async fetch(pathname, { method = 'GET' } = {}) {
      const ctx = requestContext()
      const response = await handleRequest(
        new Request(`${origin}${pathname}`, { method }),
        { BIRDS_KV: kv.kv, IMAGES: images.bucket, ...env },
        ctx,
      )
      await ctx.drain()
      return response
    },
  }
}

const pageLinks = (path) => {
  const html = path
  const md = path === '/' ? '/.md' : `${path}.md`
  const json = path === '/' ? '/.json' : `${path}.json`
  return linkHeader([
    `<${origin}${html}>; rel="canonical"`,
    `<${origin}${md}>; rel="alternate"; type="text/markdown"`,
    `<${origin}${json}>; rel="alternate"; type="application/json"`,
  ])
}

test('pages, files, and errors share the discovery Link header', async () => {
  const { records } = await loadStore()
  const app = await site(records, { 'pic.jpg': jpegObject() })
  const pages = [
    ['/', pageLinks('/')],
    ['/.md', pageLinks('/')],
    ['/.json', pageLinks('/')],
    ['/species/coracias-caudatus', pageLinks('/species/coracias-caudatus')],
    ['/species/coracias-caudatus.md', pageLinks('/species/coracias-caudatus')],
    ['/credits.json', pageLinks('/credits')],
    ['/missing.md', pageLinks('/missing')],
  ]
  for (const [pathname, expected] of pages) {
    const response = await app.fetch(pathname)
    assert.equal(response.headers.get('link'), expected, pathname)
    assert.match(
      response.headers.get('content-security-policy'),
      /script-src 'self'/,
      pathname,
    )
  }
  for (const pathname of [
    '/llms.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/style.css',
    '/app.js',
    '/.well-known/ard.json',
    '/mcp/server-card',
  ]) {
    const response = await app.fetch(pathname)
    assert.equal(response.headers.get('link'), DISCOVERY_LINK, pathname)
    assert.doesNotMatch(
      response.headers.get('link'),
      /rel="alternate"/,
      pathname,
    )
  }
  const head = await app.fetch('/families', { method: 'HEAD' })
  assert.equal(head.headers.get('link'), pageLinks('/families'))
  assert.equal(await head.text(), '')
  const slash = await app.fetch('/species/')
  assert.equal(slash.status, 301)
  assert.equal(slash.headers.get('link'), DISCOVERY_LINK)
  const image = await app.fetch('/images/pic.jpg')
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('link'), null)
  const audio = await app.fetch('/audio/missing.mp3')
  assert.equal(audio.status, 404)
  assert.equal(audio.headers.get('content-type'), 'text/plain; charset=utf-8')
})

test('a cached page keeps the Link header and its cache policy', async () => {
  const cache = cacheHarness()
  try {
    const { records } = await loadStore()
    const app = await site(
      records,
      {},
      {
        DATA_VERSION: 'link-one',
        DATA_PUBLISHED_AT: String(Date.now() - 120_000),
      },
    )
    const first = await app.fetch('/species')
    assert.equal(first.headers.get('cache-control'), PAGE_CACHE)
    assert.equal(first.headers.get('link'), pageLinks('/species'))
    await first.text()
    const reads = app.kv.gets.length
    const second = await app.fetch('/species')
    assert.equal(second.headers.get('link'), pageLinks('/species'))
    assert.equal(second.headers.get('cache-control'), PAGE_CACHE)
    assert.equal(app.kv.gets.length, reads)
  } finally {
    cache.uninstall()
  }
})

test('the MCP transport does not carry the discovery Link header', async () => {
  const { records } = await loadStore()
  const kv = mockKv(records)
  const ctx = requestContext()
  const response = await worker.fetch(
    new Request(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        host: 'birds.truter.world',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'link-test', version: '0' },
        },
      }),
    }),
    { BIRDS_KV: kv.kv },
    ctx,
  )
  await ctx.drain()
  const link = response.headers.get('link') || ''
  assert.equal(link.includes('rel="ard"'), false)
  assert.equal(link.includes('mcp-server-card'), false)
})
