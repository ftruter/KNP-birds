import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import Ajv from 'ajv/dist/2020.js'
import {
  PARK_REGIONS,
  deriveFacts,
  distributionLabel,
  factsCells,
  flightLabel,
  massLabel,
  regionIds,
  wingspanLabel,
} from '../src/facts.js'
import { renderSpeciesHtml } from '../src/html.js'
import { renderSpeciesMarkdown } from '../src/markdown.js'
import { llmsTxt } from '../src/static.js'
import { colourMapFromDoc } from '../src/store.js'
import { handleRequest } from '../src/worker.js'
import {
  loadStore,
  mockBucket,
  mockKv,
  readJson,
  requestContext,
} from './helpers.js'

const origin = 'https://birds.example'

const site = async () => {
  const { records } = await loadStore()
  const env = { BIRDS_KV: mockKv(records).kv, IMAGES: mockBucket().bucket }
  return (pathname) =>
    handleRequest(new Request(origin + pathname), env, requestContext())
}

/** A real species file with the new fields added, so the renderers see a full document. */
const sample = async (extra) => {
  const doc = await readJson('data/species/gyps-africanus.json')
  delete doc.distribution
  delete doc.flightless
  doc.size = { lengthCm: doc.size.lengthCm }
  return { ...doc, ...extra }
}

const render = async (doc) => {
  const colourMap = colourMapFromDoc(await readJson('data/vocab/colours.json'))
  return {
    html: renderSpeciesHtml({
      origin,
      doc,
      colourMap,
      imagesAvailable: {},
      format: String,
    }),
    md: renderSpeciesMarkdown({ doc, colourMap, origin, format: String }),
  }
}

test('labels state only what is recorded', () => {
  assert.equal(
    wingspanLabel({ wingspanCm: { min: 196, max: 225 } }),
    '196–225 cm',
  )
  assert.equal(wingspanLabel({ wingspanCm: { min: 60, max: 60 } }), '60 cm')
  assert.equal(wingspanLabel({ lengthCm: { min: 1, max: 2 } }), '')
  assert.equal(
    massLabel({ massG: { min: 4000, max: 7200 } }),
    '4000–7200 g (4–7.2 kg)',
  )
  assert.equal(massLabel({ massG: { min: 11, max: 14 } }), '11–14 g')
  assert.equal(massLabel(undefined), '')
  assert.equal(flightLabel(true), 'Flightless')
  assert.equal(flightLabel(false), 'Flies')
  assert.equal(flightLabel(undefined), '')
})

test('regions come out north to south, and unknown names are dropped', () => {
  assert.deepEqual(
    PARK_REGIONS.map((region) => region.id),
    ['far-north', 'north', 'central', 'south'],
  )
  assert.deepEqual(
    regionIds({ regions: ['south', 'far-north', 'south', 'west'] }),
    ['far-north', 'south'],
  )
  assert.equal(
    distributionLabel({ regions: ['south', 'far-north'] }),
    'Far north, south',
  )
  assert.equal(
    distributionLabel({
      regions: ['south', 'central', 'north', 'far-north'],
      note: 'Commonest in the south.',
    }),
    'All four regions. Commonest in the south.',
  )
  assert.equal(
    distributionLabel({ note: 'Luvuvhu River only.' }),
    'Luvuvhu River only.',
  )
  assert.equal(distributionLabel(undefined), '')
  // The bands meet without a gap and cover the park's box.
  for (let i = 1; i < PARK_REGIONS.length; i++)
    assert.equal(PARK_REGIONS[i].lat.north, PARK_REGIONS[i - 1].lat.south)
})

test('a facts row copies what the species file records and nulls the rest', async () => {
  const full = await sample({
    size: {
      lengthCm: { min: 90, max: 98 },
      wingspanCm: { min: 196, max: 225 },
      massG: { min: 4000, max: 7200 },
    },
    flightless: false,
    distribution: { regions: ['south', 'central'] },
  })
  const bare = {
    slug: 'aaa-bbb',
    scientificName: 'Aaa bbb',
    commonNames: { en: 'Aardvark Bird' },
    family: 'accipitridae',
    population: { estimate: { low: null, high: null }, unit: null },
  }
  const facts = deriveFacts([full, bare])
  assert.equal(facts.kind, 'facts')
  assert.deepEqual(
    facts.species.map((row) => row.en),
    ['Aardvark Bird', 'White-backed Vulture'],
  )
  assert.deepEqual(facts.species[0], {
    slug: 'aaa-bbb',
    scientificName: 'Aaa bbb',
    en: 'Aardvark Bird',
    family: 'accipitridae',
    status: null,
    lengthCm: null,
    wingspanCm: null,
    massG: null,
    flightless: null,
    population: { low: null, high: null, unit: null },
    regions: null,
    regionsNote: null,
  })
  const vulture = facts.species[1]
  assert.deepEqual(vulture.wingspanCm, { min: 196, max: 225 })
  assert.deepEqual(vulture.massG, { min: 4000, max: 7200 })
  assert.equal(vulture.flightless, false)
  assert.deepEqual(vulture.regions, ['central', 'south'])
  // The population is the species file's own, never converted.
  assert.deepEqual(vulture.population, {
    low: full.population.estimate.low,
    high: full.population.estimate.high,
    unit: 'breedingPairs',
  })
  assert.deepEqual(factsCells(vulture), {
    status: 'Resident',
    length: '90–98',
    wingspan: '196–225',
    mass: '4000–7200',
    flight: 'Flies',
    population: '742–1066 breeding pairs',
    regions: 'Central, South',
    regionsNote: '',
  })
  assert.deepEqual(
    Object.values(factsCells(facts.species[0])).filter(Boolean),
    [],
  )
})

