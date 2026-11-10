import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Secretarybird is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/sagittariidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/sagittarius-serpentarius.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Sekretarisvoël')
  assert.equal(family.population.low, 128)
  assert.equal(family.population.high, 512)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.max, 150)
  assert.equal(bird.population.kemp.paperName, 'Secretarybird')
  assert.equal(bird.population.kemp.status, 'VB')
  assert.equal(bird.population.estimate.low, 128)
  assert.equal(bird.variants[0].marks.head.face, 'orange')
  assert.equal(bird.variants[1].marks.head.face, 'yellow')
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC505982')
  assert.equal(
    overlay.species['sagittarius-serpentarius'].calls[0].quality[
      'xeno-canto/XC505982'
    ],
    'B',
  )
  assert.match(bird.images[0].caption, /Kruger/)
  assert.equal(bird.images[0].license, 'CC BY-NC 4.0')
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  assert.doesNotMatch(
    bird.summary + bird.habitat + bird.images[0].caption,
    /vulnerable|endangered|least concern|near threatened|red list/i,
  )
})
