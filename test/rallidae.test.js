import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const DEEDS = new Set([
  'https://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/3.0/',
])

const SLUGS = [
  'aenigmatolimnas-marginalis',
  'crecopsis-egregia',
  'crex-crex',
  'fulica-cristata',
  'gallinula-chloropus',
  'paragallinula-angulata',
  'porphyrio-alleni',
  'porphyrio-porphyrio',
  'rallus-caerulescens',
  'zapornia-flavirostra',
]

const POPULATION = {
  'aenigmatolimnas-marginalis': [4, 16, 'Striped Crake', 'NB'],
  'crecopsis-egregia': [32, 128, 'African Crake', 'VB'],
  'crex-crex': [64, 256, 'Corncrake', 'NB'],
  'fulica-cristata': [4, 16, 'Redknobbed Coot', 'VB'],
  'gallinula-chloropus': [64, 256, 'Moorhen', 'VB'],
  'paragallinula-angulata': [256, 1024, 'Lesser Moorhen', 'VB'],
  'porphyrio-alleni': [8, 32, 'Lesser Gallinule', 'NB'],
  'porphyrio-porphyrio': [8, 32, 'Purple Gallinule', 'NB'],
  'rallus-caerulescens': [64, 256, 'African Rail', 'VB'],
  'zapornia-flavirostra': [2048, 8192, 'Black Crake', 'RB'],
}

const UNSET = new Set([
  'aenigmatolimnas-marginalis',
  'crecopsis-egregia',
  'crex-crex',
  'paragallinula-angulata',
  'porphyrio-alleni',
])

const GRADE_B = new Set([
  'crecopsis-egregia',
  'porphyrio-alleni',
  'rallus-caerulescens',
])

test('the ten rails are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/rallidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 10)
  assert.equal(family.commonNames.af, 'Riethane')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 2552)
  assert.equal(family.population.high, 10208)
  assert.deepEqual(family.iconicSpecies, [
    'zapornia-flavirostra',
    'paragallinula-angulata',
    'crex-crex',
  ])

  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'rallidae', slug)
    assert.equal(bird.research.needsReview, true, slug)
    if (UNSET.has(slug)) assert.equal(bird.monthsPresent, undefined, slug)
    else assert.equal(bird.monthsPresent.length, 12, slug)
    const [low, high, paper, code] = POPULATION[slug]
    assert.equal(bird.population.estimate.low, low, slug)
    assert.equal(bird.population.estimate.high, high, slug)
    assert.equal(bird.population.kemp.paperName, paper, slug)
    assert.equal(bird.population.kemp.status, code, slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.doesNotMatch(image.license, /ND/i, image.key)
      assert.match(image.caption, /Kruger/, image.key)
    }
    const item = bird.calls[0].recordings[0]
    assert.equal(item.quality, undefined, item.key)
    assert.equal(
      overlay.species[slug].calls[0].quality[item.key],
      GRADE_B.has(slug) ? 'B' : 'A',
      item.key,
    )
    const blob = JSON.stringify({
      summary: bird.summary,
      habitat: bird.habitat,
      calls: bird.calls,
      viewNotes: bird.viewNotes,
      images: bird.images,
    })
    assert.doesNotMatch(
      blob,
      /vulnerable|endangered|least concern|near threatened|red list/i,
      slug,
    )
    diffSpecies(bird)
  }

  const striped = await readJson('data/species/aenigmatolimnas-marginalis.json')
  assert.equal(striped.status, 'summer-migrant')
  assert.equal(striped.images.length, 1)
  assert.equal(striped.images[0].license, 'CC BY 4.0')
  assert.match(striped.images[0].caption, /not Kruger/)
  assert.equal(striped.calls[0].recordings[0].key, 'xeno-canto/XC355772')

  const corn = await readJson('data/species/crex-crex.json')
  assert.equal(corn.size, undefined)
  assert.equal(corn.status, 'palearctic-migrant')
  assert.equal(corn.calls[0].recordings[0].key, 'xeno-canto/XC1149182')

  const black = await readJson('data/species/zapornia-flavirostra.json')
  assert.equal(black.scientificName, 'Zapornia flavirostra')
  assert.equal(black.variants[0].marks.upperparts.back, null)
  assert.equal(black.calls[0].recordings[0].key, 'xeno-canto/XC200591')

  const swamphen = await readJson('data/species/porphyrio-porphyrio.json')
  assert.match(swamphen.research.note, /madagascariensis/)
  assert.equal(swamphen.calls[0].recordings[0].key, 'xeno-canto/XC1183526')

  const slots = report.slots.filter((slot) => SLUGS.includes(slot.slug))
  assert.equal(slots.length, 10)
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
