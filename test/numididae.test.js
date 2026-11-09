import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both guineafowl are sourced without changing populations', async () => {
  const family = await readJson('data/family/numididae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Tarentaal')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 33280)
  assert.equal(family.population.high, 133120)

  const crest = await readJson('data/species/guttera-edouardi.json')
  assert.equal(crest.status, 'resident')
  assert.equal(crest.monthsPresent.length, 12)
  assert.equal(crest.population.estimate.low, 512)
  assert.equal(crest.population.estimate.high, 2048)
  assert.equal(crest.population.kemp.paperName, 'Crested Guineafowl')
  assert.equal(crest.population.kemp.status, 'RB')
  assert.equal(crest.scientificName, 'Guttera edouardi')
  assert.equal(crest.images[0].license, 'CC BY 4.0')
  assert.equal(crest.calls[0].recordings[0].key, 'xeno-canto/XC237779')

  const helm = await readJson('data/species/numida-meleagris.json')
  assert.equal(helm.status, 'resident')
  assert.equal(helm.population.estimate.low, 32768)
  assert.equal(helm.population.estimate.high, 131072)
  assert.equal(helm.population.kemp.paperName, 'Helmeted Guineafowl')
  assert.equal(helm.population.kemp.status, 'RB')
  assert.equal(helm.size.lengthCm.min, 53)
  assert.equal(helm.size.lengthCm.max, 58)
  assert.equal(helm.variants.length, 4)
  assert.equal(
    overlay.species['numida-meleagris'].calls[0].quality['xeno-canto/XC126240'],
    'A',
  )
  assert.equal(
    overlay.species['guttera-edouardi'].calls[0].quality['xeno-canto/XC237779'],
    'A',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
