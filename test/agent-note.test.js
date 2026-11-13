import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentNote } from '../src/head.js'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const origin = 'https://birds.truter.world'
const note = agentNote(origin)

const site = async (records) => {
  const kv = mockKv(records)
  return {
    async fetch(pathname, requestOrigin = origin) {
      const ctx = requestContext()
      const response = await handleRequest(
        new Request(`${requestOrigin}${pathname}`),
        { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
        ctx,
      )
      await ctx.drain()
      return response
    },
  }
}

test('every markdown route carries the same MCP note after the title', async () => {
  const { records } = await loadStore()
  const app = await site(records)
  const paths = [
    '/.md',
    '/species.md',
    '/families.md',
    '/species/coracias-caudatus.md',
    '/family/coraciidae.md',
    '/credits.md',
    '/facts.md',
    '/sitemap.md',
    '/vocab/colours.md',
    '/missing.md',
  ]
  for (const pathname of paths) {
    const response = await app.fetch(pathname)
    assert.equal(
      response.status === 200 || response.status === 404,
      true,
      pathname,
    )
    assert.equal(
      response.headers.get('content-type'),
      'text/markdown; charset=utf-8',
      pathname,
    )
    const body = await response.text()
    assert.match(body, /^# .+\n\n> AI agents:/, pathname)
    assert.ok(body.includes(note), pathname)
    assert.doesNotMatch(body, /<script/i, pathname)
  }
})

test('llms.txt is the agent guide and names the MCP server before the URL scheme', async () => {
  const { records } = await loadStore()
  const app = await site(records)
  const response = await app.fetch('/llms.txt')
  assert.equal(response.status, 200)
  assert.equal(
    response.headers.get('content-type'),
    'text/plain; charset=utf-8',
  )
  const body = await response.text()
  assert.match(body, /^# Agent guide:/)
  assert.match(body, /It is not the home page/)
  assert.ok(body.includes(note))
  assert.ok(body.indexOf(note) < body.indexOf('## URL scheme'))
  const home = await (await app.fetch('/.md')).text()
  assert.match(home, /^# Birds of Kruger National Park/)
  assert.notEqual(body.slice(0, 40), home.slice(0, 40))
  assert.doesNotMatch(body, /## What these pages compare/)
  const queried = await (await app.fetch('/llms.txt?utm=1')).text()
  assert.equal(queried, body)
  const upper = await app.fetch('/LLMS.TXT')
  assert.equal(upper.status, 301)
  assert.equal(upper.headers.get('location'), '/llms.txt')
  const dotted = await (await app.fetch('/llms.txt.md')).text()
  assert.match(dotted, /^# Not found/)
  assert.doesNotMatch(dotted, /^# Birds of Kruger National Park/)
})

test('the home page and every HTML footer mention the MCP server', async () => {
  const { records } = await loadStore()
  const app = await site(records)
  const home = await (await app.fetch('/')).text()
  assert.match(home, /public read-only MCP server at/)
  assert.equal(
    (home.match(/href="https:\/\/birds\.truter\.world\/mcp"/g) || []).length >=
      2,
    true,
  )
  assert.match(
    home,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(home, /<script(?! type="module")/i)
  const species = await (await app.fetch('/species/coracias-caudatus')).text()
  assert.match(species, /href="https:\/\/birds\.truter\.world\/mcp"/)
  const preview = await (
    await app.fetch('/.md', 'https://preview.example')
  ).text()
  assert.match(preview, /https:\/\/preview\.example\/mcp/)
  assert.doesNotMatch(preview, /https:\/\/birds\.truter\.world\/mcp/)
})
