import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Common Ostrich is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/struthionidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/struthio-camelus.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Volstruis')
  assert.equal(family.population.low, 128)
  assert.equal(family.population.high, 512)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.min, 200)
  assert.equal(bird.population.kemp.paperName, 'Ostrich')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.population.estimate.low, 128)
  assert.equal(bird.images.length, 1)
  assert.match(bird.images[0].caption, /Kruger/)
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC845920')
  assert.equal(
    overlay.species['struthio-camelus'].calls[0].quality['xeno-canto/XC845920'],
    'A',
  )
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  assert.doesNotMatch(JSON.stringify(bird), /#VALUE!|endangered|vulnerable/i)
})
