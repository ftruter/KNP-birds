import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both flamingos are sourced without changing populations', async () => {
  const family = await readJson('data/family/phoenicopteridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Flaminke')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 12)
  assert.equal(family.population.high, 48)

  const lesser = await readJson('data/species/phoeniconaias-minor.json')
  assert.equal(lesser.status, undefined)
  assert.equal(lesser.scientificName, 'Phoeniconaias minor')
  assert.equal(lesser.size.lengthCm.min, 102)
  assert.equal(lesser.population.kemp.paperName, 'Lesser Flamingo')
  assert.equal(lesser.population.kemp.status, 'NB')
  assert.equal(lesser.population.estimate.low, 8)
  assert.equal(lesser.population.estimate.high, 32)
  assert.equal(lesser.images[0].license, 'CC BY 4.0')
  assert.equal(lesser.calls[0].recordings[0].key, 'xeno-canto/XC267539')

  const greater = await readJson('data/species/phoenicopterus-roseus.json')
  assert.equal(greater.status, undefined)
  assert.equal(greater.size.lengthCm.min, 140)
  assert.equal(greater.population.kemp.paperName, 'Greater Flamingo')
  assert.equal(greater.population.kemp.status, 'NB')
  assert.equal(greater.population.estimate.low, 4)
  assert.equal(greater.population.estimate.high, 16)
  assert.equal(
    overlay.species['phoenicopterus-roseus'].calls[0].quality[
      'xeno-canto/XC135154'
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
