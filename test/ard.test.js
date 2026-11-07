import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import Ajv from 'ajv/dist/2020.js'
import { ARD_LINK, DISCOVERY_LINK } from '../src/head.js'
import { KV_CONSISTENCY_MS, NO_STORE, PAGE_CACHE } from '../src/cache.js'
import { handleRequest } from '../src/worker.js'
import { cacheHarness, loadStore, mockKv, requestContext } from './helpers.js'

const origin = 'https://birds.truter.world'

const ajv = new Ajv({ allErrors: true, strict: false })
ajv.addFormat('uri', {
  type: 'string',
  validate: (value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  },
})
ajv.addFormat('date-time', {
  type: 'string',
  validate: (value) => !Number.isNaN(Date.parse(value)),
})

const schema = async (name) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  )

const compile = async (file, ref) => {
  const document = await schema(file)
  ajv.removeSchema(document.$id)
  ajv.addSchema(document)
  return ajv.compile(ref ? { $ref: `${document.$id}${ref}` } : document)
}

const site = async (records, env = {}) => {
  const kv = mockKv(records)
  return {
    kv,
    async fetch(pathname, { method = 'GET' } = {}) {
      const ctx = requestContext()
      const response = await handleRequest(
        new Request(`${origin}${pathname}`, { method }),
        { BIRDS_KV: kv.kv, ...env },
        ctx,
      )
      await ctx.drain()
      return response
    },
  }
}

const errorsOf = (validate, value) =>
  validate(value) ? '' : ajv.errorsText(validate.errors)

