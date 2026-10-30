import assert from 'node:assert/strict'
import Ajv from 'ajv/dist/2020.js'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { collectColourTokens } from '../src/marks.js'
import {
  collectEntries,
  deriveAll,
  familyPopulation,
  iconicSpecies,
  readCatalog,
  writeDerived,
} from '../scripts/seed.mjs'
import { readJson } from './helpers.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('every data file matches the schema, slugs, and colour vocabulary', async () => {
  const schema = JSON.parse(
    await readFile(path.join(root, 'docs/content.schema.json'), 'utf8'),
  )
  const ajv = new Ajv({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  assert.ok(vocab.colours.length >= 30 && vocab.colours.length <= 40)
  for (const colour of vocab.colours) {
    assert.equal(colour.ridgway, null)
    assert.equal(colour.smithe, null)
    assert.match(colour.hex, /^#[0-9A-Fa-f]{6}$/)
  }
  const familiesIndex = await readJson('data/index/families.json')
  const familyKeys = Object.keys(familiesIndex).map(
    (name) => `family/${name.trim().toLowerCase().replaceAll(' ', '-')}`,
  )
  assert.equal(familyKeys.length, 86)
  const entries = await collectEntries()
  const keys = entries.map((entry) => entry.key).sort()
  assert.deepEqual(
    keys.filter((key) => key.startsWith('family/')),
    familyKeys.slice().sort(),
  )
  assert.deepEqual(
    keys.filter((key) => !key.startsWith('family/')),
    [
      'index/families',
      'index/species',
      'species/bucorvus-leadbeateri',
      'species/coracias-caudatus',
      'species/haliaeetus-vocifer',
      'vocab/colours',
    ],
  )
  for (const entry of entries) {
    const data = JSON.parse(entry.value)
    assert.equal(
      validate(data),
      true,
      `${entry.key} ${ajv.errorsText(validate.errors)}`,
    )
    if (entry.key.startsWith('index/')) {
      const keys = Object.keys(data)
      const sorted = keys
        .slice()
        .sort(
          (a, b) =>
            a.localeCompare(b, 'en', { sensitivity: 'base' }) ||
            a.localeCompare(b, 'en'),
        )
      assert.deepEqual(keys, sorted, `${entry.key} key order`)
      for (const value of Object.values(data)) {
        assert.deepEqual(Object.keys(value), ['en', 'af', 'population'])
      }
    } else {
      assert.equal(data.sampleData, true, entry.key)
    }
  }
  for (const slug of [
    'coracias-caudatus',
    'haliaeetus-vocifer',
    'bucorvus-leadbeateri',
  ]) {
    const species = await readJson(`data/species/${slug}.json`)
    const unknown = collectColourTokens(species).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], `${slug} uses colours outside the vocabulary`)
    assert.equal(species.population.estimate.low, null)
    assert.equal(species.population.estimate.high, null)
    assert.equal(species.population.trend, 'unknown')
    assert.equal(species.population.notes, 'to be researched')
    assert.deepEqual(species.population.sources, [])
    assert.equal(species.population.unit, null)
    assert.equal(species.population.asOf, null)
    assert.equal(species.images.length, 0)
  }
})

test('derived family and index fields match the species files', async () => {
  const { species, families } = await readCatalog()
  const derived = deriveAll(species, families)
  for (const family of derived.families) {
    assert.deepEqual(
      await readJson(`data/family/${family.slug}.json`),
      family,
      family.slug,
    )
  }
  assert.deepEqual(
    await readJson('data/index/species.json'),
    derived.speciesIndex,
  )
  const committedFamilies = await readJson('data/index/families.json')
  assert.deepEqual(committedFamilies, derived.familiesIndex)
  assert.equal(Object.keys(committedFamilies).length, 86)
  for (const value of Object.values(committedFamilies))
    assert.equal(value.population, 0)
  assert.deepEqual(committedFamilies.Accipitridae, {
    en: 'Hawks, eagles and kites',
    af: null,
    population: 0,
  })
  assert.equal(committedFamilies.Bucorvidae.af, 'Bromvoëls')
  assert.equal(committedFamilies.Coraciidae.af, 'Troupante')
  assert.deepEqual(
    Object.keys(committedFamilies).filter(
      (name) => committedFamilies[name].af === null,
    ),
    [
      'Accipitridae',
      'Acrocephalidae',
      'Locustellidae',
      'Macrosphenidae',
      'Monarchidae',
      'Nicatoridae',
      'Phylloscopidae',
    ],
  )
  for (const family of derived.families) {
    assert.equal(family.population.complete, false)
    assert.equal(family.population.speciesCounted, 0)
    assert.equal(family.population.low, null)
    assert.equal(family.population.high, null)
    assert.deepEqual(
      family.iconicSpecies,
      family.species.map((item) => item.slug),
    )
  }
  const speciesKeys = Object.keys(derived.speciesIndex)
  assert.deepEqual(speciesKeys, [
    'Bucorvus leadbeateri',
    'Coracias caudatus',
    'Haliaeetus vocifer',
  ])
  assert.equal(derived.speciesIndex['Coracias caudatus'].population, null)
  assert.equal(derived.speciesIndex['Coraciidae'], undefined)
})

