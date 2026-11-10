import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the three bustards are sourced without changing populations', async () => {
  const family = await readJson('data/family/otididae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 3)
  assert.equal(family.commonNames.af, 'Korhane')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 12416)
  assert.equal(family.population.high, 49664)

  const kori = await readJson('data/species/ardeotis-kori.json')
  assert.equal(kori.status, 'resident')
  assert.equal(kori.monthsPresent.length, 12)
  assert.equal(kori.size.lengthCm.min, 134)
  assert.equal(kori.population.estimate.low, 128)
  assert.equal(kori.population.estimate.high, 512)
  assert.equal(kori.population.kemp.paperName, 'Kori Bustard')
  assert.equal(kori.population.kemp.status, 'RB')
  assert.equal(kori.images[0].license, 'CC0 1.0')
  assert.equal(kori.calls[0].recordings[0].key, 'xeno-canto/XC209987')

  const black = await readJson('data/species/lissotis-melanogaster.json')
  assert.equal(black.status, 'resident')
  assert.equal(black.population.estimate.low, 4096)
  assert.equal(black.population.estimate.high, 16384)
  assert.equal(black.population.kemp.paperName, 'Blackbellied Korhaan')
  assert.equal(black.population.kemp.status, 'RB')
  assert.equal(black.research.needsReview, true)
  assert.equal(black.variants.length, 2)

  const red = await readJson('data/species/lophotis-ruficrista.json')
  assert.equal(red.status, 'resident')
  assert.equal(red.monthsPresent, undefined)
  assert.equal(red.scientificName, 'Lophotis ruficrista')
  assert.equal(red.population.estimate.low, 8192)
  assert.equal(red.population.estimate.high, 32768)
  assert.equal(red.population.kemp.paperName, 'Redcrested Korhaan')
  assert.equal(red.population.kemp.status, 'RB')
  assert.equal(red.research.needsReview, true)
  assert.equal(
    overlay.species['lophotis-ruficrista'].calls[0].quality[
      'xeno-canto/XC209351'
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
