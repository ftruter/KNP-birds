import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { deriveAll, readCatalog } from '../scripts/seed.mjs'
import { renderHomeHtml } from '../src/html.js'
import { taxonomyPayload } from '../src/taxonomy.js'
import { readJson } from './helpers.js'

test('every family is placed in one IOC order, with every species under it', async () => {
  const { species, families } = await readCatalog()
  const derived = deriveAll(species, families)
  const doc = derived.taxonomy
  assert.equal(doc.kind, 'taxonomy')
  assert.equal(doc.source.title, 'IOC World Bird List (v15.2)')
  assert.equal(doc.orders.length, 27)
  assert.deepEqual(await readJson('data/index/taxonomy.json'), doc)
  const slugs = doc.orders.flatMap((order) =>
    order.families.map((family) => family.slug),
  )
  assert.equal(new Set(slugs).size, 86)
  assert.equal(slugs.length, 86)
  const listed = doc.orders.reduce(
    (sum, order) =>
      sum +
      order.families.reduce(
        (inner, family) => inner + family.species.length,
        0,
      ),
    0,
  )
  assert.equal(listed, species.length)
  assert.equal(listed, 493)
  const ground = doc.orders
    .find((order) => order.scientificName === 'Bucerotiformes')
    .families.map((family) => family.slug)
  assert.deepEqual(ground, [
    'upupidae',
    'phoeniculidae',
    'bucorvidae',
    'bucerotidae',
  ])
  const buttonquail = doc.orders.find((order) =>
    order.families.some((family) => family.slug === 'turnicidae'),
  )
  assert.equal(buttonquail.scientificName, 'Charadriiformes')
  const hawks = doc.orders.find((order) =>
    order.families.some((family) => family.slug === 'accipitridae'),
  )
  assert.equal(hawks.scientificName, 'Accipitriformes')
  const falcons = doc.orders.find((order) =>
    order.families.some((family) => family.slug === 'falconidae'),
  )
  assert.equal(falcons.scientificName, 'Falconiformes')
  for (const order of doc.orders) {
    assert.ok(order.en)
    assert.ok(order.af)
    assert.match(order.scientificName, /formes$/)
  }
  const blank = doc.orders
    .flatMap((order) => order.families)
    .filter((family) => !family.af)
    .map((family) => family.slug)
    .sort()
  assert.deepEqual(blank, [
    'accipitridae',
    'acrocephalidae',
    'locustellidae',
    'macrosphenidae',
    'monarchidae',
    'nicatoridae',
    'phylloscopidae',
  ])
})

test('the home page embeds the tree and does not add a species link in the markup', async () => {
  const doc = await readJson('data/index/taxonomy.json')
  const html = renderHomeHtml({
    origin: 'https://birds.truter.world',
    speciesIndex: await readJson('data/index/species.json'),
    familiesIndex: await readJson('data/index/families.json'),
    taxonomy: doc,
  })
  assert.match(html, /<h2 id="taxonomy-heading">Interactive taxonomy<\/h2>/)
  assert.match(html, /IOC World Bird List \(v15\.2\)/)
  assert.match(html, /id="taxonomy-data"/)
  assert.match(html, /Orders start closed/)
  assert.match(html, /Bucorvidae/)
  const payload = taxonomyPayload(doc)
  const embedded = html.match(
    /<script type="application\/json" id="taxonomy-data">([\s\S]*?)<\/script>/,
  )
  assert.ok(embedded)
  assert.deepEqual(JSON.parse(embedded[1]), payload)
  assert.equal(payload.orders.length, 27)
  assert.equal(
    payload.orders.reduce(
      (sum, order) =>
        sum +
        order.families.reduce(
          (inner, family) => inner + family.species.length,
          0,
        ),
      0,
    ),
    493,
  )
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
  assert.equal((main.match(/href="\/family\/[^"]+"/g) || []).length, 86)
  assert.doesNotMatch(main, /href="\/species\//)
  const ordersFile = JSON.parse(
    await readFile(
      new URL('../data/taxonomy/orders.json', import.meta.url),
      'utf8',
    ),
  )
  assert.equal(ordersFile.orders.length, 27)
})
