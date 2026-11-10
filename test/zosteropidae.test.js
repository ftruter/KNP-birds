import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Southern Yellow White-eye is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/zosteropidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/zosterops-anderssoni.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Glasogie')
  assert.equal(family.population.low, 2048)
  assert.equal(family.population.high, 8192)
  assert.equal(bird.scientificName, 'Zosterops anderssoni')
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent, undefined)
  assert.equal(bird.size.lengthCm.min, 10.5)
  assert.equal(bird.population.kemp.paperName, 'Yellow White-eye')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.population.estimate.low, 2048)
  assert.equal(bird.variants[0].marks.underparts.belly, 'yellow')
  assert.equal(bird.variants[0].marks.eye.ring, 'white')
  assert.match(bird.images[0].caption, /Kruger/)
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC660759')
  assert.equal(
    overlay.species['zosterops-anderssoni'].calls[0].quality[
      'xeno-canto/XC660759'
    ],
    'A',
  )
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
})
