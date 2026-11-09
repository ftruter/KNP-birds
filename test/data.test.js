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
  deriveCredits,
  familyPopulation,
  iconicSpecies,
  NO_MEDIA_NOTE,
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
  const speciesIndex = await readJson('data/index/species.json')
  const familyKeys = Object.keys(familiesIndex).map(
    (name) => `family/${name.trim().toLowerCase().replaceAll(' ', '-')}`,
  )
  const speciesKeys = Object.keys(speciesIndex).map(
    (name) => `species/${name.trim().toLowerCase().replaceAll(' ', '-')}`,
  )
  assert.equal(familyKeys.length, 86)
  assert.equal(speciesKeys.length, 493)
  const entries = await collectEntries()
  const keys = entries.map((entry) => entry.key).sort()
  assert.deepEqual(
    keys.filter((key) => key.startsWith('family/')),
    familyKeys.slice().sort(),
  )
  assert.deepEqual(
    keys.filter((key) => key.startsWith('species/')),
    speciesKeys.slice().sort(),
  )
  assert.deepEqual(
    keys.filter(
      (key) => !key.startsWith('family/') && !key.startsWith('species/'),
    ),
    ['index/credits', 'index/families', 'index/species', 'vocab/colours'],
  )
  for (const entry of entries) {
    const data = JSON.parse(entry.value)
    assert.equal(
      validate(data),
      true,
      `${entry.key} ${ajv.errorsText(validate.errors)}`,
    )
    if (entry.key === 'index/species' || entry.key === 'index/families') {
      const names = Object.keys(data)
      const sorted = names
        .slice()
        .sort(
          (a, b) =>
            a.localeCompare(b, 'en', { sensitivity: 'base' }) ||
            a.localeCompare(b, 'en'),
        )
      assert.deepEqual(names, sorted, `${entry.key} key order`)
      for (const value of Object.values(data)) {
        assert.deepEqual(Object.keys(value), ['en', 'af', 'population'])
      }
    } else if (entry.key !== 'index/credits') {
      const sourcedFamily = new Set([
        'coraciidae',
        'alcedinidae',
        'accipitridae',
        'acrocephalidae',
        'alaudidae',
        'anatidae',
        'anhingidae',
        'apodidae',
        'ardeidae',
        'bucerotidae',
        'bucorvidae',
        'buphagidae',
        'burhinidae',
        'campephagidae',
        'caprimulgidae',
        'charadriidae',
        'ciconiidae',
        'cisticolidae',
        'coliidae',
        'columbidae',
        'corvidae',
        'cuculidae',
        'dicruridae',
        'emberizidae',
        'estrildidae',
        'falconidae',
        'fringillidae',
        'glareolidae',
        'heliornithidae',
        'hirundinidae',
        'indicatoridae',
        'jacanidae',
        'laniidae',
        'laridae',
        'leiothrichidae',
        'malaconotidae',
        'meropidae',
        'motacillidae',
        'musophagidae',
        'nectariniidae',
        'nicatoridae',
        'numididae',
        'oriolidae',
        'otididae',
        'pandionidae',
        'paridae',
        'passeridae',
        'pelecanidae',
        'phalacrocoracidae',
        'phasianidae',
        'phoenicopteridae',
        'phoeniculidae',
        'phylloscopidae',
        'picidae',
        'platysteiridae',
        'ploceidae',
        'podicipedidae',
        'psittacidae',
        'pteroclidae',
        'pycnonotidae',
        'rallidae',
      ])
      const sourced =
        (data.kind === 'family' && sourcedFamily.has(data.slug)) ||
        (data.kind === 'species' && sourcedFamily.has(data.family))
      assert.equal(data.sampleData, !sourced, entry.key)
    }
  }
  for (const slug of ['icthyophaga-vocifer', 'bucorvus-leadbeateri']) {
    const species = await readJson(`data/species/${slug}.json`)
    const unknown = collectColourTokens(species).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], `${slug} uses colours outside the vocabulary`)
  }
  const fishEagle = await readJson('data/species/icthyophaga-vocifer.json')
  assert.equal(fishEagle.sampleData, false)
  assert.ok(fishEagle.images.length > 0)
  assert.equal(fishEagle.population.unit, 'matureIndividuals')
  assert.equal(fishEagle.population.estimate.low, 64)
  assert.equal(fishEagle.population.estimate.high, 256)
  assert.equal(fishEagle.population.tierApplied, 'D')
  assert.equal(fishEagle.calls.length, 1)
  assert.equal(fishEagle.variants.length, 2)
  const hornbill = await readJson('data/species/bucorvus-leadbeateri.json')
  assert.equal(hornbill.images.length, 1)
  assert.equal(hornbill.sampleData, false)
  assert.equal(hornbill.population.unit, 'groups')
  assert.equal(hornbill.population.estimate.low, 180)
  assert.equal(hornbill.population.estimate.high, 180)
  assert.equal(hornbill.population.tierApplied, 'A')
  assert.equal(hornbill.population.kempBaseline.estimate.low, 128)
  assert.equal(hornbill.population.kempBaseline.estimate.high, 512)
  assert.equal(hornbill.calls.length, 1)
  assert.equal(hornbill.variants.length, 3)
  const roller = await readJson('data/species/coracias-caudatus.json')
  assert.equal(roller.sampleData, false)
  assert.equal(roller.population.estimate.low, 8192)
  assert.equal(roller.population.estimate.high, 32768)
  assert.equal(roller.population.unit, 'matureIndividuals')
  assert.equal(roller.population.trend, 'unknown')
  assert.equal(roller.population.confidence, 'low')
  assert.equal(roller.population.asOf, 2001)
  assert.equal(roller.population.tierApplied, 'D')
  assert.equal(roller.population.kemp.threshold, 16384)
  assert.ok(roller.population.sources.length > 0)
  assert.equal(roller.sources.length, 8)
  assert.equal(roller.images.length, 4)
  assert.equal(roller.calls.length, 2)
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
  assert.deepEqual(await readJson('data/index/credits.json'), derived.credits)
  assert.equal(Object.keys(committedFamilies).length, 86)
  assert.equal(committedFamilies.Accipitridae.en, 'Hawks, eagles and kites')
  assert.equal(committedFamilies.Accipitridae.af, null)
  assert.ok(committedFamilies.Accipitridae.population > 0)
  assert.equal(committedFamilies.Bucorvidae.population, 0)
  assert.equal(committedFamilies.Coraciidae.population, 47400)
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
    const counted = family.population.speciesCounted
    const total = family.population.speciesTotal
    assert.equal(family.population.complete, total > 0 && counted === total)
    assert.ok(family.species.length >= 1, family.slug)
    if (counted === 0) {
      assert.equal(family.population.low, null)
      assert.equal(family.population.high, null)
      assert.deepEqual(family.iconicSpecies, [])
    }
  }
  const rollers = derived.families.find(
    (family) => family.slug === 'coraciidae',
  )
  assert.deepEqual(rollers.population, {
    low: 18960,
    high: 75840,
    speciesCounted: 5,
    speciesTotal: 5,
    complete: true,
  })
  assert.deepEqual(rollers.iconicSpecies, [
    'coracias-caudatus',
    'coracias-garrulus',
    'coracias-naevius',
  ])
  const hornbills = derived.families.find(
    (family) => family.slug === 'bucorvidae',
  )
  assert.equal(hornbills.population.speciesCounted, 0)
  assert.equal(hornbills.population.complete, false)
  const hawks = derived.families.find(
    (family) => family.slug === 'accipitridae',
  )
  assert.equal(hawks.population.speciesCounted, 36)
  assert.equal(hawks.population.speciesTotal, 40)
  assert.equal(hawks.population.complete, false)
  assert.equal(hawks.iconicSpecies.includes('gyps-africanus'), false)
  assert.equal(hawks.iconicSpecies.includes('polemaetus-bellicosus'), false)
  const speciesKeys = Object.keys(derived.speciesIndex)
  assert.equal(speciesKeys.length, 493)
  assert.equal(derived.speciesIndex['Coracias caudatus'].population, 20480)
  assert.equal(derived.speciesIndex['Bucorvus leadbeateri'].population, null)
  assert.equal(
    derived.speciesIndex['Icthyophaga vocifer'].en,
    'African Fish Eagle',
  )
  assert.equal(derived.speciesIndex['Icthyophaga vocifer'].population, 160)
  assert.equal(derived.speciesIndex['Haliaeetus vocifer'], undefined)
  assert.equal(derived.speciesIndex['Coraciidae'], undefined)
  const unknownIndex = Object.values(derived.speciesIndex).filter(
    (value) => value.population == null,
  )
  assert.equal(unknownIndex.length, 44)
})

