import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Greater Painted-snipe is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/rostratulidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/rostratula-benghalensis.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Goudsnip')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 64)
  assert.equal(family.population.high, 256)
  assert.deepEqual(family.iconicSpecies, ['rostratula-benghalensis'])
  assert.equal(bird.sampleData, false)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.max, 32)
  assert.equal(bird.population.kemp.paperName, 'Painted Snipe')
  assert.equal(bird.population.kemp.status, 'VB')
  assert.equal(bird.population.estimate.low, 64)
  assert.equal(bird.calls[0].sex, 'female')
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC616415')
  assert.equal(
    overlay.species['rostratula-benghalensis'].calls[0].quality[
      'xeno-canto/XC616415'
    ],
    'B',
  )
  assert.equal(bird.images[0].license, 'CC BY 4.0')
  assert.match(bird.images[0].caption, /Kruger/)
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  assert.doesNotMatch(
    JSON.stringify({
      summary: bird.summary,
      habitat: bird.habitat,
      calls: bird.calls,
      images: bird.images,
    }),
    /vulnerable|endangered|least concern|near threatened|red list/i,
  )
})