test('the species page shows the new fields in HTML and Markdown, and nothing when they are absent', async () => {
  const plain = await render(await sample({}))
  for (const label of ['Wingspan', 'Mass', 'Flight', 'Where in Kruger']) {
    assert.doesNotMatch(plain.html, new RegExp(`<dt>${label}</dt>`), label)
    assert.doesNotMatch(plain.md, new RegExp(`^- ${label}:`, 'm'), label)
  }
  const doc = await sample({
    size: {
      lengthCm: { min: 90, max: 98 },
      wingspanCm: { min: 196, max: 225 },
      massG: { min: 4000, max: 7200 },
    },
    flightless: true,
    distribution: {
      regions: ['central', 'south'],
      note: 'Nests along the Sabie & Olifants <rivers>.',
    },
  })
  const { html, md } = await render(doc)
  assert.match(html, /<dt>Wingspan<\/dt><dd>196–225 cm<\/dd>/)
  assert.match(html, /<dt>Mass<\/dt><dd>4000–7200 g \(4–7\.2 kg\)<\/dd>/)
  assert.match(html, /<dt>Flight<\/dt><dd>Flightless<\/dd>/)
  assert.match(
    html,
    /<dt>Where in Kruger<\/dt><dd>Central, south\. Nests along the Sabie &amp; Olifants &lt;rivers&gt;\.<\/dd>/,
  )
  assert.match(md, /^- Wingspan: 196–225 cm$/m)
  assert.match(md, /^- Mass: 4000–7200 g \(4–7\.2 kg\)$/m)
  assert.match(md, /^- Flight: Flightless$/m)
  assert.match(md, /^- Where in Kruger: Central, south\. Nests along/m)
})

test('the schema takes the new fields and refuses a region outside the vocabulary', async () => {
  const schema = JSON.parse(
    await readFile(
      new URL('../docs/content.schema.json', import.meta.url),
      'utf8',
    ),
  )
  const validate = new Ajv({ allErrors: true }).compile(schema)
  const base = await sample({})
  assert.equal(validate(base), true, JSON.stringify(validate.errors))
  const good = {
    ...base,
    size: {
      wingspanCm: { min: 196, max: 225 },
      massG: { min: 4000, max: 7200 },
    },
    flightless: false,
    distribution: {
      regions: ['far-north', 'south'],
      note: 'Along the Luvuvhu.',
    },
  }
  assert.equal(validate(good), true, JSON.stringify(validate.errors))
  for (const bad of [
    { distribution: { regions: ['west'] } },
    { distribution: { regions: [] } },
    { distribution: {} },
    { size: { note: 'No figure.' } },
    { size: { massG: { min: 0, max: 5 } } },
    { flightless: 'no' },
  ])
    assert.equal(validate({ ...base, ...bad }), false, JSON.stringify(bad))
})

test('/facts is served as HTML, Markdown and JSON with a row for every species', async () => {
  const fetch = await site()
  const stored = await (await fetch('/facts.json')).json()
  assert.equal(stored.kind, 'facts')
  assert.equal(stored.species.length, 493)
  assert.deepEqual(
    stored.regions.map((region) => region.id),
    ['far-north', 'north', 'central', 'south'],
  )
  assert.deepEqual(stored, await readJson('data/index/facts.json'))

  const md = await fetch('/facts.md')
  assert.equal(md.status, 200)
  assert.match(md.headers.get('content-type'), /^text\/markdown/)
  const text = await md.text()
  const rows = text.split('\n').filter((line) => line.startsWith('| ['))
  assert.equal(rows.length, 493)
  assert.match(
    text,
    /^\| Species \| Scientific name \| Status \| Length \(cm\) \| Wingspan \(cm\) \| Mass \(g\) \| Flight \| Population in Kruger \(approximate\) \| Regions of the park \| Where it is recorded most \|$/m,
  )
  const vulture = stored.species.find((row) => row.slug === 'gyps-africanus')
  const cells = factsCells(vulture)
  const line = rows.find((row) => row.includes('/species/gyps-africanus)'))
  assert.equal(
    line,
    `| [White-backed Vulture](${origin}/species/gyps-africanus) | Gyps africanus | ${[cells.status, cells.length, cells.wingspan, cells.mass, cells.flight, cells.population, cells.regions, cells.regionsNote].join(' | ')} |`,
  )
  // Every row has the same number of cells, so an empty fact is an empty cell.
  for (const row of rows) assert.equal(row.split(' | ').length, 10, row)
  assert.match(text, /An empty cell means this guide does not record that fact/)
  assert.match(text, /^Of 493 species, \d+ have a length, /m)

  const page = await fetch('/facts')
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.equal(html.match(/<tr><th scope="row">/g).length, 493)
  assert.match(
    html,
    /<a href="\/species\/gyps-africanus">White-backed Vulture<\/a>/,
  )
  assert.match(
    html,
    /<link rel="alternate" type="text\/markdown" href="\/facts\.md"/,
  )
})

