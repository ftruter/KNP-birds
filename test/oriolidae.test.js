import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the three orioles are sourced without changing populations', async () => {
  const family = await readJson('data/family/oriolidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 3)
  assert.equal(family.commonNames.af, 'Wielewale')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 18560)
  assert.equal(family.population.high, 74240)

  const african = await readJson('data/species/oriolus-auratus.json')
  assert.equal(african.status, 'summer-migrant')
  assert.equal(african.monthsPresent, undefined)
  assert.equal(african.population.estimate.low, 128)
  assert.equal(african.population.estimate.high, 512)
  assert.equal(african.population.kemp.paperName, 'African Golden Oriole')
  assert.equal(african.population.kemp.status, 'NB')
  assert.equal(african.research.needsReview, true)
  assert.equal(african.calls[0].recordings[0].key, 'xeno-canto/XC660762')

  const black = await readJson('data/species/oriolus-larvatus.json')
  assert.equal(black.status, 'resident')
  assert.equal(black.monthsPresent.length, 12)
  assert.equal(black.population.estimate.low, 16384)
  assert.equal(black.population.estimate.high, 65536)
  assert.equal(black.population.kemp.paperName, 'Blackheaded Oriole')
  assert.equal(black.population.kemp.status, 'RB')
  assert.equal(black.images[0].license, 'CC BY-NC 4.0')

  const eurasian = await readJson('data/species/oriolus-oriolus.json')
  assert.equal(eurasian.status, 'summer-migrant')
  assert.equal(eurasian.monthsPresent, undefined)
  assert.equal(eurasian.population.kemp.paperName, 'European Golden Oriole')
  assert.equal(eurasian.population.kemp.status, 'NB')
  assert.equal(eurasian.population.estimate.low, 2048)
  assert.equal(eurasian.population.estimate.high, 8192)
  assert.equal(
    overlay.species['oriolus-oriolus'].calls[0].quality['xeno-canto/XC244231'],
    'A',
  )
  assert.equal(
    overlay.species['oriolus-larvatus'].calls[0].quality[
      'xeno-canto/XC1149414'
    ],
    'A',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
