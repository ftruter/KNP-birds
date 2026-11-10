import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the grassbirds and allies are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/locustellidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const rush = await readJson('data/species/bradypterus-baboecala.json')
  const barratt = await readJson('data/species/bradypterus-barratti.json')
  const fan = await readJson('data/species/catriscus-brevirostris.json')
  const river = await readJson('data/species/locustella-fluviatilis.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, undefined)
  assert.equal(family.population.low, 1088)
  assert.equal(family.population.high, 4352)
  assert.equal(family.population.complete, false)
  assert.equal(rush.population.kemp.paperName, 'African Sedge Warbler')
  assert.equal(rush.population.estimate.low, 1024)
  assert.equal(rush.monthsPresent.length, 12)
  assert.equal(barratt.population.kemp, undefined)
  assert.equal(barratt.population.estimate.low, null)
  assert.equal(fan.population.kemp.paperName, 'Broadtailed Warbler')
  assert.equal(fan.monthsPresent, undefined)
  assert.equal(fan.size, undefined)
  assert.equal(river.population.kemp.status, 'NB')
  assert.equal(river.status, 'palearctic-migrant')
  assert.equal(river.monthsPresent, undefined)
  assert.equal(rush.calls[0].recordings[0].key, 'xeno-canto/XC397750')
  assert.equal(barratt.calls[0].recordings[0].key, 'xeno-canto/XC368199')
  assert.equal(fan.calls[0].recordings[0].key, 'xeno-canto/XC930050')
  assert.equal(river.calls[0].recordings[0].key, 'xeno-canto/XC575434')
  assert.equal(
    overlay.species['catriscus-brevirostris'].calls[0].quality[
      'xeno-canto/XC930050'
    ],
    'A',
  )
  let kruger = 0
  for (const bird of [rush, barratt, fan, river]) {
    if (bird.images[0].caption.includes('Kruger')) kruger += 1
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
  }
  assert.equal(kruger, 1)
})
