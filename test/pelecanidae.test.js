import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both pelicans are sourced without changing populations', async () => {
  const family = await readJson('data/family/pelecanidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Pelikane')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 5)
  assert.equal(family.population.high, 20)

  const white = await readJson('data/species/pelecanus-onocrotalus.json')
  assert.equal(white.status, 'resident')
  assert.equal(white.monthsPresent.length, 12)
  assert.equal(white.size.lengthCm.min, 180)
  assert.equal(white.population.estimate.low, 1)
  assert.equal(white.population.estimate.high, 4)
  assert.equal(white.population.kemp.paperName, 'White Pelican')
  assert.equal(white.population.kemp.status, 'NB')
  assert.equal(white.calls[0].recordings[0].key, 'xeno-canto/XC343693')
  assert.equal(white.research.needsReview, true)

  const pink = await readJson('data/species/pelecanus-rufescens.json')
  assert.equal(pink.status, 'resident')
  assert.equal(pink.monthsPresent, undefined)
  assert.equal(pink.size.lengthCm.min, 135)
  assert.equal(pink.population.estimate.low, 4)
  assert.equal(pink.population.estimate.high, 16)
  assert.equal(pink.population.kemp.paperName, 'Pinkbacked Pelican')
  assert.equal(pink.population.kemp.status, 'NB')
  assert.equal(pink.research.needsReview, true)
  assert.equal(
    overlay.species['pelecanus-rufescens'].calls[0].quality[
      'xeno-canto/XC862719'
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
