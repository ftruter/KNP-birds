import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('both mousebirds are sourced without changing populations', async () => {
  const family = await readJson('data/family/coliidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Muisvoëls')
  const expected = {
    'colius-striatus': [8192, 32768, 'Speckled Mousebird', 'RB'],
    'urocolius-indicus': [8192, 32768, 'Redfaced Mousebird', 'RB'],
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
    assert.equal(bird.images[0].caption, bird.images[0].alt, slug)
    assert.equal(
      overlay.species[slug].calls[0].quality[bird.calls[0].recordings[0].key],
      'A',
    )
  }
})
