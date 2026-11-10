import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Western Barn Owl is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/tytonidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/tyto-alba.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Tyto-uile')
  assert.equal(family.population.low, 2048)
  assert.equal(family.population.high, 8192)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.min, 30)
  assert.equal(bird.population.kemp.paperName, 'Barn Owl')
  assert.equal(bird.population.kemp.status, 'VB')
  assert.equal(bird.population.estimate.low, 2048)
  assert.equal(bird.images.length, 1)
  assert.match(bird.images[0].caption, /Kruger/)
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC353109')
  assert.equal(
    overlay.species['tyto-alba'].calls[0].quality['xeno-canto/XC353109'],
    'A',
  )
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
})
