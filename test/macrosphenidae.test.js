import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the African warblers are sourced without inventing a grassbird population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/macrosphenidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const grass = await readJson('data/species/sphenoeacus-afer.json')
  const crombec = await readJson('data/species/sylvietta-rufescens.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, undefined)
  assert.equal(family.population.low, 131072)
  assert.equal(family.population.high, 524288)
  assert.equal(family.population.complete, false)
  assert.equal(grass.population.kemp, undefined)
  assert.equal(grass.population.estimate.low, null)
  assert.equal(grass.size.lengthCm.min, 19)
  assert.equal(grass.calls[0].recordings[0].license, 'CC BY-NC-SA 3.0')
  assert.equal(crombec.population.kemp.paperName, 'Longbilled Crombec')
  assert.equal(crombec.population.estimate.low, 131072)
  assert.match(crombec.images[0].caption, /Kruger/)
  assert.equal(grass.images[0].caption.includes('Kruger'), false)
  assert.equal(
    overlay.species['sphenoeacus-afer'].calls[0].quality['xeno-canto/XC28640'],
    'A',
  )
  assert.equal(
    overlay.species['sylvietta-rufescens'].calls[0].quality[
      'xeno-canto/XC368190'
    ],
    'A',
  )
  for (const bird of [grass, crombec]) {
    assert.equal(bird.monthsPresent.length, 12)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
  }
})
