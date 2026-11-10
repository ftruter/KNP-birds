import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Hamerkop is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/scopidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/scopus-umbretta.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Hamerkop')
  assert.equal(family.population.low, 512)
  assert.equal(family.population.high, 2048)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.min, 56)
  assert.equal(bird.scientificName, 'Scopus umbretta')
  assert.equal(bird.population.kemp.paperName, 'Hamerkop')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.population.estimate.low, 512)
  assert.equal(bird.population.estimate.high, 2048)
  assert.equal(bird.variants[0].marks.bill.colour, 'black')
  assert.equal(bird.variants[0].marks.legs.colour, 'black')
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC983782')
  assert.equal(
    overlay.species['scopus-umbretta'].calls[0].quality['xeno-canto/XC983782'],
    'A',
  )
  assert.equal(bird.images[0].license, 'CC BY 4.0')
  assert.match(bird.images[0].caption, /Kruger/)
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  assert.doesNotMatch(
    bird.summary + bird.habitat + bird.research.note,
    /vulnerable|endangered|least concern|near threatened|red list/i,
  )
})
