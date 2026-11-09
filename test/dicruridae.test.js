import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both drongos are sourced without changing populations', async () => {
  const family = await readJson('data/family/dicruridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Byvanger')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 1)
  const fork = await readJson('data/species/dicrurus-adsimilis.json')
  assert.equal(fork.sampleData, false)
  assert.equal(fork.status, 'resident')
  assert.equal(fork.monthsPresent.length, 12)
  assert.equal(fork.population.estimate.low, 65536)
  assert.equal(fork.population.estimate.high, 262144)
  assert.equal(fork.population.kemp.paperName, 'Forktailed Drongo')
  assert.equal(fork.population.kemp.status, 'RB')
  assert.equal(fork.images.length, 1)
  assert.equal(
    overlay.species['dicrurus-adsimilis'].calls[0].quality[
      fork.calls[0].recordings[0].key
    ],
    'A',
  )
  const square = await readJson('data/species/dicrurus-ludwigii.json')
  assert.equal(square.population.estimate.low, null)
  assert.equal(square.population.kemp, undefined)
  assert.equal(square.monthsPresent.length, 12)
  assert.equal(square.calls[0].recordings[0].key, 'xeno-canto/XC1030331')
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
