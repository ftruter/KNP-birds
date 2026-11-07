import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clientJs } from '../src/client.js'
import { sortRows } from '../src/lists.js'
import { compareSortKeys } from '../src/sort.js'

const row = (latin, en, extra = {}) => ({
  scientificName: latin,
  en,
  af: extra.af ?? null,
  presence: extra.presence ?? { summer: true, winter: true },
  estimate: extra.estimate ?? null,
  summer: extra.summer ?? null,
  winter: extra.winter ?? null,
})

const speciesValue = (item, column) => {
  if (column === 'en') return item.en || null
  if (column === 'summer')
    return item.presence?.summer === true ? (item.estimate?.sort ?? null) : null
  return item.scientificName
}

test('the browser comparator matches the server sort, including nulls and Latin ties', () => {
  assert.equal(clientJs.includes(compareSortKeys.toString()), true)
  const rows = [
    row('Zeta zeta', 'Zebra', { af: null }),
    row('Alpha alpha', 'Zebra', {
      estimate: { sort: 10 },
      presence: { summer: true, winter: false },
    }),
    row('Beta beta', 'Ant', {
      estimate: { sort: 2 },
      presence: { summer: true, winter: true },
    }),
    row('Gamma gamma', 'Bee', { presence: { summer: false, winter: true } }),
  ]
  for (const column of ['en', 'summer']) {
    for (const dir of ['asc', 'desc']) {
      const server = sortRows(rows, column, dir, speciesValue).map(
        (item) => item.scientificName,
      )
      const client = rows
        .slice()
        .sort((a, b) =>
          compareSortKeys(
            { value: speciesValue(a, column), latin: a.scientificName },
            { value: speciesValue(b, column), latin: b.scientificName },
            dir,
          ),
        )
        .map((item) => item.scientificName)
      assert.deepEqual(client, server, `${column} ${dir}`)
    }
  }
  const asc = sortRows(rows, 'summer', 'asc', speciesValue).map(
    (item) => item.scientificName,
  )
  assert.deepEqual(asc.slice(0, 2), ['Beta beta', 'Alpha alpha'])
  assert.deepEqual(asc.slice(2).sort(), ['Gamma gamma', 'Zeta zeta'].sort())
  assert.equal(asc.at(-1) === 'Gamma gamma' || asc.at(-1) === 'Zeta zeta', true)
  const names = sortRows(rows, 'en', 'asc', speciesValue).map(
    (item) => item.scientificName,
  )
  assert.deepEqual(names.slice(0, 2), ['Beta beta', 'Gamma gamma'])
  assert.deepEqual(names.slice(2), ['Alpha alpha', 'Zeta zeta'])
})

test('pages keep server sort links and only allow a same-origin module', async () => {
  const { handleRequest } = await import('../src/worker.js')
  const { loadStore, mockBucket, mockKv, requestContext } =
    await import('./helpers.js')
  const { records } = await loadStore()
  const kv = mockKv(records)
  const ctx = requestContext()
  const response = await handleRequest(
    new Request('https://birds.truter.world/species'),
    { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
    ctx,
  )
  await ctx.drain()
  const html = await response.text()
  const csp = response.headers.get('content-security-policy')
  assert.match(csp, /script-src 'self'/)
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/)
  assert.match(html, /href="\/species\?sort=en&amp;dir=/)
  assert.match(html, /data-sort-value=/)
  assert.match(html, /data-latin=/)
  const script = await handleRequest(
    new Request('https://birds.truter.world/app.js'),
    { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
    requestContext(),
  )
  assert.equal(
    script.headers.get('content-type'),
    'text/javascript; charset=utf-8',
  )
  assert.equal(await script.text(), clientJs)
})
