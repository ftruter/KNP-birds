import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the Eastern Nicator is sourced without changing its population', async () => {
  const family = await readJson('data/family/nicatoridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  const bird = await readJson('data/species/nicator-gularis.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 1)
  assert.equal(family.commonNames.en, 'Nicators')
  assert.equal(family.commonNames.af, undefined)
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 512)
  assert.equal(family.population.high, 2048)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.sampleData, false)
  assert.equal(bird.population.estimate.low, 512)
  assert.equal(bird.population.estimate.high, 2048)
  assert.equal(bird.population.kemp.paperName, 'Yellowspotted Nicator')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.size.lengthCm.min, 23)
  assert.equal(bird.images.length, 1)
  assert.equal(bird.images[0].license, 'CC BY 4.0')
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC652445')
  assert.equal(
    overlay.species[bird.slug].calls[0].quality['xeno-canto/XC652445'],
    'A',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
