import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('Southern Black Tit is sourced without changing its population', async () => {
  const family = await readJson('data/family/paridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 1)
  assert.equal(family.commonNames.af, 'Mese')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 8192)
  assert.equal(family.population.high, 32768)

  const tit = await readJson('data/species/melaniparus-niger.json')
  assert.equal(tit.status, 'resident')
  assert.equal(tit.monthsPresent.length, 12)
  assert.equal(tit.scientificName, 'Melaniparus niger')
  assert.equal(tit.size.lengthCm.min, 16)
  assert.equal(tit.population.estimate.low, 8192)
  assert.equal(tit.population.estimate.high, 32768)
  assert.equal(tit.population.kemp.paperName, 'Southern Black Tit')
  assert.equal(tit.population.kemp.status, 'RB')
  assert.equal(tit.research.needsReview, true)
  assert.equal(tit.calls[0].recordings[0].key, 'xeno-canto/XC368162')
  assert.equal(
    overlay.species['melaniparus-niger'].calls[0].quality[
      'xeno-canto/XC368162'
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
