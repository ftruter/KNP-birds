import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('both monarchs are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/monarchidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const paradise = await readJson('data/species/terpsiphone-viridis.json')
  const blue = await readJson('data/species/trochocercus-cyanomelas.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, undefined)
  assert.equal(family.population.low, 8196)
  assert.equal(family.population.high, 32784)
  assert.equal(paradise.population.kemp.paperName, 'Paradise Flycatcher')
  assert.equal(paradise.population.kemp.status, 'VB')
  assert.equal(paradise.population.estimate.low, 8192)
  assert.equal(paradise.size.lengthCm.max, 41)
  assert.equal(blue.population.kemp.paperName, 'Bluemantled Flycatcher')
  assert.equal(blue.population.kemp.status, 'NB')
  assert.equal(blue.population.estimate.low, 4)
  assert.equal(paradise.calls[0].recordings[0].key, 'xeno-canto/XC1080072')
  assert.equal(blue.calls[0].recordings[0].key, 'xeno-canto/XC416342')
  assert.equal(
    overlay.species['terpsiphone-viridis'].calls[0].quality[
      'xeno-canto/XC1080072'
    ],
    'A',
  )
  assert.equal(
    overlay.species['trochocercus-cyanomelas'].calls[0].quality[
      'xeno-canto/XC416342'
    ],
    'A',
  )
  for (const bird of [paradise, blue]) {
    assert.equal(bird.monthsPresent.length, 12)
    assert.match(bird.images[0].caption, /Kruger/)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
  }
})
