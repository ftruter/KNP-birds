import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Common Hoopoe is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/upupidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/upupa-epops.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Hoephoep')
  assert.equal(family.population.low, 4096)
  assert.equal(family.population.high, 16384)
  assert.equal(bird.scientificName, 'Upupa epops')
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.min, 27)
  assert.equal(bird.population.kemp.paperName, 'Hoopoe')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.population.estimate.low, 4096)
  assert.equal(bird.variants[0].marks.head.crown, 'rufous')
  assert.equal(bird.images.length, 1)
  assert.match(bird.images[0].caption, /Kruger/)
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC337010')
  assert.equal(
    overlay.species['upupa-epops'].calls[0].quality['xeno-canto/XC337010'],
    'A',
  )
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
})
