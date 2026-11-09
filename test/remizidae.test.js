import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the Grey Penduline-tit is sourced without inventing a population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/remizidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/anthoscopus-caroli.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Kapokvoëls')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 0)
  assert.deepEqual(family.iconicSpecies, [])
  assert.equal(bird.sampleData, false)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.min, 8)
  assert.equal(bird.population.estimate.low, null)
  assert.equal(bird.population.kemp, undefined)
  assert.equal(bird.variants[0].marks.upperparts.back, null)
  assert.equal(bird.variants[0].marks.underparts.belly, 'buff')
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC552058')
  assert.equal(
    overlay.species['anthoscopus-caroli'].calls[0].quality[
      'xeno-canto/XC552058'
    ],
    'B',
  )
  assert.match(bird.images[0].caption, /Kruger/)
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  assert.doesNotMatch(
    bird.summary,
    /vulnerable|endangered|least concern|near threatened|red list/i,
  )
})
