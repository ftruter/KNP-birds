import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('the go-away-bird and Knysna Turaco are sourced without changing populations', async () => {
  const family = await readJson('data/family/musophagidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Loeries')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 1)
  assert.equal(family.population.low, 32768)
  assert.equal(family.population.high, 131072)

  const grey = await readJson('data/species/crinifer-concolor.json')
  assert.equal(grey.status, 'resident')
  assert.equal(grey.monthsPresent.length, 12)
  assert.equal(grey.population.estimate.low, 32768)
  assert.equal(grey.population.estimate.high, 131072)
  assert.equal(grey.population.kemp.paperName, 'Grey Lourie')
  assert.equal(grey.population.kemp.status, 'RB')
  assert.equal(grey.images.length, 1)
  assert.equal(grey.calls[0].recordings[0].key, 'xeno-canto/XC208606')
  assert.equal(
    overlay.species[grey.slug].calls[0].quality['xeno-canto/XC208606'],
    'A',
  )

  const knysna = await readJson('data/species/tauraco-corythaix.json')
  assert.equal(knysna.status, 'resident')
  assert.equal(knysna.population.estimate.low, null)
  assert.equal(knysna.population.estimate.high, null)
  assert.equal(knysna.population.kemp, undefined)
  assert.equal(knysna.images.length, 0)
  assert.equal(knysna.calls[0].recordings[0].key, 'xeno-canto/XC1161576')
  assert.equal(
    overlay.species[knysna.slug].calls[0].quality['xeno-canto/XC1161576'],
    'A',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
