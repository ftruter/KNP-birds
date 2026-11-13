import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { deploy } from '../scripts/deploy.mjs'
import {
  INDEXNOW_ENDPOINT,
  MANIFEST_KEY,
  announceIndexNow,
  changedPaths,
  hashEntries,
  pathsForKey,
} from '../scripts/indexnow.mjs'
import { MANAGED_PREFIXES } from '../scripts/publish-kv.mjs'
import { INDEXNOW_KEY, INDEXNOW_KEY_PATH } from '../src/indexnow.js'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const origin = 'https://birds.truter.world'

const entries = [
  { key: 'species/coracias-caudatus', value: 'roller' },
  { key: 'family/coraciidae', value: 'rollers' },
  { key: 'index/species', value: 'all species' },
  { key: 'index/offline', value: 'offline list' },
]

/** Stands in for wrangler: a KV namespace of one manifest. */
const kvRun = (stored = null) => {
  const state = { stored, calls: [] }
  state.run = async (args) => {
    state.calls.push(args.slice(0, 3).join(' '))
    if (args[2] === 'get') {
      if (state.stored == null) throw new Error('not found')
      return state.stored
    }
    if (args[2] === 'put') {
      assert.equal(args[3], MANIFEST_KEY)
      state.stored = await readFile(args[args.indexOf('--path') + 1], 'utf8')
    }
    return ''
  }
  return state
}

const engine = (status = 200) => {
  const state = { requests: [] }
  state.fetch = async (url, init) => {
    state.requests.push({ url, body: JSON.parse(init.body), init })
    return new Response(null, { status })
  }
  return state
}

const quiet = () => {}

test('the key file is served at the path the key names', async () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{8,128}$/)
  const { records } = await loadStore()
  const ctx = requestContext()
  const response = await handleRequest(
    new Request(`${origin}${INDEXNOW_KEY_PATH}`),
    { BIRDS_KV: mockKv(records).kv, IMAGES: mockBucket({}).bucket },
    ctx,
  )
  await ctx.drain()
  assert.equal(response.status, 200)
  assert.equal(
    response.headers.get('content-type'),
    'text/plain; charset=utf-8',
  )
  assert.equal(await response.text(), INDEXNOW_KEY)
})

test('a KV key maps to the pages rendered from it', () => {
  assert.deepEqual(pathsForKey('species/coracias-caudatus'), [
    '/species/coracias-caudatus',
  ])
  assert.deepEqual(pathsForKey('family/coraciidae'), ['/family/coraciidae'])
  assert.deepEqual(pathsForKey('vocab/colours'), ['/vocab/colours'])
  assert.deepEqual(pathsForKey('index/species'), ['/species', '/', '/sitemap'])
  assert.deepEqual(pathsForKey('index/offline'), [])
  assert.deepEqual(pathsForKey(MANIFEST_KEY), [])
})

test('a KV publish never deletes the manifest', () => {
  assert.equal(
    MANAGED_PREFIXES.some((prefix) => MANIFEST_KEY.startsWith(prefix)),
    false,
  )
})

test('only changed, new and removed documents are listed', () => {
  const before = hashEntries(entries)
  assert.deepEqual(changedPaths(before, before), [])
  const after = hashEntries([
    { key: 'species/coracias-caudatus', value: 'roller, edited' },
    { key: 'index/species', value: 'all species' },
    { key: 'index/offline', value: 'offline list, edited' },
    { key: 'species/upupa-africana', value: 'hoopoe' },
  ])
  assert.deepEqual(changedPaths(before, after), [
    '/family/coraciidae',
    '/species/coracias-caudatus',
    '/species/upupa-africana',
  ])
})

test('the first submission sends every page and stores the manifest', async () => {
  const kv = kvRun()
  const search = engine(202)
  const { submitted } = await announceIndexNow({
    entries,
    run: kv.run,
    fetch: search.fetch,
    log: quiet,
  })
  assert.deepEqual(submitted, [
    '/',
    '/ask-ai',
    '/family/coraciidae',
    '/sitemap',
    '/species',
    '/species/coracias-caudatus',
  ])
  assert.equal(search.requests.length, 1)
  const [{ url, body, init }] = search.requests
  assert.equal(url, INDEXNOW_ENDPOINT)
  assert.equal(init.method, 'POST')
  assert.deepEqual(body, {
    host: 'birds.truter.world',
    key: INDEXNOW_KEY,
    keyLocation: `${origin}${INDEXNOW_KEY_PATH}`,
    urlList: submitted.map((pathname) => `${origin}${pathname}`),
  })
  assert.deepEqual(JSON.parse(kv.stored).hashes, hashEntries(entries))

  const again = await announceIndexNow({
    entries,
    run: kv.run,
    fetch: search.fetch,
    log: quiet,
  })
  assert.deepEqual(again.submitted, [])
  assert.equal(search.requests.length, 1)
})

test('a refused submission leaves the manifest for the next deploy', async () => {
  const kv = kvRun()
  await assert.rejects(
    () =>
      announceIndexNow({
        entries,
        run: kv.run,
        fetch: engine(403).fetch,
        log: quiet,
      }),
    /IndexNow answered 403/,
  )
  assert.equal(kv.stored, null)
})

test('a dry run sends nothing and stores nothing', async () => {
  const kv = kvRun()
  const search = engine()
  const lines = []
  await announceIndexNow({
    dryRun: true,
    entries,
    run: kv.run,
    fetch: search.fetch,
    log: (line) => lines.push(line),
  })
  assert.equal(search.requests.length, 0)
  assert.equal(kv.stored, null)
  assert.match(lines.at(-1), /6 pages, nothing sent/)
})

test('a failed submission does not fail the deploy', async (t) => {
  t.mock.method(console, 'error', quiet)
  const version = 'a'.repeat(64)
  const result = await deploy({
    publish: async () => ({ version, publishedAt: 1 }),
    run: async () => {},
    announce: async () => {
      throw new Error('IndexNow answered 429')
    },
  })
  assert.deepEqual(result, { version, publishedAt: 1 })
})
