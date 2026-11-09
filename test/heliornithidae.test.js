import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the African Finfoot is sourced without changing its population', async () => {
  const family = await readJson('data/family/heliornithidae.json')
  const bird = await readJson('data/species/podica-senegalensis.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 1)
  assert.equal(family.commonNames.af, 'Watertrapper')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 128)
  assert.equal(family.population.high, 512)
  assert.equal(bird.sampleData, false)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.population.estimate.low, 128)
  assert.equal(bird.population.estimate.high, 512)
  assert.equal(bird.population.kemp.paperName, 'African Finfoot')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.images.length, 1)
  assert.equal(bird.images[0].license, 'CC0 1.0')
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC642694')
  assert.equal(
    overlay.species['podica-senegalensis'].calls[0].quality[
      'xeno-canto/XC642694'
    ],
    'B',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
