import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Common Buttonquail is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/turnicidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/turnix-sylvaticus.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Kwarteltjie')
  assert.equal(family.population.low, 262144)
  assert.equal(family.population.high, 1048576)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.min, 15)
  assert.equal(bird.population.kemp.paperName, 'Kurrichane Buttonquail')
  assert.equal(bird.population.kemp.status, 'VB')
  assert.equal(bird.population.estimate.low, 262144)
  assert.equal(bird.population.estimate.high, 1048576)
  assert.equal(bird.variants[0].marks.underparts.breast, 'buff')
  assert.equal(bird.images.length, 1)
  assert.match(bird.images[0].caption, /Kruger/)
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC405435')
  assert.equal(
    overlay.species['turnix-sylvaticus'].calls[0].quality[
      'xeno-canto/XC405435'
    ],
    'B',
  )
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  assert.doesNotMatch(
    JSON.stringify(bird),
    /#VALUE!|endangered|vulnerable|least concern|red list/i,
  )
})
