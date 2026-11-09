import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('all three crows are sourced without changing populations', async () => {
  const family = await readJson('data/family/corvidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 3)
  assert.equal(family.commonNames.af, 'Kraaie')
  const expected = {
    'corvus-albicollis': [2, 8, 'Whitenecked Raven', 'NB'],
    'corvus-albus': [8, 32, 'Pied Crow', 'VB'],
    'corvus-capensis': [1, 4, 'Black Crow', 'NB'],
  }
  for (const slug of Object.keys(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    const row = expected[slug]
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.equal(bird.population.estimate.low, row[0], slug)
    assert.equal(bird.population.estimate.high, row[1], slug)
    assert.equal(bird.population.kemp.paperName, row[2], slug)
    assert.equal(bird.population.kemp.status, row[3], slug)
    assert.equal(
      overlay.species[slug].calls[0].quality[bird.calls[0].recordings[0].key],
      'A',
    )
  }
  const cape = await readJson('data/species/corvus-capensis.json')
  assert.equal(cape.images.length, 0)
})