test('the derived species index matches the committed index and every species family exists', async () => {
  const { species, families } = await readCatalog()
  const derived = deriveAll(species, families)
  assert.deepEqual(
    await readJson('data/index/species.json'),
    derived.speciesIndex,
  )
  const familySlugs = new Set(families.map((family) => family.slug))
  assert.equal(familySlugs.size, 86)
  for (const bird of species) {
    assert.equal(familySlugs.has(bird.family), true, bird.slug)
    assert.equal(
      bird.family,
      bird.family.trim().toLowerCase().replaceAll(' ', '-'),
    )
  }
  assert.equal(species.length, 493)
  assert.equal(Object.keys(derived.speciesIndex).length, 493)
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
    assert.equal(derived.speciesIndex['Coracias caudatus'].population, 20480)
    assert.deepEqual(
      derived.speciesIndex,
      await readJson('data/index/species.json'),
    )
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(dataDir, 'index/credits.json'), 'utf8'),
      ),
      derived.credits,
    )
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
          unit: 'matureIndividuals',
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

test('family totals add only mature individuals and stay partial when a species is left out', () => {
  const mature = {
    population: {
      estimate: { low: 8, high: 32 },
      unit: 'matureIndividuals',
    },
  }
  const groups = {
    population: { estimate: { low: 180, high: 180 }, unit: 'groups' },
  }
  const breedingPairs = {
    population: { estimate: { low: 25, high: 30 }, unit: 'breedingPairs' },
  }
  const territories = {
    population: { estimate: { low: 100, high: 100 }, unit: 'territories' },
  }
  const missing = {
    population: { estimate: { low: null, high: null }, unit: null },
  }
  assert.deepEqual(
    familyPopulation([mature, groups, breedingPairs, territories, missing]),
    {
      low: 8,
      high: 32,
      speciesCounted: 1,
      speciesTotal: 5,
      complete: false,
    },
  )
  assert.deepEqual(familyPopulation([mature, mature]), {
    low: 16,
    high: 64,
    speciesCounted: 2,
    speciesTotal: 2,
    complete: true,
  })
  assert.deepEqual(familyPopulation([groups]), {
    low: null,
    high: null,
    speciesCounted: 0,
    speciesTotal: 1,
    complete: false,
  })
})

