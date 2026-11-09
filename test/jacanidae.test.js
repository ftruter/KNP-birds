import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both jacanas are sourced without changing populations', async () => {
  const family = await readJson('data/family/jacanidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Langtoon')
  assert.equal(family.population.complete, true)
  const african = await readJson('data/species/actophilornis-africanus.json')
  assert.equal(african.status, 'resident')
  assert.equal(african.monthsPresent.length, 12)
  assert.equal(african.population.estimate.low, 1024)
  assert.equal(african.population.estimate.high, 4096)
  assert.equal(african.population.kemp.paperName, 'African Jacana')
  assert.equal(african.population.kemp.status, 'VB')
  assert.equal(african.images.length, 1)
  const lesser = await readJson('data/species/microparra-capensis.json')
  assert.equal(lesser.status, undefined)
  assert.equal(lesser.population.estimate.low, 8)
  assert.equal(lesser.population.estimate.high, 32)
  assert.equal(lesser.population.kemp.paperName, 'Lesser Jacana')
  assert.equal(lesser.population.kemp.status, 'NB')
  assert.equal(
    overlay.species['microparra-capensis'].calls[0].quality[
      'xeno-canto/XC585195'
    ],
    'C',
  )
  assert.equal(
    overlay.species['actophilornis-africanus'].calls[0].quality[
      african.calls[0].recordings[0].key
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