test('the facts page is in the sitemap and the agent guide describes the new fields', async () => {
  const fetch = await site()
  assert.match(
    await (await fetch('/sitemap.xml')).text(),
    /<loc>[^<]*\/facts<\/loc>/,
  )
  assert.match(
    await (await fetch('/sitemap.md')).text(),
    /\[Facts table\]\(https:\/\/birds\.example\/facts\)/,
  )
  const guide = llmsTxt(origin)
  for (const word of [
    'wingspanCm',
    'massG',
    'flightless',
    'distribution',
    'far-north',
    `${origin}/facts.md`,
  ])
    assert.ok(guide.includes(word), word)
})

test('no species file records a fact without the shape the schema asks for', async () => {
  // Guards the data as it is filled in: a region must be in the vocabulary,
  // and a measurement must run from min up to max.
  const { entries } = await loadStore()
  const ids = new Set(PARK_REGIONS.map((region) => region.id))
  for (const entry of entries) {
    if (!entry.key.startsWith('species/')) continue
    const doc = JSON.parse(entry.value)
    for (const field of ['lengthCm', 'wingspanCm', 'massG']) {
      const value = doc.size?.[field]
      if (value) assert.ok(value.min <= value.max, `${entry.key} ${field}`)
    }
    for (const id of doc.distribution?.regions ?? [])
      assert.ok(ids.has(id), `${entry.key} region ${id}`)
    if (
      doc.size?.wingspanCm ||
      doc.size?.massG ||
      doc.distribution ||
      'flightless' in doc
    )
      assert.ok(doc.sources?.length > 0, `${entry.key} has no sources`)
  }
})

test('the pilot family, hawks, eagles and vultures, is filled from cited sources', async () => {
  const family = await readJson('data/family/accipitridae.json')
  assert.equal(family.species.length, 40)
  const birds = await Promise.all(
    family.species.map((item) => readJson(`data/species/${item.slug}.json`)),
  )
  const has = (test) => birds.filter(test).map((bird) => bird.slug)
  // Newman's misprints the mass of these two and Wikipedia gives none.
  assert.deepEqual(
    has((bird) => !bird.size?.massG),
    ['buteo-trizonatus', 'elanus-caeruleus'],
  )
  assert.equal(has((bird) => bird.size?.wingspanCm).length, 30)
  assert.equal(has((bird) => 'flightless' in bird).length, 0)
  for (const bird of birds) {
    assert.ok(bird.distribution?.note, bird.slug)
    assert.ok(
      bird.sources.some(
        (source) =>
          source.publisher === 'GBIF.org' &&
          source.title.startsWith('GBIF occurrence counts for '),
      ),
      `${bird.slug} region source`,
    )
    if (bird.size?.wingspanCm)
      assert.ok(
        bird.sources.some((source) =>
          source.url?.startsWith('https://en.wikipedia.org/wiki/'),
        ),
        `${bird.slug} wingspan source`,
      )
    if (bird.size?.massG)
      assert.match(bird.size.note, /Mass: (Newman's Birds|Wikipedia) gives /)
  }
  const vulture = birds.find((bird) => bird.slug === 'gyps-africanus')
  assert.deepEqual(vulture.size.wingspanCm, { min: 196, max: 225 })
  assert.deepEqual(vulture.size.massG, { min: 4000, max: 7000 })
  assert.deepEqual(vulture.size.lengthCm, { min: 90, max: 98 })
  // The population is not touched by this work.
  assert.deepEqual(vulture.population.estimate, { low: 742, high: 1066 })
  assert.deepEqual(vulture.distribution.regions, [
    'far-north',
    'north',
    'central',
    'south',
  ])
  assert.match(
    vulture.distribution.note,
    /Recorded most often in the central region\.$/,
  )
  // Too few records: the region is listed, and no region is called best.
  const forest = birds.find((bird) => bird.slug === 'buteo-trizonatus')
  assert.deepEqual(forest.distribution.regions, ['south'])
  assert.doesNotMatch(forest.distribution.note, /Recorded most often/)
  // The widest wingspan in the family can now be read from the table.
  const facts = await readJson('data/index/facts.json')
  const widest = facts.species
    .filter((row) => row.wingspanCm)
    .sort((a, b) => b.wingspanCm.max - a.wingspanCm.max)[0]
  assert.equal(widest.slug, 'torgos-tracheliotos')
})
