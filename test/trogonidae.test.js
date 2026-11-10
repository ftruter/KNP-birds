import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Narina Trogon is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/trogonidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/apaloderma-narina.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Bosloerie')
  assert.equal(family.population.low, 256)
  assert.equal(family.population.high, 1024)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.max, 34)
  assert.equal(bird.population.kemp.paperName, 'Narina Trogon')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.population.estimate.low, 256)
  assert.equal(bird.variants[0].marks.underparts.belly, 'red')
  assert.equal(bird.variants[1].marks.underparts.breast, null)
  assert.equal(bird.images.length, 1)
  assert.match(bird.images[0].caption, /Kruger/)
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC607366')
  assert.equal(
    overlay.species['apaloderma-narina'].calls[0].quality[
      'xeno-canto/XC607366'
    ],
    'A',
  )
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
})
