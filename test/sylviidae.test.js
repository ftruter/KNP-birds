import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('both sylviid warblers are sourced without inventing a whitethroat population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/sylviidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const throat = await readJson('data/species/curruca-communis.json')
  const garden = await readJson('data/species/sylvia-borin.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Sangers')
  assert.equal(family.population.low, 2048)
  assert.equal(family.population.high, 8192)
  assert.equal(family.population.complete, false)
  assert.equal(throat.status, 'palearctic-migrant')
  assert.equal('monthsPresent' in throat, false)
  assert.equal(throat.size, undefined)
  assert.equal(throat.population.estimate.low, null)
  assert.equal(throat.population.kemp, undefined)
  assert.equal(throat.variants[0].marks.head.crown, 'grey')
  assert.equal(throat.images.length, 1)
  assert.equal(throat.calls[0].recordings[0].key, 'xeno-canto/XC931937')
  assert.equal(garden.status, 'summer-migrant')
  assert.equal('monthsPresent' in garden, false)
  assert.equal(garden.size.lengthCm.min, 15)
  assert.equal(garden.population.kemp.paperName, 'Garden Warbler')
  assert.equal(garden.population.kemp.status, 'NB')
  assert.equal(garden.population.estimate.low, 2048)
  assert.equal(garden.calls[0].type, 'song')
  assert.equal(garden.calls[0].recordings[0].key, 'xeno-canto/XC904341')
  assert.match(garden.images[0].caption, /Kruger/)
  assert.equal(
    overlay.species['curruca-communis'].calls[0].quality['xeno-canto/XC931937'],
    'A',
  )
  assert.equal(
    overlay.species['sylvia-borin'].calls[0].quality['xeno-canto/XC904341'],
    'A',
  )
  for (const bird of [throat, garden]) {
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
    assert.doesNotMatch(
      JSON.stringify(bird),
      /#VALUE!|endangered|vulnerable|red list/i,
    )
  }
})
