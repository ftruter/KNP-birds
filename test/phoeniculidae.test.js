import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both wood-hoopoes are sourced without changing populations', async () => {
  const family = await readJson('data/family/phoeniculidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Kakelaars')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 16384)
  assert.equal(family.population.high, 65536)

  const green = await readJson('data/species/phoeniculus-purpureus.json')
  assert.equal(green.status, 'resident')
  assert.equal(green.monthsPresent.length, 12)
  assert.equal(green.size.lengthCm.min, 30)
  assert.equal(green.size.lengthCm.max, 36)
  assert.equal(green.population.kemp.paperName, 'Redbilled Woodhoopoe')
  assert.equal(green.population.kemp.status, 'RB')
  assert.equal(green.population.estimate.low, 8192)
  assert.equal(green.population.estimate.high, 32768)
  assert.equal(green.calls[0].recordings[0].key, 'xeno-canto/XC301399')
  assert.equal(green.research.needsReview, true)

  const scim = await readJson('data/species/rhinopomastus-cyanomelas.json')
  assert.equal(scim.status, 'resident')
  assert.equal(scim.population.kemp.paperName, 'Scimitarbilled Woodhoopoe')
  assert.equal(scim.population.kemp.status, 'RB')
  assert.equal(scim.population.estimate.low, 8192)
  assert.equal(scim.images[0].license, 'CC BY 4.0')
  assert.equal(
    overlay.species['rhinopomastus-cyanomelas'].calls[0].quality[
      'xeno-canto/XC467724'
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