test('iconic species are the top three by population and stay empty when none is known', () => {
  const bird = (slug, scientificName, low, high, unit) => ({
    slug,
    scientificName,
    population: { estimate: { low, high }, unit },
  })
  const ranked = iconicSpecies([
    bird('few', 'Zzz zzz', 1, 1, 'matureIndividuals'),
    bird('many', 'Mmm mmm', 10, 12, 'matureIndividuals'),
    bird('mid', 'Qqq qqq', 4, 4, 'matureIndividuals'),
    bird('also', 'Rrr rrr', 3, 3, 'matureIndividuals'),
    bird('groups', 'Aaa groups', 1000, 1000, 'groups'),
    bird('pairs', 'Bbb pairs', 1000, 1000, 'breedingPairs'),
    bird('none-b', 'Bbb bbb', null, null, null),
    bird('none-a', 'Aaa aaa', null, null, null),
  ])
  assert.deepEqual(ranked, ['many', 'mid', 'also'])
  assert.deepEqual(
    iconicSpecies([
      bird('none-b', 'Bbb bbb', null, null, null),
      bird('none-a', 'Aaa aaa', null, null, null),
    ]),
    [],
  )
})

test('credits follow images, recordings, and population sources', () => {
  const roller = {
    slug: 'coracias-caudatus',
    scientificName: 'Coracias caudatus',
    commonNames: { en: 'Lilac-breasted Roller', af: 'Gewone Troupant' },
    images: [
      {
        key: 'rollers/adult.jpg',
        author: 'A. Photographer',
        license: 'CC BY 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
        source: 'https://example.com/photo',
        aiGenerated: true,
      },
      {
        key: 'rollers/side.jpg',
        author: 'A. Painter',
        licence: 'CC0',
        license: 'CC BY 4.0',
        sourceUrl: 'https://example.com/side',
        source: 'https://example.com/ignored',
        aiGenerated: false,
      },
    ],
    calls: [
      {
        type: 'call',
        recordings: [
          {
            key: 'calls/rattle.mp3',
            author: '',
            license: '',
            source: 'not a url',
            aiGenerated: true,
          },
        ],
      },
      { type: 'song', recordings: [{ source: 'https://example.com/no-key' }] },
    ],
    population: {
      sources: [
        {
          title: 'A field note',
          url: 'https://example.com/note',
          publisher: 'Example',
          year: 2010,
        },
        { title: '   ', url: null, publisher: null, year: null },
      ],
    },
  }
  const empty = {
    slug: 'aaa-aaa',
    scientificName: 'Aaa aaa',
    commonNames: { en: 'Empty Bird' },
    images: [],
    calls: [{ type: 'song', recordings: [] }],
    population: { sources: [] },
  }
  const later = {
    slug: 'aaa-bbb',
    scientificName: 'Aaa bbb',
    commonNames: { en: 'Earlier Bird' },
    images: [],
    calls: [],
    population: {
      sources: [
        { title: 'Only a citation', url: null, publisher: null, year: null },
      ],
    },
  }
  const credits = deriveCredits([roller, empty, later])
  assert.equal(credits.mediaNote, null)
  assert.deepEqual(
    credits.species.map((species) => species.scientificName),
    ['Aaa bbb', 'Coracias caudatus'],
  )
  assert.equal(credits.species[1].commonName, 'Lilac-breasted Roller')
  assert.equal(credits.species[1].images[0].aiGenerated, true)
  assert.equal(credits.species[1].images[0].licence, 'CC BY 4.0')
  assert.equal(
    credits.species[1].images[0].sourceUrl,
    'https://example.com/photo',
  )
  assert.equal(credits.species[1].images[1].licence, 'CC0')
  assert.equal(
    credits.species[1].images[1].sourceUrl,
    'https://example.com/side',
  )
  assert.equal(credits.species[1].images[1].aiGenerated, false)
  assert.deepEqual(credits.species[1].recordings[0], {
    key: 'calls/rattle.mp3',
    author: null,
    licence: null,
    licenceUrl: null,
    sourceUrl: 'not a url',
    aiGenerated: true,
    callType: 'call',
  })
  assert.equal(credits.species[1].recordings.length, 1)
  assert.deepEqual(credits.species[1].sources, [
    {
      title: 'A field note',
      url: 'https://example.com/note',
      publisher: 'Example',
      year: 2010,
    },
  ])
  assert.equal(credits.species[0].images.length, 0)
  assert.equal(credits.species[0].sources[0].title, 'Only a citation')
  const none = deriveCredits([empty])
  assert.equal(none.mediaNote, NO_MEDIA_NOTE)
  assert.deepEqual(none.species, [])
  assert.equal(none.site.maintainer, 'ftruter')
  assert.equal(none.site.repository, 'https://github.com/ftruter/KNP-birds')
  assert.equal(none.site.licence, 'Apache-2.0')
  assert.equal(none.taxonomy.authority, 'IOC / BirdLife South Africa')
  const birda = none.dataSources.find((source) =>
    source.name.startsWith('Birda'),
  )
  const wikipedia = none.dataSources.find((source) =>
    source.name.startsWith('Wikipedia'),
  )
  assert.equal(birda.licence, null)
  assert.equal(birda.licenceUrl, null)
  assert.equal(wikipedia.licence, 'CC BY-SA 4.0')
  assert.equal(
    none.dataSources.filter((source) => source.licence == null).length,
    6,
  )
  const kemp = none.dataSources.find((source) => source.name.startsWith('Kemp'))
  assert.ok(kemp)
  assert.match(kemp.usedFor, /T\/2 to 2T/)
  assert.equal(kemp.licence, null)
  assert.equal(kemp.links[0].label, 'Sabinet archive PDF')
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

test('Kemp estimates cover mapped species and leave ambiguous rows unsourced', async () => {
  const { species } = await readCatalog()
  const unsourcedNote =
    'No sourced Kruger estimate is currently available; taxonomy or later records require separate research.'
  const withFigure = species.filter(
    (bird) => bird.population.estimate.low != null,
  )
  const without = species.filter((bird) => bird.population.estimate.low == null)
  assert.equal(species.length, 493)
  assert.equal(withFigure.length, 453)
  assert.equal(without.length, 40)
  const tierA = withFigure.filter((bird) => bird.population.tierApplied === 'A')
  const tierD = withFigure.filter((bird) => bird.population.tierApplied === 'D')
  assert.equal(tierA.length, 4)
  assert.equal(tierD.length, 449)
  assert.deepEqual(tierA.map((bird) => bird.scientificName).sort(), [
    'Bucorvus leadbeateri',
    'Ephippiorhynchus senegalensis',
    'Gyps africanus',
    'Polemaetus bellicosus',
  ])
  for (const bird of tierA) {
    const baseline = bird.population.kempBaseline
    const kemp = bird.population.kemp
    assert.equal(baseline.unit, 'matureIndividuals')
    assert.equal(baseline.estimate.low, kemp.threshold / 2)
    assert.equal(baseline.estimate.high, kemp.threshold * 2)
    assert.equal(2 ** kemp.thresholdExponent, kemp.threshold)
    assert.notEqual(bird.population.unit, 'matureIndividuals')
    assert.ok(bird.population.sources.some((source) => source.year === 2001))
    assert.ok(
      bird.population.sources.some(
        (source) => source.year !== 2001 || source.year == null,
      ),
    )
  }
  for (const bird of tierD) {
    const kemp = bird.population.kemp
    assert.equal(bird.population.unit, 'matureIndividuals', bird.slug)
    assert.equal(bird.population.confidence, 'low', bird.slug)
    assert.equal(bird.population.asOf, 2001, bird.slug)
    assert.equal(bird.population.estimate.low, kemp.threshold / 2, bird.slug)
    assert.equal(bird.population.estimate.high, kemp.threshold * 2, bird.slug)
    assert.equal(2 ** kemp.thresholdExponent, kemp.threshold, bird.slug)
    assert.equal(bird.population.kempBaseline, undefined, bird.slug)
    assert.equal(bird.population.sources.length, 1, bird.slug)
    assert.match(bird.population.sources[0].title, /Kemp A\.C\./)
    assert.match(bird.population.notes, /half–double/)
  }
  for (const bird of without) {
    assert.equal(bird.population.estimate.high, null, bird.slug)
    assert.equal(bird.population.unit, null, bird.slug)
    assert.equal(bird.population.notes, unsourcedNote, bird.slug)
    assert.deepEqual(bird.population.sources, [], bird.slug)
    assert.equal(bird.population.kemp, undefined, bird.slug)
    assert.equal(bird.population.tierApplied, undefined, bird.slug)
  }
  const marsh = species.find((bird) => bird.slug === 'acrocephalus-palustris')
  assert.equal(marsh.population.kemp.paperName, 'European Marsh Warbler')
  assert.equal(marsh.population.kemp.threshold, 1024)
  assert.match(marsh.population.notes, /different taxon and is not used/)
  const harrier = species.find((bird) => bird.slug === 'circus-ranivorus')
  assert.equal(harrier.population.kemp.paperName, 'African Marsh Harrier')
  assert.equal(harrier.population.kemp.threshold, 4)
  const kite = species.find((bird) => bird.slug === 'milvus-migrans')
  assert.equal(kite.population.kemp.paperName, 'Black Kite')
  assert.equal(kite.population.estimate.low, 128)
  for (const slug of [
    'tockus-rufirostris',
    'anthoscopus-caroli',
    'buteo-buteo',
    'ardea-brachyrhyncha',
  ]) {
    const bird = species.find((item) => item.slug === slug)
    assert.equal(bird.population.estimate.low, null, slug)
  }
  const media = {
    'coracias-caudatus': [4, 2],
    'coracias-garrulus': [2, 2],
    'coracias-naevius': [3, 2],
    'coracias-spatulatus': [2, 1],
    'eurystomus-glaucurus': [2, 1],
  }
  for (const [slug, counts] of Object.entries(media)) {
    const bird = species.find((item) => item.slug === slug)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.images.length, counts[0], slug)
    assert.equal(bird.calls.length, counts[1], slug)
    assert.ok(bird.sources.length > 0, slug)
  }
  const stork = species.find(
    (bird) => bird.slug === 'ephippiorhynchus-senegalensis',
  )
  assert.equal(stork.population.unit, 'breedingPairs')
  assert.deepEqual(stork.population.estimate, { low: 25, high: 30 })
  const martial = species.find((bird) => bird.slug === 'polemaetus-bellicosus')
  assert.equal(martial.population.unit, 'territories')
  assert.deepEqual(martial.population.estimate, { low: 100, high: 100 })
  const vulture = species.find((bird) => bird.slug === 'gyps-africanus')
  assert.deepEqual(vulture.population.estimate, { low: 742, high: 1066 })
  const lappet = species.find((bird) => bird.slug === 'torgos-tracheliotos')
  assert.equal(lappet.population.tierApplied, 'D')
  assert.equal(lappet.population.kemp.threshold, 64)
})
