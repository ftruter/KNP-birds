import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the Arrow-marked Babbler is sourced without changing its population', async () => {
  const family = await readJson('data/family/leiothrichidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  const bird = await readJson('data/species/turdoides-jardineii.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 1)
  assert.equal(family.commonNames.af, 'Katlagters')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 32768)
  assert.equal(family.population.high, 131072)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.sampleData, false)
  assert.equal(bird.population.estimate.low, 32768)
  assert.equal(bird.population.estimate.high, 131072)
  assert.equal(bird.population.kemp.paperName, 'Arrowmarked Babbler')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.variants.length, 2)
  assert.equal(bird.images.length, 1)
  assert.equal(bird.images[0].license, 'CC BY 4.0')
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC368185')
  assert.equal(
    overlay.species[bird.slug].calls[0].quality['xeno-canto/XC368185'],
    'A',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