test('seed --write reproduces the committed families index and keeps unknown species populations null', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'knp-seed-'))
  try {
    const dataDir = path.join(dir, 'data')
    await cp(path.join(root, 'data'), dataDir, { recursive: true })
    const derived = await writeDerived(dataDir)
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(dataDir, 'index/families.json'), 'utf8'),
      ),
      await readJson('data/index/families.json'),
    )
    assert.deepEqual(
      derived.familiesIndex,
      await readJson('data/index/families.json'),
    )
    assert.equal(derived.speciesIndex['Coracias caudatus'].population, null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a known species midpoint is kept and an uncounted family stays at 0', () => {
  const derived = deriveAll(
    [
      {
        slug: 'coracias-caudatus',
        scientificName: 'Coracias caudatus',
        commonNames: { en: 'Lilac-breasted Roller' },
        family: 'coraciidae',
        population: {
          estimate: { low: 10, high: 20 },
          unit: 'individuals',
        },
      },
    ],
    [
      {
        slug: 'alcedinidae',
        scientificName: 'Alcedinidae',
        commonNames: { en: 'Kingfishers' },
        summary: 'Field notes for this family are still to be written.',
        sampleData: true,
      },
      {
        slug: 'coraciidae',
        scientificName: 'Coraciidae',
        commonNames: { en: 'Rollers', af: 'Troupante' },
        summary: 'Rollers.',
        sampleData: true,
      },
    ],
  )
  assert.equal(derived.familiesIndex.Alcedinidae.population, 0)
  assert.equal(derived.familiesIndex.Alcedinidae.af, null)
  assert.equal(derived.familiesIndex.Coraciidae.population, 15)
  assert.equal(derived.speciesIndex['Coracias caudatus'].population, 15)
})

test('family totals count pairs as two individuals and stay incomplete while any species has no estimate', () => {
  const pairs = {
    population: { estimate: { low: 10, high: 12 }, unit: 'pairs' },
  }
  const breedingPairs = {
    population: { estimate: { low: 3, high: 4 }, unit: 'breeding pairs' },
  }
  const individuals = {
    population: { estimate: { low: 5, high: 5 }, unit: 'individuals' },
  }
  const missing = {
    population: { estimate: { low: null, high: null }, unit: null },
  }
  assert.deepEqual(familyPopulation([pairs, individuals, missing]), {
    low: 25,
    high: 29,
    speciesCounted: 2,
    speciesTotal: 3,
    complete: false,
  })
  assert.deepEqual(familyPopulation([breedingPairs]), {
    low: 6,
    high: 8,
    speciesCounted: 1,
    speciesTotal: 1,
    complete: true,
  })
  assert.deepEqual(familyPopulation([missing]), {
    low: null,
    high: null,
    speciesCounted: 0,
    speciesTotal: 1,
    complete: false,
  })
})

test('iconic species put the highest midpoint first and cap the list at three', () => {
  const bird = (slug, scientificName, low, high, unit) => ({
    slug,
    scientificName,
    population: { estimate: { low, high }, unit },
  })
  const ranked = iconicSpecies([
    bird('few', 'Zzz zzz', 1, 1, 'individuals'),
    bird('many', 'Mmm mmm', 10, 12, 'pairs'),
    bird('none-b', 'Bbb bbb', null, null, null),
    bird('none-a', 'Aaa aaa', null, null, null),
  ])
  assert.deepEqual(ranked, ['many', 'few', 'none-a'])
})

test('family lists and indexes agree', async () => {
  const speciesIndex = await readJson('data/index/species.json')
  const { families } = await readCatalog()
  const speciesSlugs = Object.keys(speciesIndex)
    .map((name) => name.trim().toLowerCase().replaceAll(' ', '-'))
    .sort()
  const fromFamilies = families
    .flatMap((family) => family.species.map((species) => species.slug))
    .sort()
  assert.deepEqual(speciesSlugs, fromFamilies)
  assert.equal(families.length, 86)
})
