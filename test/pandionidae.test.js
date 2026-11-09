import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the Osprey is sourced without changing its population', async () => {
  const family = await readJson('data/family/pandionidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 1)
  assert.equal(family.commonNames.af, 'Visvalk')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 2)
  assert.equal(family.population.high, 8)

  const osprey = await readJson('data/species/pandion-haliaetus.json')
  assert.equal(osprey.status, 'palearctic-migrant')
  assert.equal(osprey.monthsPresent, undefined)
  assert.equal(osprey.size.lengthCm.min, 55)
  assert.equal(osprey.size.lengthCm.max, 63)
  assert.equal(osprey.population.estimate.low, 2)
  assert.equal(osprey.population.estimate.high, 8)
  assert.equal(osprey.population.kemp.paperName, 'Osprey')
  assert.equal(osprey.population.kemp.status, 'NB')
  assert.equal(osprey.research.needsReview, true)
  assert.equal(osprey.images[0].license, 'CC0 1.0')
  assert.equal(osprey.calls[0].recordings[0].key, 'xeno-canto/XC143656')
  assert.equal(
    overlay.species['pandion-haliaetus'].calls[0].quality[
      'xeno-canto/XC143656'
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