test('ARD and ai-catalog manifests share entries and match the official schemas', async () => {
  const validateManifest = await compile(
    'ard-entry.schema.json',
    '#/$defs/ArdManifest',
  )
  const validateEntry = await compile(
    'ard-entry.schema.json',
    '#/$defs/ArdEntry',
  )
  const validateCatalog = await compile('ai-catalog.schema.json')
  const { records } = await loadStore()
  const app = await site(records, {
    DATA_PUBLISHED_AT: String(Date.now() - 120_000),
  })
  const speciesIndex = JSON.parse(records['index/species'])
  const familiesIndex = JSON.parse(records['index/families'])
  const ardResponse = await app.fetch('/.well-known/ard.json')
  const catalogResponse = await app.fetch('/.well-known/ai-catalog.json')
  assert.equal(ardResponse.status, 200)
  assert.equal(catalogResponse.status, 200)
  assert.equal(
    ardResponse.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  assert.equal(
    catalogResponse.headers.get('content-type'),
    'application/json; charset=utf-8',
  )
  assert.equal(ardResponse.headers.get('cache-control'), PAGE_CACHE)
  assert.equal(catalogResponse.headers.get('cache-control'), PAGE_CACHE)
  assert.equal(ardResponse.headers.get('link'), DISCOVERY_LINK)
  assert.doesNotMatch(ardResponse.headers.get('link'), /\.md/)
  const ard = await ardResponse.json()
  const catalog = await catalogResponse.json()
  assert.equal(errorsOf(validateManifest, ard), '')
  assert.equal(errorsOf(validateCatalog, catalog), '')
  assert.equal(catalog.specVersion, '1.0')
  assert.deepEqual(catalog.entries, ard.entries)
  assert.ok(ard.entries.length >= 2 && ard.entries.length <= 5)
  const urls = new Set()
  for (const item of ard.entries) {
    assert.equal(errorsOf(validateEntry, item), '', item.identifier)
    assert.match(item.identifier, /^urn:air:birds\.truter\.world:/)
    assert.ok(item.representativeQueries.length >= 2)
    assert.ok(item.representativeQueries.length <= 5)
    assert.equal(Object.hasOwn(item, 'data'), false)
    assert.equal(item.url.endsWith('/mcp'), false)
    const url = new URL(item.url)
    assert.equal(url.origin, origin)
    urls.add(url.pathname)
    const resource = await app.fetch(url.pathname)
    assert.equal(resource.status, 200, item.url)
    const type = resource.headers.get('content-type').split(';')[0].trim()
    assert.equal(type, item.type, item.url)
  }
  assert.equal(urls.has('/mcp/server-card'), true)
  const home = ard.entries.find((item) => item.url.endsWith('/.json'))
  assert.match(
    home.description,
    new RegExp(String(Object.keys(speciesIndex).length)),
  )
  assert.match(
    home.description,
    new RegExp(String(Object.keys(familiesIndex).length)),
  )
  assert.match(home.description, /\/llms\.txt/)
  assert.ok(home.representativeQueries.length <= 5)
  assert.equal(
    ard.entries.some((item) => item.type === 'text/plain'),
    false,
  )
  assert.equal(
    ard.entries.every((item) => item.type.startsWith('application/')),
    true,
  )
  const card = await (await app.fetch('/mcp/server-card')).json()
  const mcp = ard.entries.find(
    (item) => item.type === 'application/mcp-server-card+json',
  )
  assert.equal(card.remotes[0].url, `${origin}/mcp`)
  assert.notEqual(mcp.url, card.remotes[0].url)
  assert.equal(card.description.length <= 100, true)
  assert.doesNotMatch(JSON.stringify(ard), /mcp-server[^-]/)
  assert.doesNotMatch(JSON.stringify(ard), /a2a-agent/)
  assert.doesNotMatch(JSON.stringify(ard), /ai-registry/)
})

test('HTML heads advertise rel=ard and not the predecessor relation', async () => {
  const { records } = await loadStore()
  const app = await site(records)
  for (const pathname of ['/', '/species/coracias-caudatus', '/missing']) {
    const response = await app.fetch(pathname)
    const body = await response.text()
    assert.match(
      body,
      new RegExp(ARD_LINK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
    assert.equal(body.includes('rel="ai-catalog"'), false, pathname)
    assert.doesNotMatch(body, /<script/i)
  }
})

test('the manifest is no-store while a KV publish may still be stale', async () => {
  const cache = cacheHarness()
  try {
    const { records } = await loadStore()
    const fresh = await site(records, {
      DATA_VERSION: 'ard-one',
      DATA_PUBLISHED_AT: String(Date.now()),
    })
    const first = await fresh.fetch('/.well-known/ard.json')
    assert.equal(first.headers.get('cache-control'), NO_STORE)
    await first.text()
    const reads = fresh.kv.gets.length
    const second = await fresh.fetch('/.well-known/ard.json')
    assert.equal(second.headers.get('cache-control'), NO_STORE)
    await second.text()
    assert.ok(fresh.kv.gets.length > reads)
    const settled = await site(records, {
      DATA_VERSION: 'ard-two',
      DATA_PUBLISHED_AT: String(Date.now() - KV_CONSISTENCY_MS),
    })
    const warm = await settled.fetch('/.well-known/ai-catalog.json')
    assert.equal(warm.headers.get('cache-control'), PAGE_CACHE)
    await warm.text()
    const settledReads = settled.kv.gets.length
    await (await settled.fetch('/.well-known/ai-catalog.json')).text()
    assert.equal(settled.kv.gets.length, settledReads)
  } finally {
    cache.uninstall()
  }
})

test('a catalog without published indexes omits missing documents', async () => {
  const validateCatalog = await compile('ai-catalog.schema.json')
  const app = await site({})
  const ard = await (await app.fetch('/.well-known/ard.json')).json()
  const catalog = await (await app.fetch('/.well-known/ai-catalog.json')).json()
  assert.equal(errorsOf(validateCatalog, catalog), '')
  assert.deepEqual(
    ard.entries.map((item) => item.identifier),
    [
      'urn:air:birds.truter.world:mcp:field-guide',
      'urn:air:birds.truter.world:guide:home',
    ],
  )
  assert.match(ard.entries[1].description, /not available/i)
  assert.match(ard.entries[1].description, /\/llms\.txt/)
  for (const item of ard.entries) {
    const response = await app.fetch(new URL(item.url).pathname)
    assert.equal(response.status, 200, item.url)
  }
})
