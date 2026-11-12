import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { cacheRequest, OBJECT_CACHE } from '../src/cache.js'
import { SHORT_NAME } from '../src/head.js'
import { iconFiles, iconVersion } from '../src/icon.js'
import { ICON_PATHS, parseUrl } from '../src/route.js'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const origin = 'https://birds.truter.world'

const fetchPath = async (pathname, method = 'GET') => {
  const { records } = await loadStore()
  const ctx = requestContext()
  const response = await handleRequest(
    new Request(`${origin}${pathname}`, { method }),
    { BIRDS_KV: mockKv(records).kv, IMAGES: mockBucket().bucket },
    ctx,
  )
  await ctx.drain()
  return response
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from the IHDR chunk, which always comes first. */
const pngSize = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return [view.getUint32(16), view.getUint32(20)]
}

test('every icon path has a file and a route', () => {
  assert.deepEqual(Object.keys(iconFiles).sort(), [...ICON_PATHS].sort())
  for (const path of ICON_PATHS) {
    assert.equal(parseUrl(new URL(origin + path)).kind, 'icon', path)
    assert.equal(parseUrl(new URL(`${origin}${path}.md`)).kind, 'not-found')
  }
})

test('the PNG icons have the sizes their names and uses promise', () => {
  const sizes = {
    '/apple-touch-icon.png': 180,
    '/icon-192.png': 192,
    '/icon-512.png': 512,
    '/icon-maskable-512.png': 512,
  }
  for (const [path, size] of Object.entries(sizes)) {
    const { body } = iconFiles[path]
    assert.deepEqual([...body.slice(0, 8)], PNG, path)
    assert.deepEqual(pngSize(body), [size, size], path)
  }
})

test('favicon.ico holds 16, 32 and 48 px PNG images', () => {
  const { body } = iconFiles['/favicon.ico']
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  assert.equal(view.getUint16(0, true), 0)
  assert.equal(view.getUint16(2, true), 1)
  assert.equal(view.getUint16(4, true), 3)
  const sizes = [0, 1, 2].map((index) => {
    const entry = 6 + 16 * index
    const length = view.getUint32(entry + 8, true)
    const offset = view.getUint32(entry + 12, true)
    const image = body.slice(offset, offset + length)
    assert.deepEqual([...image.slice(0, 8)], PNG)
    assert.deepEqual(pngSize(image), [body[entry], body[entry + 1]])
    return body[entry]
  })
  assert.deepEqual(sizes, [16, 32, 48])
})

test('icons are served with their type, a long cache lifetime and a body', async () => {
  const types = {
    '/favicon.ico': 'image/x-icon',
    '/favicon.svg': 'image/svg+xml',
    '/apple-touch-icon.png': 'image/png',
    '/icon-192.png': 'image/png',
    '/icon-512.png': 'image/png',
    '/icon-maskable-512.png': 'image/png',
  }
  for (const [path, type] of Object.entries(types)) {
    const response = await fetchPath(`${path}?v=${iconVersion}`)
    assert.equal(response.status, 200, path)
    assert.equal(response.headers.get('content-type'), type, path)
    assert.equal(response.headers.get('cache-control'), OBJECT_CACHE, path)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    const body = new Uint8Array(await response.arrayBuffer())
    assert.deepEqual(body, iconFiles[path].body, path)
    assert.equal(
      response.headers.get('content-length'),
      String(body.length),
      path,
    )
  }
  const head = await fetchPath('/favicon.ico', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal((await head.arrayBuffer()).byteLength, 0)
})

test('the favicon is a self-contained SVG', async () => {
  const svg = await (await fetchPath('/favicon.svg')).text()
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/)
  assert.doesNotMatch(svg, /<script|<style|href=|url\(/)
})

test('the icon cache key does not vary by language or query', () => {
  const key = (path, language) =>
    cacheRequest(`${origin}${path}`, 'v1', language).url
  assert.equal(key('/favicon.ico?v=abc', 'af'), key('/favicon.ico', 'en-GB'))
  assert.doesNotMatch(key('/apple-touch-icon.png', 'af'), /lang=/)
})

test('every page names the short home screen title and links the icons', async () => {
  assert.equal(SHORT_NAME, 'Birds of KNP')
  for (const path of [
    '/',
    '/species',
    '/credits',
    '/identify/sound',
    '/nope',
  ]) {
    const html = await (await fetchPath(path)).text()
    for (const tag of [
      '<meta name="application-name" content="Birds of KNP">',
      '<meta name="apple-mobile-web-app-title" content="Birds of KNP">',
      `<link rel="icon" href="/favicon.ico?v=${iconVersion}" sizes="32x32">`,
      `<link rel="icon" href="/favicon.svg?v=${iconVersion}" type="image/svg+xml">`,
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${iconVersion}">`,
    ])
      assert.ok(html.includes(tag), `${path} lacks ${tag}`)
  }
  const home = await (await fetchPath('/')).text()
  assert.match(home, /<title>Birds of Kruger National Park<\/title>/)
})

test('the generated icons match the master drawing', async () => {
  const master = await readFile(
    new URL('../icons/icon.svg', import.meta.url),
    'utf8',
  )
  const bird = master.match(/<g id="bird"[\s\S]*?<\/g>/)[0]
  const svg = new TextDecoder().decode(iconFiles['/favicon.svg'].body)
  for (const [, d] of bird.matchAll(/ d="([^"]+)"/g))
    assert.ok(svg.includes(`d="${d}"`), `favicon.svg lacks path ${d}`)
})
