import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server'
import { SEARCH_DESCRIPTION } from '../src/mcp.js'
import worker, { handleRequest } from '../src/worker.js'
import { loadStore, mockKv, requestContext } from './helpers.js'

const origin = 'https://birds.truter.world'

const rpcMessage = (response, text) => {
  const type = response.headers.get('content-type') || ''
  if (type.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice('data: '.length)))
    return data.at(-1)
  }
  return JSON.parse(text)
}

const envFor = async () => {
  const { records } = await loadStore()
  return {
    records,
    env: {
      BIRDS_KV: mockKv(records).kv,
      DATA_VERSION: 'mcp-test',
      DATA_PUBLISHED_AT: String(Date.now() - 120_000),
    },
  }
}

const postMcp = async (env, body, headers = {}) => {
  const ctx = requestContext()
  const response = await worker.fetch(
    new Request(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        host: 'birds.truter.world',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    env,
    ctx,
  )
  await ctx.drain()
  const text = await response.text()
  return { response, text, message: rpcMessage(response, text) }
}

const callSearch = (env, args) =>
  postMcp(env, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'search', arguments: args },
  })

test('initialize and tools/list expose only the public search tool', async () => {
  const { env } = await envFor()
  const initialized = await postMcp(env, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'knp-test', version: '0' },
    },
  })
  assert.equal(initialized.response.status, 200)
  assert.equal(
    initialized.message.result.serverInfo.name,
    'birds.truter.world/field-guide',
  )
  assert.equal(initialized.message.result.protocolVersion, '2025-11-25')
  const listed = await postMcp(env, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  })
  assert.equal(listed.response.status, 200)
  const tools = listed.message.result.tools
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['search'],
  )
  assert.match(tools[0].description, /public read-only/i)
  assert.match(tools[0].description, /KNP bird records/)
  assert.equal(tools[0].description, SEARCH_DESCRIPTION)
  assert.equal(tools[0].annotations.readOnlyHint, true)
  assert.equal(tools[0].annotations.destructiveHint, false)
})

test('search finds rollers, Afrikaans, scientific names, families, and misses', async () => {
  const { env } = await envFor()
  const rollers = await callSearch(env, { query: 'roller' })
  assert.equal(rollers.response.status, 200)
  const rollerBody = rollers.message.result
  assert.equal(rollerBody.isError, undefined)
  const rollerNames = rollerBody.structuredContent.results.map(
    (result) => result.englishName,
  )
  assert.ok(rollerNames.includes('Lilac-breasted Roller'))
  assert.ok(rollerNames.filter((name) => /roller/i.test(name)).length >= 2)
  assert.equal(rollerBody.structuredContent.limit, 10)
  assert.ok(rollerBody.structuredContent.total >= rollerNames.length)
  const lilac = rollerBody.structuredContent.results.find(
    (result) => result.englishName === 'Lilac-breasted Roller',
  )
  assert.equal(lilac.scientificName, 'Coracias caudatus')
  assert.equal(lilac.afrikaansName, 'Gewone Troupant')
  assert.equal(lilac.population, null)
  assert.equal(lilac.pages.html, `${origin}/species/coracias-caudatus`)
  assert.equal(lilac.pages.markdown, `${origin}/species/coracias-caudatus.md`)
  assert.equal(lilac.pages.json, `${origin}/species/coracias-caudatus.json`)
  const page = await handleRequest(
    new Request(lilac.pages.html),
    env,
    requestContext(),
  )
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Lilac-breasted Roller/)

  const afrikaans = await callSearch(env, { query: 'gewone troupant' })
  assert.equal(
    afrikaans.message.result.structuredContent.results[0].scientificName,
    'Coracias caudatus',
  )
  const scientific = await callSearch(env, { query: 'Coracias caudatus' })
  assert.equal(
    scientific.message.result.structuredContent.results[0].scientificName,
    'Coracias caudatus',
  )
  const folded = await callSearch(env, { query: 'muiskleurvlieevanger' })
  assert.equal(
    folded.message.result.structuredContent.results[0].englishName,
    'Pale Flycatcher',
  )
  const family = await callSearch(env, { query: 'coraciidae' })
  const familyHit = family.message.result.structuredContent.results[0]
  assert.equal(familyHit.kind, 'family')
  assert.equal(familyHit.scientificName, 'Coraciidae')
  assert.equal(familyHit.englishName, 'Rollers')
  assert.equal(familyHit.pages.html, `${origin}/family/coraciidae`)

  const empty = await callSearch(env, { query: 'zzzznotabird' })
  assert.equal(empty.message.result.structuredContent.total, 0)
  assert.deepEqual(empty.message.result.structuredContent.results, [])
  assert.match(empty.message.result.content[0].text, /no published/i)
  assert.equal(empty.message.result.isError, undefined)

  const limited = await callSearch(env, { query: 'roller', limit: 1 })
  assert.equal(limited.message.result.structuredContent.results.length, 1)
  assert.ok(limited.message.result.structuredContent.total > 1)
})

test('search rejects empty and oversized limits without leaking internals', async () => {
  const { env } = await envFor()
  const blank = await callSearch(env, { query: '   ' })
  assert.equal(blank.response.status, 200)
  assert.equal(blank.message.result.isError, true)
  assert.match(blank.message.result.content[0].text, /text query/)
  assert.equal(JSON.stringify(blank.message).includes('BIRDS_KV'), false)

  const huge = await callSearch(env, { query: 'roller', limit: 26 })
  assert.equal(huge.message.result.isError, true)
  assert.match(huge.message.result.content[0].text, /25/)
  assert.equal(huge.text.includes('BIRDS_KV'), false)

  const broken = {
    BIRDS_KV: {
      async get() {
        throw new Error('secret token kv-down')
      },
    },
  }
  const failed = await callSearch(broken, { query: 'roller' })
  assert.equal(failed.message.result.isError, true)
  assert.match(failed.message.result.content[0].text, /unavailable/)
  assert.equal(failed.text.includes('secret token'), false)
  assert.equal(failed.text.includes('kv-down'), false)
})

test('the MCP host and origin checks reject other sites', async () => {
  const { env } = await envFor()
  const foreignHost = await postMcp(
    env,
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    { host: 'evil.example' },
  )
  assert.equal(foreignHost.response.status, 403)
  const foreignOrigin = await postMcp(
    env,
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    { origin: 'https://evil.example' },
  )
  assert.equal(foreignOrigin.response.status, 403)
})

test('the server card describes the transport and the installed protocol versions', async () => {
  const { env } = await envFor()
  const ctx = requestContext()
  const response = await handleRequest(
    new Request(`${origin}/mcp/server-card`),
    env,
    ctx,
  )
  await ctx.drain()
  assert.equal(response.status, 200)
  assert.equal(
    response.headers.get('content-type').split(';')[0].trim(),
    'application/mcp-server-card+json',
  )
  const card = await response.json()
  assert.equal(
    card.$schema,
    'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  )
  assert.equal(card.name, 'birds.truter.world/field-guide')
  assert.equal(card.description.length <= 100, true)
  assert.match(card.description, /public read-only/i)
  assert.equal(card.remotes.length, 1)
  assert.equal(card.remotes[0].type, 'streamable-http')
  assert.equal(card.remotes[0].url, `${origin}/mcp`)
  assert.deepEqual(card.remotes[0].supportedProtocolVersions, [
    ...SUPPORTED_PROTOCOL_VERSIONS,
  ])
  assert.equal(card.remotes[0].headers, undefined)
})
