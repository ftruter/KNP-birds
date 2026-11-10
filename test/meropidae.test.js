import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('all six bee-eaters are sourced without changing populations', async () => {
  const family = await readJson('data/family/meropidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 6)
  assert.equal(family.commonNames.af, 'Byvreters')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 11282)
  assert.equal(family.population.high, 45128)

  const expected = {
    'merops-apiaster': [1024, 4096, 'European Bee-eater', 'NB'],
    'merops-bullockoides': [4096, 16384, 'Whitefronted Bee-eater', 'RB'],
    'merops-hirundineus': [2, 8, 'Swallowtailed Bee-eater', 'NB'],
    'merops-nubicoides': [2048, 8192, 'Carmine Bee-eater', 'NB'],
    'merops-persicus': [16, 64, 'Bluecheeked Bee-eater', 'NB'],
    'merops-pusillus': [4096, 16384, 'Little Bee-eater', 'RB'],
  }
  for (const [slug, [low, high, paper, status]] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.population.estimate.low, low, slug)
    assert.equal(bird.population.estimate.high, high, slug)
    assert.equal(bird.population.kemp.paperName, paper, slug)
    assert.equal(bird.population.kemp.status, status, slug)
    assert.equal(bird.images.length, 1, slug)
    assert.equal(bird.calls.length, 1, slug)
    assert.equal(
      overlay.species[slug].calls[0].quality[bird.calls[0].recordings[0].key],
      'A',
      slug,
    )
  }
  const european = await readJson('data/species/merops-apiaster.json')
  assert.equal(european.status, undefined)
  assert.equal(european.monthsPresent, undefined)
  const carmine = await readJson('data/species/merops-nubicoides.json')
  assert.equal(carmine.status, 'intra-african-migrant')
  const blue = await readJson('data/species/merops-persicus.json')
  assert.equal(blue.status, 'palearctic-migrant')
  assert.equal(blue.research.confidence, 'low')
  assert.equal(blue.research.needsReview, true)
  const little = await readJson('data/species/merops-pusillus.json')
  assert.equal(little.status, 'resident')
  assert.equal(little.monthsPresent.length, 12)
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
