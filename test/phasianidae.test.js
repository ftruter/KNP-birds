import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the eight francolins and quails are sourced without changing populations', async () => {
  const family = await readJson('data/family/phasianidae.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 8)
  assert.equal(family.commonNames.af, 'Patryse')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 169985)
  assert.equal(family.population.high, 679940)

  const coqui = await readJson('data/species/campocolinus-coqui.json')
  assert.equal(coqui.status, 'resident')
  assert.equal(coqui.scientificName, 'Campocolinus coqui')
  assert.equal(coqui.population.kemp.paperName, 'Coqui Francolin')
  assert.equal(coqui.population.estimate.low, 4096)

  const common = await readJson('data/species/coturnix-coturnix.json')
  assert.equal(common.status, undefined)
  assert.equal(common.images.length, 1)
  assert.equal(common.images[0].license, 'CC BY-SA 4.0')
  assert.match(common.images[0].caption, /not Kruger/)
  assert.equal(common.population.kemp.status, 'VB')
  assert.equal(common.population.estimate.high, 32768)

  const harl = await readJson('data/species/coturnix-delegorguei.json')
  assert.equal(harl.status, 'intra-african-migrant')
  assert.equal(harl.size, undefined)
  assert.equal(harl.population.kemp.paperName, 'Harlequin Quail')
  assert.equal(harl.population.kemp.status, 'VB')
  assert.equal(harl.population.estimate.low, 131072)

  const crest = await readJson('data/species/ortygornis-sephaena.json')
  assert.equal(crest.status, 'resident')
  assert.equal(crest.scientificName, 'Ortygornis sephaena')
  assert.equal(crest.population.kemp.status, 'RB')
  assert.equal(crest.images[0].license, 'CC BY 4.0')

  const red = await readJson('data/species/pternistis-afer.json')
  assert.equal(red.status, 'resident')
  assert.equal(red.images.length, 1)
  assert.equal(red.images[0].license, 'CC BY 4.0')
  assert.match(red.images[0].caption, /not Kruger/)
  assert.equal(red.population.kemp.paperName, 'Rednecked Francolin')
  assert.equal(red.population.kemp.status, 'NB')
  assert.equal(red.population.estimate.low, 1)
  assert.equal(red.population.estimate.high, 4)

  const natal = await readJson('data/species/pternistis-natalensis.json')
  assert.equal(natal.population.kemp.paperName, 'Natal Francolin')
  assert.equal(natal.population.estimate.low, 8192)

  const swain = await readJson('data/species/pternistis-swainsonii.json')
  assert.equal(swain.population.kemp.status, 'RB')
  assert.equal(swain.images[0].license, 'CC0 1.0')
  assert.equal(swain.population.estimate.high, 32768)

  const shelley = await readJson('data/species/scleroptila-shelleyi.json')
  assert.equal(shelley.status, 'resident')
  assert.equal(shelley.population.kemp.paperName, 'Shelley’s Francolin')
  assert.equal(shelley.population.estimate.low, 2048)
  assert.equal(shelley.calls[0].recordings[0].key, 'xeno-canto/XC415830')

  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
