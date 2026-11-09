import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both cormorants are sourced without changing populations', async () => {
  const family = await readJson('data/family/phalacrocoracidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Duikers')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 96)
  assert.equal(family.population.high, 384)

  const reed = await readJson('data/species/microcarbo-africanus.json')
  assert.equal(reed.status, 'resident')
  assert.equal(reed.monthsPresent.length, 12)
  assert.equal(reed.size.lengthCm.min, 60)
  assert.equal(reed.population.estimate.low, 64)
  assert.equal(reed.population.estimate.high, 256)
  assert.equal(reed.population.kemp.paperName, 'Reed Cormorant')
  assert.equal(reed.population.kemp.status, 'RB')
  assert.equal(reed.calls[0].recordings[0].key, 'xeno-canto/XC860402')
  assert.equal(reed.images[0].age, 'immature')

  const white = await readJson('data/species/phalacrocorax-carbo.json')
  assert.equal(white.status, 'resident')
  assert.equal(white.scientificName, 'Phalacrocorax carbo')
  assert.equal(white.size.lengthCm.min, 90)
  assert.equal(white.population.estimate.low, 32)
  assert.equal(white.population.estimate.high, 128)
  assert.equal(white.population.kemp.paperName, 'Whitebreasted Cormorant')
  assert.equal(white.population.kemp.status, 'RB')
  assert.equal(white.images[0].license, 'CC BY 4.0')
  assert.equal(
    overlay.species['phalacrocorax-carbo'].calls[0].quality[
      'xeno-canto/XC323326'
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
