import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('all twelve bushshrikes are sourced without changing populations', async () => {
  const family = await readJson('data/family/malaconotidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 12)
  assert.equal(family.commonNames.af, 'Boslaksmanne')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 227409)
  assert.equal(family.population.high, 909636)

  const expected = {
    'chlorophoneus-nigrifrons': [1, 4, 'Blackfronted Bushshrike', 'NB'],
    'chlorophoneus-olivaceus': [64, 256, 'Olive Bushshrike', 'RB'],
    'chlorophoneus-sulfureopectus': [
      16384,
      65536,
      'Orangebreasted Bushshrike',
      'RB',
    ],
    'dryoscopus-cubla': [65536, 262144, 'Puffback', 'RB'],
    'laniarius-atrococcineus': [16, 64, 'Crimsonbreasted Shrike', 'VB'],
    'laniarius-ferrugineus': [32768, 131072, 'Southern Boubou', 'RB'],
    'laniarius-major': [4096, 16384, 'Tropical Boubou', 'RB'],
    'malaconotus-blanchoti': [8192, 32768, 'Greyheaded Bushshrike', 'RB'],
    'nilaus-afer': [32768, 131072, 'Brubru', 'RB'],
    'tchagra-australis': [32768, 131072, 'Threestreaked Tchagra', 'RB'],
    'tchagra-senegalus': [32768, 131072, 'Blackcrowned Tchagra', 'RB'],
    'telophorus-viridis': [2048, 8192, 'Gorgeous Bushshrike', 'RB'],
  }
  for (const [slug, [low, high, paper, status]] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.equal(bird.population.estimate.low, low, slug)
    assert.equal(bird.population.estimate.high, high, slug)
    assert.equal(bird.population.kemp.paperName, paper, slug)
    assert.equal(bird.population.kemp.status, status, slug)
    assert.equal(bird.calls.length, 1, slug)
    assert.equal(bird.viewNotes.length >= 5, true, slug)
    assert.equal(
      overlay.species[slug].calls[0].quality[bird.calls[0].recordings[0].key],
      'A',
      slug,
    )
  }
  const blackfront = await readJson(
    'data/species/chlorophoneus-nigrifrons.json',
  )
  assert.equal(blackfront.images.length, 0)
  const olive = await readJson('data/species/chlorophoneus-olivaceus.json')
  assert.equal(olive.size, undefined)
  assert.equal(olive.research.needsReview, true)
  const gorgeous = await readJson('data/species/telophorus-viridis.json')
  assert.equal(gorgeous.scientificName, 'Telophorus viridis')
  assert.equal(gorgeous.research.needsReview, true)
  const tropical = await readJson('data/species/laniarius-major.json')
  assert.equal(tropical.scientificName, 'Laniarius major')
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
