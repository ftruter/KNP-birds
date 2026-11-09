import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the four sparrows are sourced without changing populations', async () => {
  const family = await readJson('data/family/passeridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 4)
  assert.equal(family.commonNames.af, 'Mossies')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 3)
  assert.equal(family.population.speciesTotal, 4)
  assert.equal(family.population.low, 77824)
  assert.equal(family.population.high, 311296)

  const pet = await readJson('data/species/gymnoris-superciliaris.json')
  assert.equal(pet.status, undefined)
  assert.equal(pet.monthsPresent, undefined)
  assert.equal(pet.variants.length, 0)
  assert.equal(pet.scientificName, 'Gymnoris superciliaris')
  assert.equal(pet.population.kemp.paperName, 'Yellowthroated Sparrow')
  assert.equal(pet.population.kemp.status, 'RB')
  assert.equal(pet.population.estimate.low, 8192)
  assert.equal(pet.calls[0].recordings[0].key, 'xeno-canto/XC421072')

  const grey = await readJson('data/species/passer-diffusus.json')
  assert.equal(grey.status, 'resident')
  assert.equal(grey.monthsPresent.length, 12)
  assert.equal(grey.population.kemp.paperName, 'Greyheaded Sparrow')
  assert.equal(grey.population.estimate.low, 65536)
  assert.equal(grey.population.estimate.high, 262144)

  const house = await readJson('data/species/passer-domesticus.json')
  assert.equal(house.status, 'resident')
  assert.equal(house.size.lengthCm.min, 14)
  assert.equal(house.population.kemp.paperName, 'House Sparrow')
  assert.equal(house.population.kemp.status, 'RB')
  assert.equal(house.population.estimate.low, 4096)
  assert.equal(house.population.estimate.high, 16384)

  const cape = await readJson('data/species/passer-melanurus.json')
  assert.equal(cape.status, 'resident')
  assert.equal(cape.population.kemp, undefined)
  assert.equal(cape.population.estimate.low, null)
  assert.equal(cape.population.estimate.high, null)
  assert.equal(cape.images[0].sex, 'mixed')
  assert.equal(
    overlay.species['passer-melanurus'].calls[0].quality['xeno-canto/XC126129'],
    'A',
  )
  assert.equal(
    overlay.species['passer-diffusus'].calls[0].quality['xeno-canto/XC526375'],
    'A',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
